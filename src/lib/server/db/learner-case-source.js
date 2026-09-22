import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import {
  assets,
  caseAssets,
  caseConcepts,
  caseQuestions,
  cases,
  conceptQuestions,
  questionPrompts
} from './schema.js';
import { caseTags, sharedQuestions, tags } from './tag-schema.js';
import { listActiveConceptTaxonomy } from './concept-taxonomy-compat.ts';
import { loadLearnerStimulusFamilies } from './learner-stimulus-families.js';
import { resolveQuestionPoolForMode } from '../learning/question-pool-mode.ts';

/** @typedef {import('./index.js').LearningDb} LearningDb */
/** @typedef {import('../learning/question-pool-mode.ts').QuestionPoolMode} QuestionPoolMode */

/** @param {LearningDb} db @param {string} caseId @param {string} studyConceptId @param {QuestionPoolMode} questionPoolMode @param {() => number} rng */
export async function loadCaseSource(db, caseId, studyConceptId, questionPoolMode, rng) {
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
  const studyLink = caseTopicRows.find((topic) => topic.conceptId === studyConceptId && topic.role === 'primary');
  if (!primaryConceptId || !studyLink) return null;

  const conceptRows = (await listActiveConceptTaxonomy(db)).map((concept) => ({
    id: concept.id,
    name: concept.name,
    kind: concept.kind,
    parentId: concept.parentId
  }));
  const primaryConcept = conceptRows.find((concept) => concept.id === primaryConceptId && concept.kind === 'topic');
  const studyConcept = conceptRows.find((concept) => concept.id === studyConceptId && concept.kind === 'topic');
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

  const caseQuestionRows = await db
    .select({ questionPromptId: caseQuestions.questionPromptId, answerMd: caseQuestions.answerMd, isActive: caseQuestions.isActive })
    .from(caseQuestions)
    .where(and(eq(caseQuestions.caseId, caseId), eq(caseQuestions.isActive, true)))
    .orderBy(asc(caseQuestions.createdAt), asc(caseQuestions.questionPromptId));
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
  const studyQuestionRows = conceptQuestionRows
    .filter((question) => question.conceptId === studyConcept.id)
    .map((question) => ({ ...question, sourceConceptId: question.conceptId }));
  const ancestorQuestionRows = conceptQuestionRows
    .filter((question) => question.conceptId !== studyConcept.id)
    .map((question) => ({
      ...question,
      sourceConceptId: question.conceptId,
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
  const tagSharedQuestionRows = sharedQuestionRows
    .map((question) => ({ ...question, sourceSharedQuestionId: question.id }));

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

  const stimulus = await loadLearnerStimulusFamilies(db, {
    caseId,
    questionPoolMode,
    rng,
    fixedAssetCount: assetRows.length
  });

  const promptSources = questionPoolMode === 'core'
    ? [caseQuestionRows, stimulus.stimulusGroupQuestions, stimulus.stimulusOptionQuestions]
    : [
        caseQuestionRows,
        studyQuestionRows,
        tagSharedQuestionRows,
        ancestorQuestionRows,
        stimulus.stimulusGroupQuestions,
        stimulus.reusableAssetQuestions,
        stimulus.stimulusOptionQuestions
      ];
  const prompts = await loadActiveQuestionPrompts(
    db,
    promptSources.flatMap((questions) => questions.map((question) => question.questionPromptId))
  );
  const caseQuestionInputs = attachActivePromptText(caseQuestionRows, prompts);
  const studyQuestions = attachActivePromptText(studyQuestionRows, prompts);
  const ancestorQuestions = attachActivePromptText(ancestorQuestionRows, prompts);
  const tagSharedQuestions = attachActivePromptText(tagSharedQuestionRows, prompts);
  const stimulusGroupQuestions = attachActivePromptText(stimulus.stimulusGroupQuestions, prompts);
  const reusableAssetQuestions = attachActivePromptText(stimulus.reusableAssetQuestions, prompts);
  const stimulusOptionQuestions = attachActivePromptText(stimulus.stimulusOptionQuestions, prompts);

  const questionPool = resolveQuestionPoolForMode(questionPoolMode, {
    caseQuestions: caseQuestionInputs,
    studyConceptQuestions: studyQuestions,
    tagSharedQuestions,
    ancestorConceptQuestions: ancestorQuestions,
    stimulusGroupQuestions,
    assetQuestions: reusableAssetQuestions,
    stimulusOptionQuestions
  });

  return {
    case: caseRow,
    primaryConcept,
    studyConcept,
    questionPool,
    assets: [
      ...assetRows.map((asset) => ({ ...asset, stimulusGroupId: null, stimulusOptionId: null })),
      ...stimulus.assets
    ],
    groupCoverage: stimulus.groupCoverage
  };
}

const ACTIVE_PROMPT_QUERY_BATCH_SIZE = 99; // Leaves one D1 bind for the active-state predicate.

/** @param {LearningDb} db @param {string[]} questionPromptIds */
async function loadActiveQuestionPrompts(db, questionPromptIds) {
  const ids = [...new Set(questionPromptIds)];
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += ACTIVE_PROMPT_QUERY_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + ACTIVE_PROMPT_QUERY_BATCH_SIZE);
    rows.push(...await db
      .select({ id: questionPrompts.id, promptMd: questionPrompts.promptMd })
      .from(questionPrompts)
      .where(and(
        eq(questionPrompts.isActive, true),
        isNull(questionPrompts.previewSessionId),
        inArray(questionPrompts.id, batch)
      )));
  }
  return new Map(rows.map((prompt) => [prompt.id, prompt.promptMd]));
}

/**
 * @template {{ questionPromptId: string }} T
 * @param {T[]} questions
 * @param {Map<string, string>} prompts
 * @returns {(T & { promptMd: string })[]}
 */
function attachActivePromptText(questions, prompts) {
  return questions
    .filter((question) => prompts.has(question.questionPromptId))
    .map((question) => ({ ...question, promptMd: prompts.get(question.questionPromptId) ?? '' }));
}
