import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import {
  ActiveReviewContentError,
  ACTIVE_REVIEW_SNAPSHOT_VERSION,
  assertActiveReviewSnapshotSupported,
  buildActiveReviewSnapshot
} from '../db/active-review-content.js';
import { assets, caseAssets, caseConcepts, caseQuestions, cases, concepts, questionPrompts, stimulusGroups } from '../db/schema.js';
import { loadLearnerStimulusFamilies } from '../db/learner-stimulus-families.js';
import { loadStudyNavigationSnapshot } from '../db/study-navigation.ts';
import { pickReviewQuestions } from './questions.js';
import { resolveQuestionPoolForMode } from './question-pool-mode.ts';
import {
  buildSystemStudyNavigation,
  normalizeSystemStudySelectionRoutes,
  resolveSystemStudySelectionCandidates
} from './system-study-routes.ts';

export class AdminStudyPreviewUnavailableError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'AdminStudyPreviewUnavailableError';
  }
}

/** @param {{topics:{id:string}[],tags:{id:string}[]}} system */
function allRoutes(system) {
  return [
    ...system.topics.map((topic) => ({ routeType: /** @type {'topic'} */ ('topic'), routeId: topic.id })),
    ...system.tags.map((tag) => ({ routeType: /** @type {'tag'} */ ('tag'), routeId: tag.id }))
  ];
}

/**
 * Read-only Admin Study Preview built on the same content-resolution boundary as
 * active learner Reviews, without creating learner profiles, preferences,
 * active Reviews, events, encounters, aggregates, or completion receipts.
 *
 * @param {{
 *   db: import('../db/index.js').LearningDb,
 *   systemId: string,
 *   routes: readonly {routeType:'topic'|'tag',routeId:string}[],
 *   caseId: string,
 *   contentMode: 'original'|'expanded',
 *   rng?: () => number
 * }} input
 */
export async function buildAdminStudyPreview(input) {
  const navigation = await loadStudyNavigationSnapshot(input.db);
  const routes = normalizeSystemStudySelectionRoutes({
    ...navigation,
    systemId: input.systemId,
    routes: input.routes
  });
  const selection = {
    systemId: input.systemId,
    routes,
    candidates: resolveSystemStudySelectionCandidates({
      ...navigation,
      systemId: input.systemId,
      routes
    })
  };
  return buildAdminStudyPreviewFromSelection(input, selection);
}

/**
 * @param {{
 *   db: import('../db/index.js').LearningDb,
 *   caseId: string,
 *   contentMode: 'original'|'expanded',
 *   rng?: () => number
 * }} input
 * @param {{systemId:string,routes:readonly {routeType:'topic'|'tag',routeId:string}[],candidates:readonly any[]}} selection
 */
async function buildAdminStudyPreviewFromSelection(input, selection) {
  const candidate = selection.candidates.find((item) => item.id === input.caseId);
  if (!candidate) throw new AdminStudyPreviewUnavailableError('The selected Case is not eligible in this System scope.');
  const snapshot = await buildActiveReviewSnapshot({
    db: input.db,
    caseId: candidate.id,
    studyConceptId: candidate.studyConceptId,
    contentMode: input.contentMode,
    rng: input.rng ?? (() => 0)
  });
  return {
    systemId: selection.systemId,
    routes: selection.routes,
    candidate: {
      id: candidate.id,
      title: candidate.title,
      studyConceptId: candidate.studyConceptId
    },
    snapshot: {
      ...snapshot,
      assets: snapshot.assets.map((asset) => ({
        ...asset,
        imageUrl: `/api/assets/${encodeURIComponent(asset.assetId)}/image`
      }))
    }
  };
}

/** @param {{version:number,case:any,questions:any[],assets:any[],bytes:number}} snapshot */
function withPreviewImageUrls(snapshot) {
  return {
    ...snapshot,
    assets: snapshot.assets.map((asset) => ({
      ...asset,
      imageUrl: `/api/assets/${encodeURIComponent(asset.assetId)}/image`
    }))
  };
}

/**
 * Read saved Case-specific Original questions and fixed/Original images when
 * an active Production Case has no usable Primary Topic. This path is only for
 * direct Admin preview; learner eligibility and snapshot loading stay intact.
 *
 * @param {{db:import('../db/index.js').LearningDb,caseId:string,rng?:()=>number}} input
 * @param {{id:string,title:string,vignetteMd:string|null,questionSelectionMode:string,questionCount:number|null}} caseRow
 */
async function buildCaseSpecificAdminPreview(input, caseRow) {
  const groups = await input.db
    .select({ id: stimulusGroups.id, originalOptionId: stimulusGroups.originalOptionId })
    .from(stimulusGroups)
    .where(and(eq(stimulusGroups.caseId, caseRow.id), eq(stimulusGroups.isActive, true)))
    .orderBy(asc(stimulusGroups.displayOrder), asc(stimulusGroups.id));
  if (groups.some((group) => !group.originalOptionId)) {
    throw new AdminStudyPreviewUnavailableError(
      'This Case has no usable Primary Topic and an active image set without a designated Original image. Set an Original image or assign a Primary Topic before previewing it.'
    );
  }

  const fixedAssets = await input.db
    .select({
      assetId: assets.id,
      storageKey: assets.storageKey,
      altText: assets.altText,
      captionMd: caseAssets.captionMd,
      displayOrder: caseAssets.displayOrder
    })
    .from(caseAssets)
    .innerJoin(assets, eq(assets.id, caseAssets.assetId))
    .where(and(eq(caseAssets.caseId, caseRow.id), eq(assets.isActive, true), isNull(assets.previewSessionId)))
    .orderBy(asc(caseAssets.displayOrder));
  const rng = input.rng ?? (() => 0);
  const stimulus = await loadLearnerStimulusFamilies(input.db, {
    caseId: caseRow.id,
    questionPoolMode: 'core',
    rng,
    fixedAssetCount: fixedAssets.length
  });
  const hasUnavailableOriginal = groups.some((group) => {
    const selected = stimulus.assets.find((asset) => asset.stimulusGroupId === group.id);
    return !selected || selected.stimulusOptionId !== group.originalOptionId;
  });
  if (hasUnavailableOriginal) {
    throw new AdminStudyPreviewUnavailableError(
      'An active Original image for this Case is unavailable in Production. Restore it or assign a usable Primary Topic before previewing.'
    );
  }

  const caseQuestionRows = await input.db
    .select({
      questionPromptId: caseQuestions.questionPromptId,
      answerMd: caseQuestions.answerMd,
      isActive: caseQuestions.isActive
    })
    .from(caseQuestions)
    .where(and(eq(caseQuestions.caseId, caseRow.id), eq(caseQuestions.isActive, true)))
    .orderBy(asc(caseQuestions.createdAt), asc(caseQuestions.questionPromptId));
  const stimulusQuestions = [...stimulus.stimulusGroupQuestions, ...stimulus.stimulusOptionQuestions];
  const promptIds = [...new Set([
    ...caseQuestionRows.map((question) => question.questionPromptId),
    ...stimulusQuestions.map((question) => question.questionPromptId)
  ])];
  const prompts = new Map();
  const promptQueryBatchSize = 99; // Leaves room for the active-state predicate in D1.
  for (let offset = 0; offset < promptIds.length; offset += promptQueryBatchSize) {
    const promptBatch = promptIds.slice(offset, offset + promptQueryBatchSize);
    const promptRows = await input.db
      .select({ id: questionPrompts.id, promptMd: questionPrompts.promptMd })
      .from(questionPrompts)
      .where(and(
        eq(questionPrompts.isActive, true),
        isNull(questionPrompts.previewSessionId),
        inArray(questionPrompts.id, promptBatch)
      ));
    for (const prompt of promptRows) prompts.set(prompt.id, prompt.promptMd);
  }
  /** @template {{questionPromptId:string}} T @param {T[]} questions @returns {(T & {promptMd:string})[]} */
  const attachPrompt = (questions) => questions
    .filter((question) => prompts.has(question.questionPromptId))
    .map((question) => ({ ...question, promptMd: prompts.get(question.questionPromptId) ?? '' }));
  const questionPool = resolveQuestionPoolForMode('core', {
    caseQuestions: attachPrompt(caseQuestionRows),
    stimulusGroupQuestions: attachPrompt(stimulus.stimulusGroupQuestions),
    stimulusOptionQuestions: attachPrompt(stimulus.stimulusOptionQuestions)
  });
  if (questionPool.length === 0) {
    throw new AdminStudyPreviewUnavailableError(
      'This Case has no active Production Case-specific Original questions to preview without a Primary Topic. Add a Case or Original stimulus question, or assign a usable Primary Topic.'
    );
  }

  let selectedQuestions;
  try {
    selectedQuestions = pickReviewQuestions(questionPool, {
      rng,
      mode: /** @type {'automatic'|'all'|'fixed'} */ (caseRow.questionSelectionMode),
      count: caseRow.questionCount ?? 3,
      groupCoverage: stimulus.groupCoverage,
      preservePoolOrder: true
    });
  } catch (cause) {
    if (cause instanceof Error && (cause.message.startsWith('Stimulus Group ') || cause.message.includes('stimulus-specific question coverage'))) {
      throw new ActiveReviewContentError(
        'content-unavailable',
        'Saved Original questions cannot satisfy this Case’s stimulus-specific question requirement.'
      );
    }
    throw cause;
  }
  if (selectedQuestions.length === 0) {
    throw new AdminStudyPreviewUnavailableError('This Case has no eligible saved Original questions to preview.');
  }

  const snapshot = {
    version: ACTIVE_REVIEW_SNAPSHOT_VERSION,
    case: { id: caseRow.id, title: caseRow.title, vignetteMd: caseRow.vignetteMd },
    questions: selectedQuestions.map((question) => ({
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
    })),
    assets: [
      ...fixedAssets.map((asset) => ({
        assetId: asset.assetId,
        displayOrder: asset.displayOrder,
        storageKeySnapshot: asset.storageKey,
        captionSnapshotMd: asset.captionMd,
        altTextSnapshot: asset.altText,
        sourceStimulusGroupId: null,
        sourceStimulusOptionId: null
      })),
      ...stimulus.assets.map((asset) => ({
        assetId: asset.assetId,
        displayOrder: asset.displayOrder,
        storageKeySnapshot: asset.storageKey,
        captionSnapshotMd: asset.captionMd,
        altTextSnapshot: asset.altText,
        sourceStimulusGroupId: asset.stimulusGroupId,
        sourceStimulusOptionId: asset.stimulusOptionId
      }))
    ]
  };
  const bytes = assertActiveReviewSnapshotSupported(snapshot);
  return {
    candidate: { id: caseRow.id, title: caseRow.title, studyConceptId: null },
    snapshot: withPreviewImageUrls({ ...snapshot, bytes })
  };
}

/**
 * Resolve one exact Case through the same current System/Topic/Tag candidate
 * boundary used by the generic Admin Study Preview, without requiring Admin to
 * choose a System or route first. When no route reaches it, direct Admin preview
 * may resolve its active Production Primary Topic or saved Case-specific
 * Original content without relaxing learner eligibility.
 *
 * @param {{
 *   db: import('../db/index.js').LearningDb,
 *   caseId: string,
 *   contentMode: 'original'|'expanded',
 *   rng?: () => number
 * }} input
 */
export async function buildDirectAdminStudyPreview(input) {
  const navigation = await loadStudyNavigationSnapshot(input.db);
  const systems = buildSystemStudyNavigation(navigation);
  for (const system of systems) {
    const candidateRoutes = allRoutes(system);
    const routes = normalizeSystemStudySelectionRoutes({
      ...navigation,
      systemId: system.id,
      routes: candidateRoutes
    });
    const selection = {
      systemId: system.id,
      routes,
      candidates: resolveSystemStudySelectionCandidates({
        ...navigation,
        systemId: system.id,
        routes
      })
    };
    if (!selection.candidates.some((candidate) => candidate.id === input.caseId)) continue;
    return buildAdminStudyPreviewFromSelection({
      db: input.db,
      caseId: input.caseId,
      contentMode: input.contentMode,
      rng: input.rng
    }, selection);
  }

  const caseRows = await input.db
    .select({
      id: cases.id,
      title: cases.title,
      vignetteMd: cases.vignetteMd,
      questionSelectionMode: cases.questionSelectionMode,
      questionCount: cases.questionCount
    })
    .from(cases)
    .where(and(eq(cases.id, input.caseId), eq(cases.isActive, true), isNull(cases.previewSessionId)))
    .limit(1);
  const caseRow = caseRows[0];
  if (!caseRow) {
    throw new AdminStudyPreviewUnavailableError('This active Production Case is unavailable for direct Admin preview.');
  }

  const primaryTopics = await input.db
    .select({ studyConceptId: concepts.id })
    .from(caseConcepts)
    .innerJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
    .where(and(
      eq(caseConcepts.caseId, caseRow.id),
      eq(caseConcepts.role, 'primary'),
      eq(concepts.kind, 'topic'),
      eq(concepts.isActive, true)
    ))
    .limit(1);
  const primaryTopic = primaryTopics[0];
  if (!primaryTopic) {
    return buildCaseSpecificAdminPreview(input, caseRow);
  }

  const snapshot = await buildActiveReviewSnapshot({
    db: input.db,
    caseId: caseRow.id,
    studyConceptId: primaryTopic.studyConceptId,
    contentMode: input.contentMode,
    rng: input.rng ?? (() => 0)
  });
  return {
    candidate: { id: caseRow.id, title: caseRow.title, studyConceptId: primaryTopic.studyConceptId },
    snapshot: withPreviewImageUrls(snapshot)
  };
}
