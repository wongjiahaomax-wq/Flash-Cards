import { and, eq, isNull, or } from 'drizzle-orm';

import {
  assets,
  cases,
  previewSessions,
  questionPrompts,
  stimulusGroupOptions,
  stimulusGroups
} from '../schema.js';
import { PreviewWorkspaceError } from './errors.js';

/** @typedef {import('../index.js').LearningDb} LearningDb */

/** @param {LearningDb} db @param {string} previewSessionId @param {string} userId */
export async function requireOwnedSession(db, previewSessionId, userId) {
  const row = (
    await db
      .select()
      .from(previewSessions)
      .where(and(eq(previewSessions.id, previewSessionId), eq(previewSessions.userId, userId)))
      .limit(1)
  )[0];
  if (!row) throw new PreviewWorkspaceError('The Preview workspace does not belong to this user.', 'NOT_OWNED');
  return row;
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId */
export async function requireOwnedPreviewCase(db, previewSessionId, caseId) {
  const row = (
    await db
      .select()
      .from(cases)
      .where(and(eq(cases.id, caseId), eq(cases.previewSessionId, previewSessionId)))
      .limit(1)
  )[0];
  if (!row) throw new PreviewWorkspaceError('This Case is not owned by the current Preview workspace.', 'NOT_OWNED');
  return row;
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} promptId */
export async function requireOwnedPreviewPrompt(db, previewSessionId, promptId) {
  const row = (
    await db
      .select()
      .from(questionPrompts)
      .where(and(eq(questionPrompts.id, promptId), eq(questionPrompts.previewSessionId, previewSessionId)))
      .limit(1)
  )[0];
  if (!row) throw new PreviewWorkspaceError('This Question Prompt is not owned by the current Preview workspace.', 'NOT_OWNED');
  return row;
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} groupId */
export async function requireOwnedPreviewGroup(db, previewSessionId, groupId) {
  const row = (
    await db
      .select({
        id: stimulusGroups.id,
        caseId: stimulusGroups.caseId,
        isActive: stimulusGroups.isActive,
        specificQuestionMode: stimulusGroups.specificQuestionMode,
        minimumSpecificQuestions: stimulusGroups.minimumSpecificQuestions
      })
      .from(stimulusGroups)
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .where(and(eq(stimulusGroups.id, groupId), eq(cases.previewSessionId, previewSessionId)))
      .limit(1)
  )[0];
  if (!row) throw new PreviewWorkspaceError('This Stimulus Group is not owned by the current Preview workspace.', 'NOT_OWNED');
  return row;
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} optionId */
export async function requireOwnedPreviewOption(db, previewSessionId, optionId) {
  const row = (
    await db
      .select({ id: stimulusGroupOptions.id, groupId: stimulusGroupOptions.stimulusGroupId, caseId: stimulusGroups.caseId })
      .from(stimulusGroupOptions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .where(and(eq(stimulusGroupOptions.id, optionId), eq(cases.previewSessionId, previewSessionId)))
      .limit(1)
  )[0];
  if (!row) throw new PreviewWorkspaceError('This Stimulus Option is not owned by the current Preview workspace.', 'NOT_OWNED');
  return row;
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} assetId */
export async function requirePreviewUsableAsset(db, previewSessionId, assetId) {
  const row = (
    await db
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.id, assetId),
          eq(assets.isActive, true),
          or(isNull(assets.previewSessionId), eq(assets.previewSessionId, previewSessionId))
        )
      )
      .limit(1)
  )[0];
  if (!row || row.type !== 'image') {
    throw new PreviewWorkspaceError('The selected image is not available to this Preview workspace.', 'NOT_OWNED');
  }
  return row;
}
