import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import {
  caseAssets,
  caseConcepts,
  caseQuestions,
  cases,
  concepts,
  questionPrompts,
  stimulusGroupOptions,
  stimulusGroupQuestions,
  stimulusGroups,
  stimulusOptionQuestions
} from '../schema.js';
import { caseQuestionTags, caseTags } from '../tag-schema.js';
import { requireActiveTopicConcept } from '../concept-taxonomy-compat.ts';
import { PreviewWorkspaceError } from './errors.js';
import { optionalText, requiredText } from './input.js';
import { requireOwnedPreviewCase, requireOwnedSession } from './ownership.js';

/** @typedef {import('../index.js').LearningDb} LearningDb */

function newId() {
  return crypto.randomUUID();
}

/** @param {Map<string, string>} idMap @param {string} sourceId @param {string} label */
function mappedId(idMap, sourceId, label) {
  const mapped = idMap.get(sourceId);
  if (!mapped) {
    throw new PreviewWorkspaceError(`The source Case contains a missing ${label} clone mapping.`, 'INVALID_SOURCE');
  }
  return mapped;
}

/** @param {LearningDb} db @param {string} [search] */
export async function listProductionCasesForPreview(db, search = '') {
  const rows = await db
    .select({
      id: cases.id,
      title: cases.title,
      vignetteMd: cases.vignetteMd,
      isActive: cases.isActive,
      conceptId: caseConcepts.conceptId,
      conceptName: concepts.name
    })
    .from(cases)
    .leftJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary')))
    .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
    .where(and(isNull(cases.previewSessionId), eq(cases.isActive, true)))
    .orderBy(asc(cases.title));
  const term = search.trim().toLocaleLowerCase();
  return term ? rows.filter((row) => row.title.toLocaleLowerCase().includes(term)) : rows;
}

/**
 * Clone one real Case and every Case-owned relationship that may be edited in Preview Mode.
 * Global Topics, Tags and production Assets are shared read-only; contextual Question Prompts are cloned.
 * Only the canonical primary Topic is copied. Legacy secondary Topic rows are
 * intentionally not recreated in Preview.
 *
 * The child-domain copies stay inside this single Case-clone transaction/orchestration boundary;
 * their ongoing image, stimulus, and question mutation APIs remain outside this module for later extraction.
 *
 * @param {LearningDb} db
 * @param {{ previewSessionId: string, userId: string, sourceCaseId: string }} input
 */
export async function cloneCaseToPreview(db, input) {
  const session = await requireOwnedSession(db, input.previewSessionId, input.userId);
  if (session.status !== 'active') {
    throw new PreviewWorkspaceError('The Preview workspace must be cleaned before it can be used.', 'CLEANUP_REQUIRED');
  }

  const source = (
    await db
      .select()
      .from(cases)
      .where(and(eq(cases.id, input.sourceCaseId), isNull(cases.previewSessionId)))
      .limit(1)
  )[0];
  if (!source) throw new PreviewWorkspaceError('Choose an existing production Case to copy.', 'INVALID_SOURCE');

  const [topicRows, fixedRows, groupRows, caseQuestionRows, sourceCaseTags] = await Promise.all([
    db.select().from(caseConcepts).where(and(eq(caseConcepts.caseId, source.id), eq(caseConcepts.role, 'primary'))),
    db.select().from(caseAssets).where(eq(caseAssets.caseId, source.id)),
    db.select().from(stimulusGroups).where(eq(stimulusGroups.caseId, source.id)).orderBy(asc(stimulusGroups.displayOrder)),
    db.select().from(caseQuestions).where(eq(caseQuestions.caseId, source.id)).orderBy(asc(caseQuestions.createdAt)),
    db.select().from(caseTags).where(eq(caseTags.caseId, source.id))
  ]);
  if (topicRows.length !== 1) {
    throw new PreviewWorkspaceError('The source Case must have exactly one canonical Topic before it can be copied.', 'INVALID_SOURCE');
  }

  const groupIds = groupRows.map((row) => row.id);
  const optionRows = groupIds.length
    ? await db
        .select()
        .from(stimulusGroupOptions)
        .where(and(inArray(stimulusGroupOptions.stimulusGroupId, groupIds), eq(stimulusGroupOptions.removedFromCase, false)))
        .orderBy(asc(stimulusGroupOptions.displayOrder))
    : [];
  const optionIds = optionRows.map((row) => row.id);
  const groupQuestionRows = groupIds.length
    ? await db.select().from(stimulusGroupQuestions).where(inArray(stimulusGroupQuestions.stimulusGroupId, groupIds))
    : [];
  const optionQuestionRows = optionIds.length
    ? await db.select().from(stimulusOptionQuestions).where(inArray(stimulusOptionQuestions.stimulusGroupOptionId, optionIds))
    : [];
  const sourceCaseQuestionIds = caseQuestionRows.map((row) => row.id);
  const sourceQuestionTags = sourceCaseQuestionIds.length
    ? await db.select().from(caseQuestionTags).where(inArray(caseQuestionTags.caseQuestionId, sourceCaseQuestionIds))
    : [];

  const sourcePromptIds = [...new Set([
    ...caseQuestionRows.map((row) => row.questionPromptId),
    ...groupQuestionRows.map((row) => row.questionPromptId),
    ...optionQuestionRows.map((row) => row.questionPromptId)
  ])];
  const sourcePrompts = sourcePromptIds.length
    ? await db.select().from(questionPrompts).where(inArray(questionPrompts.id, sourcePromptIds))
    : [];
  if (sourcePrompts.length !== sourcePromptIds.length) {
    throw new PreviewWorkspaceError('The source Case contains a missing Question Prompt.', 'INVALID_SOURCE');
  }

  const caseId = newId();
  const groupMap = new Map(groupRows.map((row) => [row.id, newId()]));
  const optionMap = new Map(optionRows.map((row) => [row.id, newId()]));
  const promptMap = new Map(sourcePrompts.map((row) => [row.id, newId()]));
  const caseQuestionMap = new Map(caseQuestionRows.map((row) => [row.id, newId()]));

  /** @type {any[]} */
  const writes = [
    db.insert(cases).values({
      id: caseId,
      title: source.title,
      vignetteMd: source.vignetteMd,
      questionSelectionMode: source.questionSelectionMode,
      questionCount: source.questionCount,
      previewSessionId: input.previewSessionId,
      isActive: source.isActive
    })
  ];

  if (sourcePrompts.length) {
    writes.push(db.insert(questionPrompts).values(sourcePrompts.map((row) => ({
      id: mappedId(promptMap, row.id, 'Question Prompt'),
      promptMd: row.promptMd,
      previewSessionId: input.previewSessionId,
      isActive: row.isActive
    }))));
  }
  writes.push(db.insert(caseConcepts).values({
    caseId,
    conceptId: topicRows[0].conceptId,
    role: 'primary',
    createdAt: topicRows[0].createdAt
  }));
  if (fixedRows.length) {
    writes.push(db.insert(caseAssets).values(fixedRows.map((row) => ({
      caseId,
      assetId: row.assetId,
      displayOrder: row.displayOrder,
      captionMd: row.captionMd,
      createdAt: row.createdAt
    }))));
  }
  if (groupRows.length) {
    writes.push(db.insert(stimulusGroups).values(groupRows.map((row) => ({
      id: mappedId(groupMap, row.id, 'Stimulus Group'),
      caseId,
      name: row.name,
      displayOrder: row.displayOrder,
      selectionCount: row.selectionCount,
      specificQuestionMode: row.specificQuestionMode,
      minimumSpecificQuestions: row.minimumSpecificQuestions,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }))));
  }
  if (optionRows.length) {
    writes.push(db.insert(stimulusGroupOptions).values(optionRows.map((row) => ({
      id: mappedId(optionMap, row.id, 'Stimulus Option'),
      stimulusGroupId: mappedId(groupMap, row.stimulusGroupId, 'Stimulus Group'),
      assetId: row.assetId,
      displayOrder: row.displayOrder,
      captionMd: row.captionMd,
      isActive: row.isActive,
      createdAt: row.createdAt
    }))));
  }
  if (caseQuestionRows.length) {
    writes.push(db.insert(caseQuestions).values(caseQuestionRows.map((row) => ({
      id: mappedId(caseQuestionMap, row.id, 'Case Question'),
      caseId,
      questionPromptId: mappedId(promptMap, row.questionPromptId, 'Question Prompt'),
      answerMd: row.answerMd,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }))));
  }
  if (groupQuestionRows.length) {
    writes.push(db.insert(stimulusGroupQuestions).values(groupQuestionRows.map((row) => ({
      id: newId(),
      stimulusGroupId: mappedId(groupMap, row.stimulusGroupId, 'Stimulus Group'),
      questionPromptId: mappedId(promptMap, row.questionPromptId, 'Question Prompt'),
      answerMd: row.answerMd,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }))));
  }
  if (optionQuestionRows.length) {
    writes.push(db.insert(stimulusOptionQuestions).values(optionQuestionRows.map((row) => ({
      id: newId(),
      stimulusGroupOptionId: mappedId(optionMap, row.stimulusGroupOptionId, 'Stimulus Option'),
      questionPromptId: mappedId(promptMap, row.questionPromptId, 'Question Prompt'),
      answerMd: row.answerMd,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }))));
  }
  if (sourceCaseTags.length) {
    writes.push(db.insert(caseTags).values(sourceCaseTags.map((row) => ({
      caseId,
      tagId: row.tagId,
      createdAt: row.createdAt
    }))));
  }
  if (sourceQuestionTags.length) {
    writes.push(db.insert(caseQuestionTags).values(sourceQuestionTags.map((row) => ({
      caseQuestionId: mappedId(caseQuestionMap, row.caseQuestionId, 'Case Question'),
      tagId: row.tagId,
      createdAt: row.createdAt
    }))));
  }

  if (typeof db.batch === 'function') await db.batch(/** @type {[any, ...any[]]} */ (writes));
  else for (const write of writes) await write;
  return caseId;
}

/** @param {LearningDb} db @param {string} previewSessionId */
export async function listPreviewCases(db, previewSessionId) {
  return db
    .select({ id: cases.id, title: cases.title, vignetteMd: cases.vignetteMd, isActive: cases.isActive })
    .from(cases)
    .where(eq(cases.previewSessionId, previewSessionId))
    .orderBy(asc(cases.title));
}

/** @param {LearningDb} db @param {string} conceptId */
async function requireActiveConcept(db, conceptId) {
  const row = await requireActiveTopicConcept(db, conceptId);
  if (!row) throw new PreviewWorkspaceError('Choose an active Topic.', 'INVALID_INPUT');
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {Record<string, unknown>} input */
export async function updatePreviewCase(db, previewSessionId, caseId, input) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  const title = requiredText(input.title, 'Case title');
  const mode = String(input.questionSelectionMode || 'automatic');
  if (!['automatic', 'all', 'fixed'].includes(mode)) {
    throw new PreviewWorkspaceError('Question selection mode is invalid.', 'INVALID_INPUT');
  }
  let questionCount = null;
  if (mode === 'fixed') {
    questionCount = Number(input.questionCount);
    if (!Number.isInteger(questionCount) || questionCount < 1) {
      throw new PreviewWorkspaceError('Fixed question count must be a positive integer.', 'INVALID_INPUT');
    }
  }
  const conceptId = optionalText(input.conceptId);
  if (conceptId) await promotePreviewTopic(db, previewSessionId, caseId, conceptId, { allowInsert: true });
  await db
    .update(cases)
    .set({
      title,
      vignetteMd: optionalText(input.vignetteMd),
      questionSelectionMode: mode,
      questionCount,
      updatedAt: new Date()
    })
    .where(and(eq(cases.id, caseId), eq(cases.previewSessionId, previewSessionId)));
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {string | null} vignetteMd */
export async function updatePreviewCaseVignette(db, previewSessionId, caseId, vignetteMd) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  await db
    .update(cases)
    .set({ vignetteMd: optionalText(vignetteMd), updatedAt: new Date() })
    .where(and(eq(cases.id, caseId), eq(cases.previewSessionId, previewSessionId)));
}

/**
 * @deprecated Additional Study Topics are not part of current Preview authoring.
 * @param {LearningDb} db
 * @param {string} previewSessionId
 * @param {string} caseId
 * @param {string} _conceptId
 */
export async function addPreviewSecondaryTopic(db, previewSessionId, caseId, _conceptId) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  throw new PreviewWorkspaceError('Additional Study Topics are no longer supported. Use Case Tags for alternate or cross-cutting classification.', 'INVALID_INPUT');
}

/**
 * @deprecated Secondary Study Topic mutation is not part of current Preview authoring.
 * @param {LearningDb} db
 * @param {string} previewSessionId
 * @param {string} caseId
 * @param {string} _conceptId
 */
export async function removePreviewSecondaryTopic(db, previewSessionId, caseId, _conceptId) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  throw new PreviewWorkspaceError('Additional Study Topics are no longer supported. Use Case Tags for alternate or cross-cutting classification.', 'INVALID_INPUT');
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {string} conceptId @param {{ allowInsert?: boolean }} [options] */
export async function promotePreviewTopic(db, previewSessionId, caseId, conceptId, options = {}) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  await requireActiveConcept(db, conceptId);
  const rows = await db.select().from(caseConcepts).where(eq(caseConcepts.caseId, caseId));
  const currentPrimary = rows.find((row) => row.role === 'primary');
  const targetSecondary = rows.find((row) => row.role === 'secondary' && row.conceptId === conceptId);
  if (currentPrimary?.conceptId === conceptId) return;
  if (!currentPrimary) {
    if (!options.allowInsert) throw new PreviewWorkspaceError('This Preview Case has no canonical Topic.', 'INVALID_INPUT');
    if (targetSecondary) {
      await db
        .update(caseConcepts)
        .set({ role: 'primary' })
        .where(and(eq(caseConcepts.caseId, caseId), eq(caseConcepts.conceptId, conceptId)));
      return;
    }
    await db.insert(caseConcepts).values({ caseId, conceptId, role: 'primary' });
    return;
  }

  const primaryWrite = db
    .update(caseConcepts)
    .set({ conceptId, role: 'primary' })
    .where(and(eq(caseConcepts.caseId, caseId), eq(caseConcepts.conceptId, currentPrimary.conceptId)));
  if (!targetSecondary) {
    await primaryWrite;
    return;
  }

  const secondaryDelete = db
    .delete(caseConcepts)
    .where(and(
      eq(caseConcepts.caseId, caseId),
      eq(caseConcepts.conceptId, conceptId),
      eq(caseConcepts.role, 'secondary')
    ));
  if (typeof db.batch === 'function') {
    await db.batch(/** @type {[any, ...any[]]} */ ([secondaryDelete, primaryWrite]));
    return;
  }

  await secondaryDelete;
  try {
    await primaryWrite;
  } catch (error) {
    try {
      await db.insert(caseConcepts).values({ caseId, conceptId, role: 'secondary' });
    } catch (cleanupError) {
      console.error('Unable to restore a legacy Preview secondary Topic after a failed Primary Topic change.', cleanupError);
    }
    throw error;
  }
}
