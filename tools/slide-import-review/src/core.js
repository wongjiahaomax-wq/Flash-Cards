import {
  ReviewBundleError,
  validateReviewMap as validateReviewMapV2,
  loadReviewBundle as loadReviewBundleV2,
  readinessErrors as readinessErrorsV2,
  selectProductionManifest as selectProductionManifestV2,
  finalizeBundle as finalizeBundleV2
} from './core-v2.js';

export * from './core-v2.js';

function assertSourcePageBounds(reviewMap) {
  const pageCounts = new Map(reviewMap.sourceFiles.map(source => [source.sourceId, source.pageCount]));
  const checkRefs = (refs, label) => {
    for (const ref of refs ?? []) {
      const pageCount = pageCounts.get(ref.sourceId);
      if (!pageCount) continue;
      for (const page of ref.pages) {
        if (page > pageCount) {
          throw new ReviewBundleError(`${label} references ${ref.sourceId} page ${page}, beyond declared pageCount ${pageCount}.`);
        }
      }
    }
  };

  for (const caseReview of reviewMap.cases) {
    checkRefs(caseReview.sourceRefs, `Case ${caseReview.caseId}`);
    for (const assetReview of caseReview.assets) checkRefs(assetReview.sourceRefs, `Asset ${assetReview.assetId}`);
    for (const questionReview of caseReview.questions) {
      checkRefs(questionReview.promptSourceRefs, `Question ${questionReview.caseQuestionId} prompt`);
      checkRefs(questionReview.answerSourceRefs, `Question ${questionReview.caseQuestionId} answer`);
    }
  }
  for (const candidate of reviewMap.unresolvedQuestions) {
    checkRefs(candidate.promptSourceRefs, `Unresolved Question ${candidate.candidateId} prompt`);
    checkRefs(candidate.answerSourceRefs, `Unresolved Question ${candidate.candidateId} answer`);
  }

  const coverageKeys = new Set();
  for (const coverage of reviewMap.sourceCoverage) {
    const pageCount = pageCounts.get(coverage.sourceId);
    if (pageCount && coverage.page > pageCount) {
      throw new ReviewBundleError(`Source coverage ${coverage.sourceId} page ${coverage.page} exceeds declared pageCount ${pageCount}.`);
    }
    coverageKeys.add(`${coverage.sourceId}:${coverage.page}`);
  }
  for (const source of reviewMap.sourceFiles) {
    for (let page = 1; page <= source.pageCount; page += 1) {
      if (!coverageKeys.has(`${source.sourceId}:${page}`)) {
        throw new ReviewBundleError(`Source coverage is missing ${source.sourceId} page ${page}.`);
      }
    }
  }
}

function cloneWithoutRejectedChildren(manifest, reviewMap) {
  const clonedManifest = structuredClone(manifest);
  const clonedReviewMap = structuredClone(reviewMap);
  const caseReviews = new Map(clonedReviewMap.cases.map(item => [item.caseId, item]));

  clonedManifest.caseAssets = clonedManifest.caseAssets.filter(relation => {
    const review = caseReviews.get(relation.caseId)?.assets.find(item => item.assetId === relation.assetId);
    return review?.reviewStatus !== 'rejected';
  });
  clonedManifest.caseQuestions = clonedManifest.caseQuestions.filter(question => {
    const review = caseReviews.get(question.caseId)?.questions.find(item => item.caseQuestionId === question.id);
    return review?.reviewStatus !== 'rejected';
  });

  for (const caseReview of clonedReviewMap.cases) {
    caseReview.assets = caseReview.assets.filter(item => item.reviewStatus !== 'rejected');
    caseReview.questions = caseReview.questions.filter(item => item.reviewStatus !== 'rejected');
  }

  return { manifest: clonedManifest, reviewMap: clonedReviewMap };
}

export function validateReviewMap(input, manifest, bundlePaths = new Set()) {
  const reviewMap = validateReviewMapV2(input, manifest, bundlePaths);
  assertSourcePageBounds(reviewMap);
  return reviewMap;
}

export async function loadReviewBundle(input) {
  const bundle = await loadReviewBundleV2(input);
  assertSourcePageBounds(bundle.reviewMap);
  return bundle;
}

export function readinessErrors(manifest, reviewMap) {
  const pruned = cloneWithoutRejectedChildren(manifest, reviewMap);
  return readinessErrorsV2(pruned.manifest, pruned.reviewMap);
}

export function selectProductionManifest(manifest, reviewMap) {
  const pruned = cloneWithoutRejectedChildren(manifest, reviewMap);
  return selectProductionManifestV2(pruned.manifest, pruned.reviewMap);
}

export async function finalizeBundle(bundle) {
  assertSourcePageBounds(bundle.reviewMap);
  const pruned = cloneWithoutRejectedChildren(bundle.manifest, bundle.reviewMap);
  return finalizeBundleV2({ ...bundle, manifest: pruned.manifest, reviewMap: pruned.reviewMap });
}

export function persistedStateMatches(saved, bundleId, sourceFingerprint) {
  return Boolean(
    saved &&
    saved.bundleId === bundleId &&
    typeof saved.sourceFingerprint === 'string' &&
    saved.sourceFingerprint === sourceFingerprint
  );
}
