import { fail, redirect } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import {
  addPreviewSecondaryTopic,
  addPreviewStimulusOption,
  attachPreviewAsset,
  convertPreviewFixedAssetToOption,
  createPreviewAssetFromUpload,
  createPreviewStimulusGroup,
  detachPreviewAsset,
  getLivePreviewSession,
  loadPreviewCaseEditor,
  movePreviewCaseAsset,
  movePreviewCaseQuestion,
  movePreviewStimulusOption,
  PreviewWorkspaceError,
  promotePreviewTopic,
  removePreviewCaseQuestion,
  removePreviewSecondaryTopic,
  removePreviewStimulusQuestion,
  savePreviewCaseQuestion,
  savePreviewStimulusQuestion,
  setPreviewStimulusOptionActive,
  startPreviewAlternativeSet,
  updatePreviewAssetCaption,
  updatePreviewCase,
  updatePreviewCaseVignette,
  updatePreviewStimulusGroup
} from '$lib/server/db/preview-workspace.js';
import { requirePreviewAdmin } from '$lib/server/preview-auth.js';
import { MediaStorageLimitError } from '$lib/server/storage/media.js';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {unknown} error */
function actionError(error) {
  return error instanceof Error ? error.message : 'Unable to update the Preview workspace.';
}

/** @param {unknown} error */
function actionStatus(error) {
  if (error instanceof MediaStorageLimitError) return 400;
  if (!(error instanceof PreviewWorkspaceError)) return 500;
  if (error.code === 'NOT_OWNED' || error.code === 'GLOBAL_WRITE_BLOCKED') return 403;
  if (error.code === 'CLEANUP_REQUIRED') return 409;
  return 400;
}

/** @param {string} caseId @param {string} status @param {string} [hash] */
function caseRedirect(caseId, status, hash = '') {
  return `/preview-admin/cases/${encodeURIComponent(caseId)}?status=${encodeURIComponent(status)}${hash}`;
}

/** @param {{ locals: App.Locals, platform?: App.Platform }} event */
async function activeContext({ locals, platform }) {
  const env = platform?.env;
  const userId = requirePreviewAdmin({ user: locals.user, env });
  if (!env?.DB) throw new PreviewWorkspaceError('The study database is not configured.', 'CONFIGURATION');
  const db = createDb(env.DB);
  const session = await getLivePreviewSession(db, userId);
  if (!session || session.status !== 'active' || Number(session.expiresAt) <= Date.now()) {
    throw new PreviewWorkspaceError(
      'The Preview workspace is expired or requires cleanup. Reload this page before continuing.',
      'CLEANUP_REQUIRED'
    );
  }
  return { env, db, userId, session };
}

/** @param {any} event */
async function contextOrFailure(event) {
  try {
    return { context: await activeContext(event), failure: null };
  } catch (error) {
    return { context: null, failure: fail(actionStatus(error), { error: actionError(error) }) };
  }
}

export async function load({ parent, params, platform }) {
  const parentData = await parent();
  const env = platform?.env;
  if (!env?.DB || parentData.workspace.status !== 'active' || parentData.workspaceError) {
    return {
      assets: [],
      concepts: [],
      cases: [],
      questionCount: 0,
      selectedCase: null,
      previewMode: true,
      workspaceBlocked: true
    };
  }
  return {
    ...(await loadPreviewCaseEditor(createDb(env.DB), parentData.workspace.id, params.caseId)),
    workspaceBlocked: false
  };
}

export const actions = {
  createConcept: async () => fail(403, { error: 'Global Topic editing is unavailable in Preview Mode.' }),
  createCase: async () => fail(403, { error: 'Create a Preview Copy from an existing production Case instead.' }),

  updateCase: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    if (caseId !== event.params.caseId) return fail(400, { error: 'The selected Case does not match this editor.', caseId });
    try {
      await updatePreviewCase(result.context.db, result.context.session.id, caseId, {
        title: formText(formData, 'title'),
        vignetteMd: formText(formData, 'vignette_md'),
        conceptId: formText(formData, 'concept_id'),
        questionSelectionMode: formText(formData, 'question_selection_mode'),
        questionCount: formText(formData, 'question_count')
      });
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'case-saved', '#case'));
  },

  addSecondaryTopic: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    try {
      await addPreviewSecondaryTopic(result.context.db, result.context.session.id, caseId, formText(formData, 'concept_id'));
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'topic-added', '#topics'));
  },

  removeSecondaryTopic: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    try {
      await removePreviewSecondaryTopic(result.context.db, result.context.session.id, caseId, formText(formData, 'concept_id'));
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'topic-removed', '#topics'));
  },

  promoteTopic: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    try {
      await promotePreviewTopic(result.context.db, result.context.session.id, caseId, formText(formData, 'concept_id'));
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'topic-promoted', '#topics'));
  },

  vignette: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    try {
      await updatePreviewCaseVignette(result.context.db, result.context.session.id, caseId, formText(formData, 'vignette_md'));
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'vignette-saved', '#case'));
  },

  saveQuestion: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    try {
      await savePreviewCaseQuestion(result.context.db, result.context.session.id, caseId, {
        originalPromptId: formText(formData, 'original_prompt_id') || null,
        promptMd: formText(formData, 'prompt_md'),
        answerMd: formText(formData, 'answer_md'),
        reusableForTopic: formData.get('reusable_for_topic')
      });
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'question-saved', '#questions'));
  },

  removeQuestion: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    try {
      await removePreviewCaseQuestion(result.context.db, result.context.session.id, caseId, formText(formData, 'prompt_id'));
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'question-removed', '#questions'));
  },

  reorderQuestion: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    const direction = formText(formData, 'direction');
    if (direction !== 'up' && direction !== 'down') return fail(400, { error: 'Choose a valid movement direction.', caseId });
    try {
      await movePreviewCaseQuestion(result.context.db, result.context.session.id, caseId, formText(formData, 'prompt_id'), direction);
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'question-reordered', '#questions'));
  },

  createStimulusGroup: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    try {
      await createPreviewStimulusGroup(result.context.db, result.context.session.id, caseId, {
        name: formText(formData, 'name'),
        specificQuestionMode: formText(formData, 'specific_question_mode'),
        minimumSpecificQuestions: formText(formData, 'minimum_specific_questions')
      });
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'stimulus-group-created', '#stimuli'));
  },

  startAlternativeSet: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    try {
      await startPreviewAlternativeSet(
        result.context.db,
        result.context.session.id,
        caseId,
        formText(formData, 'asset_id'),
        formText(formData, 'set_name')
      );
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'alternative-set-created', '#stimuli'));
  },

  updateStimulusGroup: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    try {
      await updatePreviewStimulusGroup(result.context.db, result.context.session.id, formText(formData, 'group_id'), {
        name: formText(formData, 'name'),
        specificQuestionMode: formText(formData, 'specific_question_mode'),
        minimumSpecificQuestions: formText(formData, 'minimum_specific_questions'),
        isActive: formData.get('is_active')
      });
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'stimulus-group-saved', '#stimuli'));
  },

  addStimulusOption: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    try {
      if (formData.get('convert_fixed') === 'on') {
        await convertPreviewFixedAssetToOption(
          result.context.db,
          result.context.session.id,
          formText(formData, 'group_id'),
          formText(formData, 'asset_id')
        );
      } else {
        await addPreviewStimulusOption(
          result.context.db,
          result.context.session.id,
          formText(formData, 'group_id'),
          formText(formData, 'asset_id'),
          formText(formData, 'caption')
        );
      }
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'stimulus-option-added', '#stimuli'));
  },

  setStimulusOptionActive: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    try {
      await setPreviewStimulusOptionActive(
        result.context.db,
        result.context.session.id,
        formText(formData, 'option_id'),
        formText(formData, 'active') === 'true'
      );
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'stimulus-option-saved', '#stimuli'));
  },

  reorderStimulusOption: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    const direction = formText(formData, 'direction');
    if (direction !== 'up' && direction !== 'down') return fail(400, { error: 'Choose a valid movement direction.', caseId });
    try {
      await movePreviewStimulusOption(
        result.context.db,
        result.context.session.id,
        formText(formData, 'group_id'),
        formText(formData, 'option_id'),
        direction
      );
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'stimulus-option-reordered', '#stimuli'));
  },

  saveStimulusGroupQuestion: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    try {
      await savePreviewStimulusQuestion(result.context.db, result.context.session.id, 'group', formText(formData, 'group_id'), {
        originalPromptId: formText(formData, 'original_prompt_id') || null,
        promptMd: formText(formData, 'prompt_md'),
        answerMd: formText(formData, 'answer_md')
      });
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'stimulus-question-saved', '#stimuli'));
  },

  saveStimulusOptionQuestion: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    try {
      await savePreviewStimulusQuestion(result.context.db, result.context.session.id, 'option', formText(formData, 'option_id'), {
        originalPromptId: formText(formData, 'original_prompt_id') || null,
        promptMd: formText(formData, 'prompt_md'),
        answerMd: formText(formData, 'answer_md')
      });
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'stimulus-question-saved', '#stimuli'));
  },

  removeStimulusQuestion: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    const scope = formText(formData, 'scope') === 'option' ? 'option' : 'group';
    try {
      await removePreviewStimulusQuestion(
        result.context.db,
        result.context.session.id,
        scope,
        formText(formData, 'context_id'),
        formText(formData, 'prompt_id')
      );
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'stimulus-question-removed', '#stimuli'));
  },

  upload: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    if (!result.context.env.MEDIA) return fail(503, { error: 'Image storage is not configured.' });
    const formData = await event.request.formData();
    const caseId = event.params.caseId;
    const image = formData.get('image');
    if (
      !image ||
      typeof image !== 'object' ||
      typeof image.size !== 'number' ||
      typeof image.type !== 'string' ||
      typeof image.arrayBuffer !== 'function'
    ) {
      return fail(400, { error: 'Choose a JPEG or PNG image to upload.', caseId });
    }
    try {
      await createPreviewAssetFromUpload(
        result.context.db,
        result.context.env.MEDIA,
        result.context.session.id,
        image,
        {
          altText: formText(formData, 'alt_text'),
          sourceLabel: formText(formData, 'source_label'),
          sourceUrl: formText(formData, 'source_url'),
          licence: formText(formData, 'licence')
        }
      );
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'preview-image-uploaded', '#images'));
  },

  attach: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    try {
      await attachPreviewAsset(result.context.db, result.context.session.id, caseId, formText(formData, 'asset_id'));
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'attached', '#images'));
  },

  detach: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    try {
      await detachPreviewAsset(result.context.db, result.context.session.id, caseId, formText(formData, 'asset_id'));
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'detached', '#images'));
  },

  caption: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    try {
      await updatePreviewAssetCaption(
        result.context.db,
        result.context.session.id,
        caseId,
        formText(formData, 'asset_id'),
        formText(formData, 'caption')
      );
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'caption-saved', '#images'));
  },

  reorder: async (event) => {
    const result = await contextOrFailure(event);
    if (!result.context) return result.failure;
    const formData = await event.request.formData();
    const caseId = formText(formData, 'case_id') || event.params.caseId;
    const direction = formText(formData, 'direction');
    if (direction !== 'up' && direction !== 'down') return fail(400, { error: 'Choose a valid movement direction.', caseId });
    try {
      await movePreviewCaseAsset(
        result.context.db,
        result.context.session.id,
        caseId,
        formText(formData, 'asset_id'),
        direction
      );
    } catch (error) {
      return fail(actionStatus(error), { error: actionError(error), caseId });
    }
    redirect(303, caseRedirect(caseId, 'reordered', '#images'));
  }
};
