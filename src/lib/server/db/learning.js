import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import {
  assetQuestions,
  assets,
  caseAssets,
  caseConcepts,
  caseQuestions,
  cases,
  conceptQuestions,
  concepts,
  questionPrompts,
  reviewAssets,
  reviewQuestions,
  reviews,
  stimulusGroupOptions,
  stimulusGroupQuestions,
  stimulusGroups,
  stimulusOptionAssetQuestions,
  stimulusOptionQuestions
} from './schema.js';
import { caseTags, sharedQuestions, tags } from './tag-schema.js';
import { listActiveConceptTaxonomy } from './concept-taxonomy-compat.ts';
import {
  buildReviewInsertWithOptionalRouteProvenance,
  readReviewWithOptionalRouteProvenance
} from './review-provenance-compat.ts';
import { listSystemEligibleCases } from './study-navigation.ts';
import { pickCase } from '../learning/cases.js';
import {
  QuestionPoolUnavailableError,
  assertQuestionPoolMode,
  resolveQuestionPoolForMode
} from '../learning/question-pool-mode.ts';
import { pickReviewQuestions } from '../learning/questions.js';
import { resolveCaseStudyCandidates } from '../learning/study-routes.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */
/** @typedef {import('../learning/question-pool-mode.ts').QuestionPoolMode} QuestionPoolMode */
/** @typedef {'all'|'topic'|'tag'} SystemRouteType */

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
  studyTagId = null
}) {
  const source = await loadCaseSource(db, caseId, studyConceptId, questionPoolMode, rng);
  if (!source) return null;
  const pickedQuestions = pickQuestionsForReview(source, questionPoolMode, rng);
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
    caseTitleSnapshot: source.case.title,
    vignetteSnapshotMd: source.case.vignetteMd,
    questionPoolMode,
    status: 'started',
    rating: null
  });
  /** @type {[any, ...any[]]} */
  const writes = [reviewInsert];
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
      displayOrder: asset.displayOrder,
      storageKeySnapshot: asset.storageKey,
      captionSnapshotMd: asset.captionMd,
      altTextSnapshot: asset.altText,
      sourceStimulusGroupId: asset.stimulusGroupId,
      sourceStimulusOptionId: asset.stimulusOptionId
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
  const selectedCase = pickCase(eligibleCases, {
    lastCompletedCaseId: await lastCompletedCaseId(db, userId),
    rng
  });
  if (!selectedCase) return null;
  return createReviewForCase({
    db,
    userId,
    caseId: selectedCase.id,
    studyConceptId: selectedCase.studyConceptId,
    questionPoolMode,
    rng
  });
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
export async function startSystemReview({
  db,
  userId,
  systemId,
  routeType,
  routeId = null,
  questionPoolMode,
  rng = Math.random
}) {
  requiredId(userId);
  requiredId(systemId);
  assertQuestionPoolMode(questionPoolMode);
  const eligibleCases = await listSystemEligibleCases(db, { systemId, routeType, routeId });
  const selectedCase = pickCase(eligibleCases, {
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
  return createReviewForCase({
    db,
    userId,
    caseId: review.caseId,
    studyConceptId: review.studyConceptId,
    studySystemConceptId: review.studySystemConceptId,
    routeType: review.routeType,
    studyTagId: review.studyTagId,
    questionPoolMode: 'expanded',
    rng
  });
}

/** @param {LearningDb} db @param {string} caseId @param {string} studyConceptId @param {QuestionPoolMode} questionPoolMode @param {() => number} rng */
async function loadCaseSource(db, caseId, studyConceptId, questionPoolMode, rng) {
  const caseRows = await db
    .select({
      id: cases.id,
      title: cases.title,
      vignetteMd: cases.vignetteMd,
      questionSelectionMode: cases.questionSelectionMode,
      questionCount: cases.questionCount
    })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.isActive, true), isNull(cases.previewSessionId)))
    .limit(1);
  const caseRow = caseRows[0];
  if (!caseRow) return null;

  const caseTopicRows = await db
    .select({ conceptId: caseConcepts.conceptId, role: caseConcepts.role })
    .from(caseConcepts)
    .where(eq(caseConcepts.caseId, caseId));
  const primaryConceptId = caseTopicRows.find((topic) => topic.role === 'primary')?.conceptId;
  const studyLink = caseTopicRows.find((topic) => topic.conceptId === studyConceptId);
  if (!primaryConceptId || !studyLink) return null;

  const conceptRows = (await listActiveConceptTaxonomy(db)).map((concept) => ({
    id: concept.id,
    name: concept.name,
    kind: concept.kind,
    parentId: concept.parentId
  }));
  const primaryConcept = conceptRows.find(
    (concept) => concept.id === primaryConceptId && concept.kind === 'topic'
  );
  const studyConcept = conceptRows.find(
    (concept) => concept.id === studyConceptId && concept.kind === 'topic'
  );
  if (!primaryConcept || !studyConcept) return null;

  /** @type {{ id: string, name: string, kind: string, parentId: string | null, distance: number }[]} */
  const ancestors = [];
  let parentId = studyConcept.parentId;
  let distance = 1;
  while (parentId) {
    const ancestor = conceptRows.find((concept) => concept.id === parentId);
    if (!ancestor) break;
    if (ancestor.kind === 'topic') ancestors.push({ ...ancestor, distance });
    parentId = ancestor.parentId;
    distance += 1;
  }

  const promptRows = await db
    .select({ id: questionPrompts.id, promptMd: questionPrompts.promptMd })
    .from(questionPrompts)
    .where(and(eq(questionPrompts.isActive, true), isNull(questionPrompts.previewSessionId)));
  const prompts = new Map(promptRows.map((prompt) => [prompt.id, prompt.promptMd]));

  const caseQuestionRows = await db
    .select({
      questionPromptId: caseQuestions.questionPromptId,
      answerMd: caseQuestions.answerMd,
      isActive: caseQuestions.isActive
    })
    .from(caseQuestions)
    .where(and(eq(caseQuestions.caseId, caseId), eq(caseQuestions.isActive, true)))
    .orderBy(asc(caseQuestions.createdAt), asc(caseQuestions.questionPromptId));
  const caseQuestionInputs = caseQuestionRows
    .filter((question) => prompts.has(question.questionPromptId))
    .map((question) => ({ ...question, promptMd: prompts.get(question.questionPromptId) ?? '' }));

  const conceptIds = [studyConcept.id, ...ancestors.map((ancestor) => ancestor.id)];
  const conceptQuestionRows = await db
    .select({
      conceptId: conceptQuestions.conceptId,
      questionPromptId: conceptQuestions.questionPromptId,
      answerMd: conceptQuestions.answerMd,
      inheritToDescendants: conceptQuestions.inheritToDescendants,
      isActive: conceptQuestions.isActive
    })
    .from(conceptQuestions)
    .where(and(eq(conceptQuestions.isActive, true), inArray(conceptQuestions.conceptId, conceptIds)));
  const studyQuestions = conceptQuestionRows
    .filter((question) => question.conceptId === studyConcept.id && prompts.has(question.questionPromptId))
    .map((question) => ({
      ...question,
      sourceConceptId: question.conceptId,
      promptMd: prompts.get(question.questionPromptId) ?? ''
    }));
  const ancestorQuestions = conceptQuestionRows
    .filter((question) => question.conceptId !== studyConcept.id && prompts.has(question.questionPromptId))
    .map((question) => ({
      ...question,
      sourceConceptId: question.conceptId,
      promptMd: prompts.get(question.questionPromptId) ?? '',
      distance: ancestors.find((ancestor) => ancestor.id === question.conceptId)?.distance ?? 1
    }));

  const caseTagRows = await db
    .select({ tagId: caseTags.tagId })
    .from(caseTags)
    .innerJoin(tags, eq(tags.id, caseTags.tagId))
    .where(and(eq(caseTags.caseId, caseId), eq(tags.isActive, true)));
  const activeCaseTagIds = caseTagRows.map((row) => row.tagId);
  const sharedQuestionRows = activeCaseTagIds.length
    ? await db
        .select({
          id: sharedQuestions.id,
          questionPromptId: sharedQuestions.questionPromptId,
          answerMd: sharedQuestions.answerMd,
          reuseScopeTagId: sharedQuestions.reuseScopeTagId,
          isActive: sharedQuestions.isActive
        })
        .from(sharedQuestions)
        .where(and(eq(sharedQuestions.isActive, true), inArray(sharedQuestions.reuseScopeTagId, activeCaseTagIds)))
        .orderBy(asc(sharedQuestions.createdAt), asc(sharedQuestions.id))
    : [];
  const tagSharedQuestions = sharedQuestionRows
    .filter((question) => prompts.has(question.questionPromptId))
    .map((question) => ({
      ...question,
      promptMd: prompts.get(question.questionPromptId) ?? '',
      sourceSharedQuestionId: question.id
    }));

  const assetRows = await db
    .select({
      assetId: assets.id,
      storageKey: assets.storageKey,
      altText: assets.altText,
      sourceLabel: assets.sourceLabel,
      sourceUrl: assets.sourceUrl,
      captionMd: caseAssets.captionMd,
      displayOrder: caseAssets.displayOrder
    })
    .from(caseAssets)
    .innerJoin(assets, eq(assets.id, caseAssets.assetId))
    .where(and(eq(caseAssets.caseId, caseId), eq(assets.isActive, true), isNull(assets.previewSessionId)))
    .orderBy(asc(caseAssets.displayOrder));

  const groupRows = await db
    .select({
      id: stimulusGroups.id,
      name: stimulusGroups.name,
      displayOrder: stimulusGroups.displayOrder,
      selectionCount: stimulusGroups.selectionCount,
      specificQuestionMode: stimulusGroups.specificQuestionMode,
      minimumSpecificQuestions: stimulusGroups.minimumSpecificQuestions
    })
    .from(stimulusGroups)
    .where(and(eq(stimulusGroups.caseId, caseId), eq(stimulusGroups.isActive, true)))
    .orderBy(asc(stimulusGroups.displayOrder), asc(stimulusGroups.id));
  const groupIds = groupRows.map((group) => group.id);
  const optionRows = groupIds.length
    ? await db
        .select({
          id: stimulusGroupOptions.id,
          stimulusGroupId: stimulusGroupOptions.stimulusGroupId,
          assetId: stimulusGroupOptions.assetId,
          displayOrder: stimulusGroupOptions.displayOrder,
          captionMd: stimulusGroupOptions.captionMd,
          storageKey: assets.storageKey,
          altText: assets.altText,
          sourceLabel: assets.sourceLabel,
          sourceUrl: assets.sourceUrl
        })
        .from(stimulusGroupOptions)
        .innerJoin(assets, eq(assets.id, stimulusGroupOptions.assetId))
        .where(and(
          inArray(stimulusGroupOptions.stimulusGroupId, groupIds),
          eq(stimulusGroupOptions.isActive, true),
          eq(stimulusGroupOptions.removedFromCase, false),
          eq(assets.isActive, true),
          isNull(assets.previewSessionId)
        ))
        .orderBy(asc(stimulusGroupOptions.displayOrder), asc(stimulusGroupOptions.id))
    : [];

  /** @type {{ group: typeof groupRows[number], option: typeof optionRows[number] }[]} */
  const selectedOptions = [];
  for (const group of groupRows) {
    if (group.selectionCount !== 1) throw new Error('Only one option per Stimulus Group is supported.');
    const options = optionRows.filter((option) => option.stimulusGroupId === group.id);
    if (!options.length) continue;
    const boundedRandom = Math.min(Math.max(rng(), 0), 0.9999999999999999);
    selectedOptions.push({ group, option: options[Math.floor(boundedRandom * options.length)] });
  }

  const selectedOptionIds = selectedOptions.map(({ option }) => option.id);
  const groupQuestionRows = groupIds.length
    ? await db
        .select({
          stimulusGroupId: stimulusGroupQuestions.stimulusGroupId,
          questionPromptId: stimulusGroupQuestions.questionPromptId,
          answerMd: stimulusGroupQuestions.answerMd,
          isActive: stimulusGroupQuestions.isActive
        })
        .from(stimulusGroupQuestions)
        .where(and(
          inArray(stimulusGroupQuestions.stimulusGroupId, groupIds),
          eq(stimulusGroupQuestions.isActive, true)
        ))
    : [];
  const optionQuestionRows = selectedOptionIds.length
    ? await db
        .select({
          stimulusGroupOptionId: stimulusOptionQuestions.stimulusGroupOptionId,
          questionPromptId: stimulusOptionQuestions.questionPromptId,
          answerMd: stimulusOptionQuestions.answerMd,
          isActive: stimulusOptionQuestions.isActive
        })
        .from(stimulusOptionQuestions)
        .where(and(
          inArray(stimulusOptionQuestions.stimulusGroupOptionId, selectedOptionIds),
          eq(stimulusOptionQuestions.isActive, true)
        ))
    : [];
  const reusableRows = selectedOptionIds.length
    ? await db
        .select({
          stimulusGroupOptionId: stimulusOptionAssetQuestions.stimulusGroupOptionId,
          assetQuestionId: assetQuestions.id,
          assetId: assetQuestions.assetId,
          questionPromptId: assetQuestions.questionPromptId,
          answerMd: assetQuestions.answerMd,
          isActive: assetQuestions.isActive
        })
        .from(stimulusOptionAssetQuestions)
        .innerJoin(assetQuestions, eq(assetQuestions.id, stimulusOptionAssetQuestions.assetQuestionId))
        .where(and(
          inArray(stimulusOptionAssetQuestions.stimulusGroupOptionId, selectedOptionIds),
          eq(assetQuestions.isActive, true)
        ))
    : [];

  const groupQuestions = groupQuestionRows
    .filter((question) =>
      prompts.has(question.questionPromptId)
      && selectedOptions.some(({ group }) => group.id === question.stimulusGroupId)
    )
    .map((question) => ({
      ...question,
      promptMd: prompts.get(question.questionPromptId) ?? '',
      stimulusGroupId: question.stimulusGroupId
    }));
  const reusableAssetQuestions = reusableRows.flatMap((question) => {
    const selected = selectedOptions.find(({ option }) => option.id === question.stimulusGroupOptionId);
    if (!selected || selected.option.assetId !== question.assetId || !prompts.has(question.questionPromptId)) return [];
    return [{
      ...question,
      promptMd: prompts.get(question.questionPromptId) ?? '',
      sourceAssetQuestionId: question.assetQuestionId,
      stimulusGroupId: selected.group.id,
      stimulusOptionId: selected.option.id
    }];
  });
  const optionQuestions = optionQuestionRows.flatMap((question) => {
    const selected = selectedOptions.find(({ option }) => option.id === question.stimulusGroupOptionId);
    if (!selected || !prompts.has(question.questionPromptId)) return [];
    return [{
      ...question,
      promptMd: prompts.get(question.questionPromptId) ?? '',
      stimulusGroupId: selected.group.id,
      stimulusOptionId: selected.option.id
    }];
  });
  const questionPool = resolveQuestionPoolForMode(questionPoolMode, {
    caseQuestions: caseQuestionInputs,
    studyConceptQuestions: studyQuestions,
    tagSharedQuestions,
    ancestorConceptQuestions: ancestorQuestions,
    stimulusGroupQuestions: groupQuestions,
    assetQuestions: reusableAssetQuestions,
    stimulusOptionQuestions: optionQuestions
  });

  const selectedAssets = selectedOptions.map(({ group, option }) => ({
    assetId: option.assetId,
    storageKey: option.storageKey,
    altText: option.altText,
    sourceLabel: option.sourceLabel,
    sourceUrl: option.sourceUrl,
    captionMd: option.captionMd,
    displayOrder: assetRows.length + group.displayOrder,
    stimulusGroupId: group.id,
    stimulusOptionId: option.id
  }));
  const groupCoverage = selectedOptions.map(({ group }) => ({
    groupId: group.id,
    mode: /** @type {'none'|'minimum'|'all'} */ (group.specificQuestionMode),
    minimum: group.minimumSpecificQuestions ?? 0
  }));
  return {
    case: caseRow,
    primaryConcept,
    studyConcept,
    questionPool,
    assets: [
      ...assetRows.map((asset) => ({ ...asset, stimulusGroupId: null, stimulusOptionId: null })),
      ...selectedAssets
    ],
    groupCoverage
  };
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
