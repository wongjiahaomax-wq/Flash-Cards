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

  const promptRows = await db
    .select({ id: questionPrompts.id, promptMd: questionPrompts.promptMd })
    .from(questionPrompts)
    .where(and(eq(questionPrompts.isActive, true), isNull(questionPrompts.previewSessionId)));
  const prompts = new Map(promptRows.map((prompt) => [prompt.id, prompt.promptMd]));

  const caseQuestionRows = await db
    .select({ questionPromptId: caseQuestions.questionPromptId, answerMd: caseQuestions.answerMd, isActive: caseQuestions.isActive })
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
    .map((question) => ({ ...question, sourceConceptId: question.conceptId, promptMd: prompts.get(question.questionPromptId) ?? '' }));
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
    .map((question) => ({ ...question, promptMd: prompts.get(question.questionPromptId) ?? '', sourceSharedQuestionId: question.id }));

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
    prompts,
    fixedAssetCount: assetRows.length
  });
  const questionPool = resolveQuestionPoolForMode(questionPoolMode, {
    caseQuestions: caseQuestionInputs,
    studyConceptQuestions: studyQuestions,
    tagSharedQuestions,
    ancestorConceptQuestions: ancestorQuestions,
    stimulusGroupQuestions: stimulus.stimulusGroupQuestions,
    assetQuestions: stimulus.reusableAssetQuestions,
    stimulusOptionQuestions: stimulus.stimulusOptionQuestions
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
