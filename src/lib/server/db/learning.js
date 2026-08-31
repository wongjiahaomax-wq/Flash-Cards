import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import {
  assets,
  caseConcepts,
  cases,
  concepts,
  reviewAssets,
  reviewQuestions,
  reviews
} from './schema.js';
import { tags } from './tag-schema.js';
import { listActiveConceptTaxonomy } from './concept-taxonomy-compat.ts';
import {
  buildReviewInsertWithOptionalRouteProvenance,
  readReviewWithOptionalRouteProvenance
} from './review-provenance-compat.ts';
import { buildStudySelectionCreationWrites, readStudySelection } from './study-selection.ts';
import {
  StudyNavigationInputError,
  listSystemEligibleCases,
  resolveSystemStudySelection
} from './study-navigation.ts';
import { loadCaseSource } from './learner-case-source.js';
import { pickCase } from '../learning/cases.js';
import {
  QuestionPoolUnavailableError,
  assertQuestionPoolMode
} from '../learning/question-pool-mode.ts';
import { pickReviewQuestions } from '../learning/questions.js';
import { resolveCaseStudyCandidates } from '../learning/study-routes.js';
import { SystemStudySelectionError } from '../learning/system-study-routes.ts';

/** @typedef {import('./index.js').LearningDb} LearningDb */
/** @typedef {import('../learning/question-pool-mode.ts').QuestionPoolMode} QuestionPoolMode */
/** @typedef {'all'|'topic'|'tag'} SystemRouteType */

const STALE_STUDY_SELECTION_MESSAGE = 'This study selection is no longer available. Return to Study and choose a fresh selection.';

/** @param {string | undefined} value */
function requiredId(value) {
  if (!value) throw new Error('A required identifier is missing.');
  return value;
}

function newId() {
  return globalThis.crypto.randomUUID();
}

/** @param {LearningDb} db */
async function loadActiveCaseTopicRows(db) {
  const activeTopicIds = new Set(
    (await listActiveConceptTaxonomy(db))
      .filter((concept) => concept.kind === 'topic')
      .map((concept) => concept.id)
  );
  const rows = await db
    .select({
      id: cases.id,
      title: cases.title,
      vignetteMd: cases.vignetteMd,
      isActive: cases.isActive,
      conceptId: caseConcepts.conceptId,
      role: caseConcepts.role
    })
    .from(cases)
    .innerJoin(caseConcepts, eq(caseConcepts.caseId, cases.id))
    .where(and(eq(cases.isActive, true), isNull(cases.previewSessionId)));
  return rows.filter((row) => activeTopicIds.has(row.conceptId));
}

/** @param {LearningDb} db */
export async function listStudyConcepts(db) {
  const conceptRows = (await listActiveConceptTaxonomy(db))
    .filter((concept) => concept.kind === 'topic')
    .map((concept) => ({
      id: concept.id,
      name: concept.name,
      slug: concept.slug,
      description: concept.descriptionMd,
      parentId: concept.parentId
    }));
  const caseTopicRows = await loadActiveCaseTopicRows(db);
  return conceptRows
    .map((concept) => ({
      ...concept,
      caseCount: resolveCaseStudyCandidates({
        selectedConceptId: concept.id,
        concepts: conceptRows,
        rows: caseTopicRows
      }).length
    }))
    .filter((concept) => concept.caseCount > 0);
}

/** @param {LearningDb} db @param {string} conceptId */
export async function listEligibleCases(db, conceptId) {
  const conceptRows = (await listActiveConceptTaxonomy(db))
    .filter((concept) => concept.kind === 'topic')
    .map((concept) => ({ id: concept.id, parentId: concept.parentId }));
  return resolveCaseStudyCandidates({
    selectedConceptId: conceptId,
    concepts: conceptRows,
    rows: await loadActiveCaseTopicRows(db)
  });
}

/** @param {LearningDb} db @param {string} userId */
async function lastCompletedCaseId(db, userId) {
  const row = await db
    .select({ caseId: reviews.caseId })
    .from(reviews)
    .where(and(eq(reviews.userId, userId), eq(reviews.status, 'completed'), isNotNull(reviews.completedAt)))
    .orderBy(desc(reviews.completedAt))
    .limit(1);
  return row[0]?.caseId ?? null;
}

/** @param {LearningDb} db @param {string} caseId */
async function currentPrimaryConceptIdForCase(db, caseId) {
  const rows = await db
    .select({ conceptId: caseConcepts.conceptId })
    .from(caseConcepts)
    .where(and(eq(caseConcepts.caseId, caseId), eq(caseConcepts.role, 'primary')))
    .limit(1);
  return rows[0]?.conceptId ?? null;
}

/** @param {LearningDb} db @param {{ userId: string; studySelectionId: string; expectedSystemId?: string | null }} options */
async function resolveStoredSystemStudySelection(db, { userId, studySelectionId, expectedSystemId = null }) {
  const selection = await readStudySelection(db, { selectionId: studySelectionId, userId });
  if (!selection || (expectedSystemId && selection.systemId !== expectedSystemId)) {
    throw new StudyNavigationInputError(STALE_STUDY_SELECTION_MESSAGE);
  }
  try {
    return await resolveSystemStudySelection(db, {
      systemId: selection.systemId,
      routes: selection.routes
    });
  } catch (cause) {
    if (cause instanceof SystemStudySelectionError) {
      throw new StudyNavigationInputError(STALE_STUDY_SELECTION_MESSAGE);
    }
    throw cause;
  }
}

/** @param {Awaited<ReturnType<typeof loadCaseSource>> extends infer T ? Exclude<T, null> : never} source @param {QuestionPoolMode} questionPoolMode @param {() => number} rng */
function pickQuestionsForReview(source, questionPoolMode, rng) {
  try {
    const pickedQuestions = pickReviewQuestions(source.questionPool, {
      rng,
      mode: /** @type {'automatic'|'all'|'fixed'} */ (source.case.questionSelectionMode),
      count: source.case.questionCount ?? 3,
      groupCoverage: source.groupCoverage
    });
    if (pickedQuestions.length === 0) {
      throw new QuestionPoolUnavailableError(
        questionPoolMode === 'core'
          ? 'This case has no Original questions available. Choose Expanded Learning instead.'
          : 'This case has no eligible questions available for Expanded Learning.'
      );
    }
    return pickedQuestions;
  } catch (cause) {
    if (cause instanceof QuestionPoolUnavailableError) throw cause;
    if (
      cause instanceof Error &&
      (cause.message.startsWith('Stimulus Group ') || cause.message.includes('stimulus-specific question coverage'))
    ) {
      throw new QuestionPoolUnavailableError(
        questionPoolMode === 'core'
          ? 'Original questions cannot satisfy this case’s stimulus-specific question requirement. Choose Expanded Learning or ask an Admin to review the case.'
          : 'Expanded Learning cannot satisfy this case’s stimulus-specific question requirement. Ask an Admin to review the case.'
      );
    }
    throw cause;
  }
}

/**
 * @param {object} options
 * @param {LearningDb} options.db
 * @param {string} options.userId
 * @param {string} options.caseId
 * @param {string} options.studyConceptId
 * @param {QuestionPoolMode} options.questionPoolMode
 * @param {() => number} options.rng
 * @param {string | null} [options.studySystemConceptId]
 * @param {'topic'|'tag'} [options.routeType]
 * @param {string | null} [options.studyTagId]
 * @param {SystemRouteType | null} [options.navigationRouteType]
 * @param {string | null} [options.navigationRouteId]
 * @param {string | null} [options.studySelectionId]
 * @param {any[]} [options.preReviewWrites]
 * @param {boolean} [options.requireAtomicBatch]
 */
async function createReviewForCase({
  db,
  userId,
  caseId,
  studyConceptId,
  questionPoolMode,
  rng,
  studySystemConceptId = null,
  routeType = 'topic',
  studyTagId = null,
  navigationRouteType = null,
  navigationRouteId = null,
  studySelectionId = null,
  preReviewWrites = [],
  requireAtomicBatch = false
}) {
  const source = await loadCaseSource(db, caseId, studyConceptId, questionPoolMode, rng);
  if (!source) return null;
  const pickedQuestions = pickQuestionsForReview(source, questionPoolMode, rng);
  if (requireAtomicBatch && typeof db.batch !== 'function') {
    throw new Error('Selection-based Review creation requires atomic D1 batch support.');
  }
  const reviewId = newId();
  const reviewInsert = buildReviewInsertWithOptionalRouteProvenance(db, {
    id: reviewId,
    userId,
    caseId: source.case.id,
    primaryConceptId: source.primaryConcept.id,
    studyConceptId: source.studyConcept.id,
    studySystemConceptId,
    routeType,
    studyTagId,
    navigationRouteType,
    navigationRouteId,
    studySelectionId,
    caseTitleSnapshot: source.case.title,
    vignetteSnapshotMd: source.case.vignetteMd,
    questionPoolMode,
    status: 'started',
    rating: null
  });
  /** @type {[any, ...any[]]} */
  const writes = [reviewInsert];
  if (preReviewWrites.length > 0) writes.unshift(...preReviewWrites);
  writes.push(db.insert(reviewQuestions).values(pickedQuestions.map((question) => ({
    id: newId(),
    reviewId,
    questionPromptId: question.questionPromptId,
    sourceType: question.sourceType,
    sourceConceptId: question.sourceConceptId,
    sourceStimulusGroupId: question.sourceStimulusGroupId,
    sourceStimulusOptionId: question.sourceStimulusOptionId,
    sourceAssetQuestionId: question.sourceAssetQuestionId ?? null,
    sourceSharedQuestionId: question.sourceSharedQuestionId,
    displayOrder: question.displayOrder,
    promptSnapshotMd: question.promptMd,
    answerSnapshotMd: question.answerMd
  }))));
  if (source.assets.length > 0) {
    writes.push(db.insert(reviewAssets).values(source.assets.map((asset) => ({
      id: newId(),
      reviewId,
      assetId: asset.assetId,
      storageKeySnapshot: asset.storageKey,
      captionSnapshotMd: asset.captionMd,
      altTextSnapshot: asset.altText,
      sourceStimulusGroupId: asset.stimulusGroupId,
      sourceStimulusOptionId: asset.stimulusOptionId,
      displayOrder: asset.displayOrder
    }))));
  }
  if (typeof db.batch === 'function') await db.batch(writes);
  else for (const write of writes) await write;
  return reviewId;
}

/** @param {object} options @param {LearningDb} options.db @param {string} options.userId @param {string} options.conceptId @param {QuestionPoolMode} options.questionPoolMode @param {() => number} [options.rng] */
export async function startReview({ db, userId, conceptId, questionPoolMode, rng = Math.random }) {
  requiredId(userId);
  requiredId(conceptId);
  assertQuestionPoolMode(questionPoolMode);
  const eligibleCases = await listEligibleCases(db, conceptId);
  const selectedCase = pickCase(eligibleCases, { lastCompletedCaseId: await lastCompletedCaseId(db, userId), rng });
  if (!selectedCase) return null;
  return createReviewForCase({ db, userId, caseId: selectedCase.id, studyConceptId: selectedCase.studyConceptId, questionPoolMode, rng });
}

/**
 * @param {object} options
 * @param {LearningDb} options.db
 * @param {string} options.userId
 * @param {string} options.systemId
 * @param {SystemRouteType} options.routeType
 * @param {string | null | undefined} [options.routeId]
 * @param {QuestionPoolMode} options.questionPoolMode
 * @param {() => number} [options.rng]
 */
export async function startSystemReview({ db, userId, systemId, routeType, routeId = null, questionPoolMode, rng = Math.random }) {
  requiredId(userId);
  requiredId(systemId);
  assertQuestionPoolMode(questionPoolMode);
  const eligibleCases = await listSystemEligibleCases(db, { systemId, routeType, routeId });
  const selectedCase = pickCase(eligibleCases, { lastCompletedCaseId: await lastCompletedCaseId(db, userId), rng });
  if (!selectedCase) return null;
  return createReviewForCase({
    db,
    userId,
    caseId: selectedCase.id,
    studyConceptId: selectedCase.studyConceptId,
    studySystemConceptId: selectedCase.studySystemConceptId,
    routeType: selectedCase.routeType,
    studyTagId: selectedCase.studyTagId,
    navigationRouteType: routeType,
    navigationRouteId: routeType === 'all' ? null : routeId,
    questionPoolMode,
    rng
  });
}

/**
 * Start a new Review from an immutable exact-Topic/curated-Tag selection snapshot.
 * Candidate/question resolution happens before any write. The selection, routes,
 * Review, question snapshots and asset snapshots are then submitted in one D1 batch.
 *
 * @param {object} options
 * @param {LearningDb} options.db
 * @param {string} options.userId
 * @param {string} options.systemId
 * @param {readonly import('../learning/system-study-routes.ts').SystemStudySelectionRoute[]} options.routes
 * @param {QuestionPoolMode} options.questionPoolMode
 * @param {() => number} [options.rng]
 */
export async function startSystemStudySelectionReview({ db, userId, systemId, routes, questionPoolMode, rng = Math.random }) {
  requiredId(userId);
  requiredId(systemId);
  assertQuestionPoolMode(questionPoolMode);
  const resolved = await resolveSystemStudySelection(db, { systemId, routes });
  const selectedCase = pickCase(resolved.candidates, {
    lastCompletedCaseId: await lastCompletedCaseId(db, userId),
    rng
  });
  if (!selectedCase) return null;

  const studySelectionId = newId();
  const selectionWrites = buildStudySelectionCreationWrites(db, {
    id: studySelectionId,
    userId,
    systemId: resolved.systemId,
    routes: resolved.routes
  });
  return createReviewForCase({
    db,
    userId,
    caseId: selectedCase.id,
    studyConceptId: selectedCase.studyConceptId,
    studySystemConceptId: selectedCase.studySystemConceptId,
    routeType: selectedCase.routeType,
    studyTagId: selectedCase.studyTagId,
    navigationRouteType: null,
    navigationRouteId: null,
    studySelectionId,
    preReviewWrites: [...selectionWrites],
    requireAtomicBatch: true,
    questionPoolMode,
    rng
  });
}

/**
 * Start the next Review from an existing immutable System study selection.
 * Stored routes are revalidated against current taxonomy/curation before use;
 * invalid selections fail closed instead of silently broadening or changing scope.
 *
 * @param {object} options
 * @param {LearningDb} options.db
 * @param {string} options.userId
 * @param {string} options.studySelectionId
 * @param {QuestionPoolMode} options.questionPoolMode
 * @param {() => number} [options.rng]
 */
export async function startNextSystemStudySelectionReview({
  db,
  userId,
  studySelectionId,
  questionPoolMode,
  rng = Math.random
}) {
  requiredId(userId);
  requiredId(studySelectionId);
  assertQuestionPoolMode(questionPoolMode);
  const resolved = await resolveStoredSystemStudySelection(db, { userId, studySelectionId });
  const selectedCase = pickCase(resolved.candidates, {
    lastCompletedCaseId: await lastCompletedCaseId(db, userId),
    rng
  });
  if (!selectedCase) return null;
  return createReviewForCase({
    db,
    userId,
    caseId: selectedCase.id,
    studyConceptId: selectedCase.studyConceptId,
    studySystemConceptId: selectedCase.studySystemConceptId,
    routeType: selectedCase.routeType,
    studyTagId: selectedCase.studyTagId,
    navigationRouteType: null,
    navigationRouteId: null,
    studySelectionId,
    questionPoolMode,
    rng
  });
}

/** @param {object} options @param {LearningDb} options.db @param {string} options.userId @param {string} options.reviewId @param {() => number} [options.rng] */
export async function continueReviewWithExpandedLearning({ db, userId, reviewId, rng = Math.random }) {
  requiredId(userId);
  requiredId(reviewId);
  const review = await readReviewWithOptionalRouteProvenance(db, reviewId, userId);
  if (!review) throw new Error('Review not found.');
  if (review.status !== 'completed') throw new Error('Complete this review before continuing with Expanded Learning.');
  if (review.questionPoolMode !== 'core') throw new Error('Expanded Learning continuation is only available after an Original questions review.');
  if (review.studySelectionId) {
    if (!review.studySystemConceptId) throw new StudyNavigationInputError(STALE_STUDY_SELECTION_MESSAGE);
    await resolveStoredSystemStudySelection(db, {
      userId,
      studySelectionId: review.studySelectionId,
      expectedSystemId: review.studySystemConceptId
    });
  }
  const primaryConceptId = await currentPrimaryConceptIdForCase(db, review.caseId);
  if (!primaryConceptId) return null;
  return createReviewForCase({
    db,
    userId,
    caseId: review.caseId,
    studyConceptId: primaryConceptId,
    studySystemConceptId: review.studySystemConceptId,
    routeType: review.routeType,
    studyTagId: review.studyTagId,
    navigationRouteType: review.navigationRouteType,
    navigationRouteId: review.navigationRouteId,
    studySelectionId: review.studySelectionId,
    questionPoolMode: 'expanded',
    rng
  });
}

/** @param {LearningDb} db @param {string} reviewId @param {string} userId */
export async function getReview(db, reviewId, userId) {
  const review = await readReviewWithOptionalRouteProvenance(db, reviewId, userId);
  if (!review) return null;
  const [conceptRows, systemRows, tagRows] = await Promise.all([
    db.select({ name: concepts.name }).from(concepts).where(eq(concepts.id, review.studyConceptId)).limit(1),
    review.studySystemConceptId
      ? db.select({ name: concepts.name }).from(concepts).where(eq(concepts.id, review.studySystemConceptId)).limit(1)
      : Promise.resolve([]),
    review.routeType === 'tag' && review.studyTagId
      ? db.select({ name: tags.name }).from(tags).where(eq(tags.id, review.studyTagId)).limit(1)
      : Promise.resolve([])
  ]);
  const conceptName = conceptRows[0]?.name ?? 'Selected topic';
  const routeLabel = review.routeType === 'tag' ? (tagRows[0]?.name ?? 'Selected tag') : conceptName;
  const questions = await db
    .select({
      prompt: reviewQuestions.promptSnapshotMd,
      answer: reviewQuestions.answerSnapshotMd,
      sourceType: reviewQuestions.sourceType,
      sourceStimulusGroupId: reviewQuestions.sourceStimulusGroupId,
      sourceStimulusOptionId: reviewQuestions.sourceStimulusOptionId,
      sourceAssetQuestionId: reviewQuestions.sourceAssetQuestionId,
      sourceSharedQuestionId: reviewQuestions.sourceSharedQuestionId,
      displayOrder: reviewQuestions.displayOrder
    })
    .from(reviewQuestions)
    .where(eq(reviewQuestions.reviewId, reviewId))
    .orderBy(asc(reviewQuestions.displayOrder));
  const assetRows = await db
    .select({
      assetId: reviewAssets.assetId,
      storageKey: reviewAssets.storageKeySnapshot,
      caption: reviewAssets.captionSnapshotMd,
      altText: reviewAssets.altTextSnapshot,
      sourceLabel: assets.sourceLabel,
      sourceUrl: assets.sourceUrl,
      stimulusGroupId: reviewAssets.sourceStimulusGroupId,
      stimulusOptionId: reviewAssets.sourceStimulusOptionId,
      displayOrder: reviewAssets.displayOrder
    })
    .from(reviewAssets)
    .leftJoin(assets, eq(assets.id, reviewAssets.assetId))
    .where(eq(reviewAssets.reviewId, reviewId))
    .orderBy(asc(reviewAssets.displayOrder));
  return {
    ...review,
    conceptName,
    systemName: systemRows[0]?.name ?? null,
    routeLabel,
    revealed: Boolean(review.revealedAt),
    questions,
    assets: assetRows
  };
}

/** @param {LearningDb} db @param {string} reviewId @param {string} userId */
export async function revealReview(db, reviewId, userId) {
  const current = await db
    .select({ status: reviews.status })
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), eq(reviews.userId, userId)))
    .limit(1);
  if (!current[0]) throw new Error('Review not found.');
  if (current[0].status !== 'started') return false;
  await db
    .update(reviews)
    .set({ revealedAt: new Date() })
    .where(and(eq(reviews.id, reviewId), eq(reviews.userId, userId), eq(reviews.status, 'started')));
  return true;
}

/** @param {LearningDb} db @param {string} reviewId @param {string} userId @param {'again' | 'good'} rating */
export async function completeReview(db, reviewId, userId, rating) {
  if (rating !== 'again' && rating !== 'good') throw new Error('Review rating must be again or good.');
  const current = await db
    .select({ status: reviews.status, revealedAt: reviews.revealedAt })
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), eq(reviews.userId, userId)))
    .limit(1);
  if (!current[0]) throw new Error('Review not found.');
  if (current[0].status === 'completed') return false;
  if (!current[0].revealedAt) throw new Error('Reveal the answers before rating this review.');
  await db
    .update(reviews)
    .set({ status: 'completed', rating, completedAt: new Date() })
    .where(and(
      eq(reviews.id, reviewId),
      eq(reviews.userId, userId),
      eq(reviews.status, 'started'),
      isNotNull(reviews.revealedAt)
    ));
  return true;
}
