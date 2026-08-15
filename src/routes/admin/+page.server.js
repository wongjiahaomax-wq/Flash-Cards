import { fail, redirect } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import { createDb } from '$lib/server/db/index.js';
import { assets, caseQuestions } from '$lib/server/db/schema.js';
import {
  AdminContentInputError,
  addCaseSecondaryTopic,
  createCase,
  createConcept,
  listAdminConcepts,
  promoteCaseTopic,
  removeCaseSecondaryTopic,
  updateCase,
  updateCaseVignette
} from '$lib/server/db/admin-content.js';
import {
  addStimulusOption,
  convertCaseAssetToStimulusOption,
  createStimulusGroup,
  getAdminStimulusData,
  moveStimulusOption,
  removeStimulusGroupQuestion,
  removeStimulusOptionQuestion,
  saveStimulusGroupQuestion,
  saveStimulusOptionQuestion,
  setStimulusOptionActive,
  StimulusGroupInputError,
  updateStimulusGroup
} from '$lib/server/db/stimulus-groups.js';
import {
  CaseQuestionInputError,
  listCaseQuestions,
  moveCaseQuestion,
  removeCaseQuestion,
  saveCaseQuestion
} from '$lib/server/db/case-questions.js';
import {
  attachAssetToCase,
  canManageCaseAssets,
  CaseAssetInputError,
  detachAssetFromCase,
  getAdminCaseData,
  listAdminCases,
  moveCaseAsset,
  updateCaseAssetCaption
} from '$lib/server/db/case-assets.js';
import {
  assertSupportedImageType,
  deleteTeachingImage,
  getTeachingImageUrl,
  MediaStorageLimitError,
  putTeachingImage
} from '$lib/server/storage/media.js';

class AssetInputError extends Error {}

/** @param {FormDataEntryValue | null} value */
function optionalText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

/**
 * @param {FormDataEntryValue | null} value
 * @param {string} label
 */
function requiredText(value, label) {
  const text = optionalText(value);
  if (!text) throw new AssetInputError(`${label} is required.`);
  return text;
}

/** @param {string | null} value */
function validateSourceUrl(value) {
  if (!value) return null;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new AssetInputError('Source URL must be a valid http(s) URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AssetInputError('Source URL must be a valid http(s) URL.');
  }

  return parsed.toString();
}

/** @param {string} mimeType */
function extensionForType(mimeType) {
  return mimeType === 'image/png' ? 'png' : 'jpg';
}

export async function load({ locals, platform, url }) {
  if (!canManageCaseAssets(locals.user)) {
    return { assets: [], cases: [], concepts: [], selectedCase: null, selectedConceptId: null };
  }

  const db = platform?.env?.DB ? createDb(platform.env.DB) : null;
  if (!db) return { assets: [], cases: [], concepts: [], selectedCase: null, selectedConceptId: null };

  const rows = await db.select().from(assets).orderBy(desc(assets.createdAt)).limit(100);
  const search = url.searchParams.get('q')?.trim().toLowerCase() ?? '';
  const caseRows = await listAdminCases(db, search);
  const conceptRows = await listAdminConcepts(db);
  const requestedId = url.searchParams.get('case');
  const selectedId = caseRows.some((item) => item.id === requestedId) ? requestedId : caseRows[0]?.id;
  const manager = selectedId ? await getAdminCaseData(db, selectedId) : null;
  const questionRows = selectedId ? await listCaseQuestions(db, selectedId) : [];
  const requestedConceptId = url.searchParams.get('concept');
  const selectedConceptId = conceptRows.some((item) => item.id === requestedConceptId)
    ? requestedConceptId
    : conceptRows[0]?.id ?? null;

  const stimulusGroups = selectedId ? await getAdminStimulusData(db, selectedId) : [];
  return {
    assets: rows.map((asset) => ({
      ...asset,
      imageUrl: getTeachingImageUrl(asset.id)
    })),
    concepts: conceptRows,
    selectedConceptId,
    cases: caseRows,
    questionCount: (await db.select().from(caseQuestions)).length,
    selectedCase: manager
      ? {
          ...manager,
          stimulusGroups: stimulusGroups.map((group) => ({
            ...group,
            options: group.options.map((asset) => ({
              ...asset,
              imageUrl: asset.assetIsActive ? getTeachingImageUrl(asset.assetId) : null
            }))
          })),
          questions: questionRows,
          attached: manager.attached.map((asset) => ({
            ...asset,
            imageUrl: asset.isActive ? getTeachingImageUrl(asset.assetId) : null
          })),
          available: manager.available.map((asset) => ({
            ...asset,
            imageUrl: getTeachingImageUrl(asset.assetId)
          }))
        }
      : null
  };
}

/** @param {unknown} error */
function actionError(error) {
  return error instanceof CaseAssetInputError || error instanceof AdminContentInputError || error instanceof CaseQuestionInputError || error instanceof StimulusGroupInputError
    ? error.message
    : 'Unable to update Case content.';
}

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {string} caseId @param {string} status */
function selectedCaseRedirect(caseId, status) {
  return `/admin/cases/${encodeURIComponent(caseId)}?status=${encodeURIComponent(status)}`;
}

export const actions = {
  createConcept: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    let concept;
    try {
      concept = await createConcept(createDb(platform.env.DB), formText(formData, 'name'));
    } catch (error) {
      return fail(error instanceof AdminContentInputError ? 400 : 500, { error: actionError(error) });
    }
    redirect(303, `/admin/cases/new?concept=${encodeURIComponent(concept.id)}&status=topic-created`);
  },

  createCase: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    let created;
    try {
      created = await createCase(createDb(platform.env.DB), {
        title: formText(formData, 'title'),
        vignetteMd: formText(formData, 'vignette_md'),
        conceptId: formText(formData, 'concept_id'),
        questionSelectionMode: formText(formData, 'question_selection_mode'),
        questionCount: formText(formData, 'question_count')
      });
    } catch (error) {
      return fail(error instanceof AdminContentInputError ? 400 : 500, { error: actionError(error) });
    }
    redirect(303, `/admin/cases/${encodeURIComponent(created.id)}`);
  },

  updateCase: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    try {
      await updateCase(createDb(platform.env.DB), {
        caseId,
        title: formText(formData, 'title'),
        vignetteMd: formText(formData, 'vignette_md'),
        conceptId: formText(formData, 'concept_id'),
        questionSelectionMode: formText(formData, 'question_selection_mode'),
        questionCount: formText(formData, 'question_count')
      });
    } catch (error) {
      return fail(error instanceof AdminContentInputError ? 400 : 500, { error: actionError(error), caseId });
    }
    redirect(303, selectedCaseRedirect(caseId, 'case-saved'));
  },

  addSecondaryTopic: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    try {
      await addCaseSecondaryTopic(createDb(platform.env.DB), {
        caseId,
        conceptId: formText(formData, 'concept_id')
      });
    } catch (error) {
      return fail(error instanceof AdminContentInputError ? 400 : 500, { error: actionError(error), caseId });
    }
    redirect(303, selectedCaseRedirect(caseId, 'topic-added'));
  },

  removeSecondaryTopic: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    try {
      await removeCaseSecondaryTopic(createDb(platform.env.DB), {
        caseId,
        conceptId: formText(formData, 'concept_id')
      });
    } catch (error) {
      return fail(error instanceof AdminContentInputError ? 400 : 500, { error: actionError(error), caseId });
    }
    redirect(303, selectedCaseRedirect(caseId, 'topic-removed'));
  },

  promoteTopic: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    try {
      await promoteCaseTopic(createDb(platform.env.DB), {
        caseId,
        conceptId: formText(formData, 'concept_id')
      });
    } catch (error) {
      return fail(error instanceof AdminContentInputError ? 400 : 500, { error: actionError(error), caseId });
    }
    redirect(303, selectedCaseRedirect(caseId, 'topic-promoted'));
  },

  vignette: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    try {
      await updateCaseVignette(createDb(platform.env.DB), caseId, formText(formData, 'vignette_md'));
    } catch (error) {
      return fail(error instanceof AdminContentInputError ? 400 : 500, { error: actionError(error), caseId });
    }
    redirect(303, selectedCaseRedirect(caseId, 'vignette-saved'));
  },

  saveQuestion: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    try {
      await saveCaseQuestion(createDb(platform.env.DB), {
        caseId,
        originalPromptId: formText(formData, 'original_prompt_id') || null,
        promptMd: formText(formData, 'prompt_md'),
        answerMd: formText(formData, 'answer_md'),
        reusableForTopic: formData.get('reusable_for_topic')
      });
    } catch (error) {
      return fail(error instanceof CaseQuestionInputError ? 400 : 500, { error: actionError(error), caseId });
    }
    redirect(303, selectedCaseRedirect(caseId, 'question-saved'));
  },

  removeQuestion: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    try {
      await removeCaseQuestion(createDb(platform.env.DB), caseId, formText(formData, 'prompt_id'));
    } catch (error) {
      return fail(error instanceof CaseQuestionInputError ? 400 : 500, { error: actionError(error), caseId });
    }
    redirect(303, selectedCaseRedirect(caseId, 'question-removed'));
  },

  reorderQuestion: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    const direction = formText(formData, 'direction');
    if (direction !== 'up' && direction !== 'down') {
      return fail(400, { error: 'A valid movement direction is required.', caseId });
    }
    try {
      await moveCaseQuestion(createDb(platform.env.DB), caseId, formText(formData, 'prompt_id'), direction);
    } catch (error) {
      return fail(error instanceof CaseQuestionInputError ? 400 : 500, { error: actionError(error), caseId });
    }
    redirect(303, selectedCaseRedirect(caseId, 'question-reordered'));
  },

  createStimulusGroup: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    try {
      await createStimulusGroup(createDb(platform.env.DB), { caseId, name: formText(formData, 'name'), specificQuestionMode: formText(formData, 'specific_question_mode'), minimumSpecificQuestions: formText(formData, 'minimum_specific_questions') });
    } catch (error) { return fail(error instanceof StimulusGroupInputError ? 400 : 500, { error: actionError(error), caseId }); }
    redirect(303, selectedCaseRedirect(caseId, 'stimulus-group-created'));
  },

  updateStimulusGroup: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    try { await updateStimulusGroup(createDb(platform.env.DB), { groupId: formText(formData, 'group_id'), name: formText(formData, 'name'), specificQuestionMode: formText(formData, 'specific_question_mode'), minimumSpecificQuestions: formText(formData, 'minimum_specific_questions'), isActive: formData.get('is_active') }); }
    catch (error) { return fail(error instanceof StimulusGroupInputError ? 400 : 500, { error: actionError(error), caseId }); }
    redirect(303, selectedCaseRedirect(caseId, 'stimulus-group-saved'));
  },

  addStimulusOption: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    try {
      const db = createDb(platform.env.DB);
      if (formData.get('convert_fixed') === 'on') await convertCaseAssetToStimulusOption(db, formText(formData, 'group_id'), formText(formData, 'asset_id'));
      else await addStimulusOption(db, formText(formData, 'group_id'), formText(formData, 'asset_id'), formText(formData, 'caption'));
    } catch (error) { return fail(error instanceof StimulusGroupInputError ? 400 : 500, { error: actionError(error), caseId }); }
    redirect(303, selectedCaseRedirect(caseId, 'stimulus-option-added'));
  },

  setStimulusOptionActive: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id');
    try { await setStimulusOptionActive(createDb(platform.env.DB), formText(formData, 'option_id'), formText(formData, 'active') === 'true'); }
    catch (error) { return fail(error instanceof StimulusGroupInputError ? 400 : 500, { error: actionError(error), caseId }); }
    redirect(303, selectedCaseRedirect(caseId, 'stimulus-option-saved'));
  },

  reorderStimulusOption: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id');
    const direction = formText(formData, 'direction');
    if (direction !== 'up' && direction !== 'down') return fail(400, { error: 'A valid movement direction is required.', caseId });
    try { await moveStimulusOption(createDb(platform.env.DB), formText(formData, 'group_id'), formText(formData, 'option_id'), direction); }
    catch (error) { return fail(error instanceof StimulusGroupInputError ? 400 : 500, { error: actionError(error), caseId }); }
    redirect(303, selectedCaseRedirect(caseId, 'stimulus-option-reordered'));
  },

  saveStimulusGroupQuestion: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id');
    try { await saveStimulusGroupQuestion(createDb(platform.env.DB), formText(formData, 'group_id'), { originalPromptId: formText(formData, 'original_prompt_id') || null, promptMd: formText(formData, 'prompt_md'), answerMd: formText(formData, 'answer_md') }); }
    catch (error) { return fail(error instanceof StimulusGroupInputError ? 400 : 500, { error: actionError(error), caseId }); }
    redirect(303, selectedCaseRedirect(caseId, 'stimulus-question-saved'));
  },

  saveStimulusOptionQuestion: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id');
    try { await saveStimulusOptionQuestion(createDb(platform.env.DB), formText(formData, 'option_id'), { originalPromptId: formText(formData, 'original_prompt_id') || null, promptMd: formText(formData, 'prompt_md'), answerMd: formText(formData, 'answer_md') }); }
    catch (error) { return fail(error instanceof StimulusGroupInputError ? 400 : 500, { error: actionError(error), caseId }); }
    redirect(303, selectedCaseRedirect(caseId, 'stimulus-question-saved'));
  },

  removeStimulusQuestion: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id');
    try {
      const db = createDb(platform.env.DB);
      if (formText(formData, 'scope') === 'option') await removeStimulusOptionQuestion(db, formText(formData, 'context_id'), formText(formData, 'prompt_id'));
      else await removeStimulusGroupQuestion(db, formText(formData, 'context_id'), formText(formData, 'prompt_id'));
    } catch (error) { return fail(error instanceof StimulusGroupInputError ? 400 : 500, { error: actionError(error), caseId }); }
    redirect(303, selectedCaseRedirect(caseId, 'stimulus-question-removed'));
  },

  upload: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });

    const env = platform?.env;
    if (!env?.DB || !env?.MEDIA) {
      return fail(503, { error: 'Image storage is not configured.' });
    }

    const formData = await request.formData();
    const imageValue = formData.get('image');

    if (
      !imageValue ||
      typeof imageValue !== 'object' ||
      typeof imageValue.size !== 'number' ||
      typeof imageValue.type !== 'string' ||
      typeof imageValue.arrayBuffer !== 'function'
    ) {
      return fail(400, { error: 'Choose a JPEG or PNG image to upload.' });
    }

    try {
      assertSupportedImageType(imageValue.type);
      const altText = requiredText(formData.get('alt_text'), 'Alt text');
      const sourceLabel = optionalText(formData.get('source_label'));
      const sourceUrl = validateSourceUrl(optionalText(formData.get('source_url')));
      const licence = optionalText(formData.get('licence'));
      const key = `teaching-images/${crypto.randomUUID()}.${extensionForType(imageValue.type)}`;

      await putTeachingImage(env.MEDIA, key, imageValue);

      try {
        const id = crypto.randomUUID();
        await createDb(env.DB).insert(assets).values({
          id,
          type: 'image',
          storageKey: key,
          mimeType: imageValue.type,
          originalFilename: optionalText(imageValue.name),
          altText,
          sourceLabel,
          sourceUrl,
          licence,
          isActive: true
        });
      } catch (metadataError) {
        try {
          await deleteTeachingImage(env.MEDIA, key);
        } catch (cleanupError) {
          console.error('Unable to clean up orphaned teaching image after metadata failure.', {
            key,
            cleanupError
          });
        }
        throw metadataError;
      }
    } catch (error) {
      const clientError = error instanceof AssetInputError || error instanceof MediaStorageLimitError;
      if (!clientError) {
        console.error('Teaching image upload failed.', error);
      }
      return fail(clientError ? 400 : 500, {
        error: error instanceof Error ? error.message : 'Unable to save the teaching image.'
      });
    }

    redirect(303, '/admin/cases?uploaded=1');
  },

  attach: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    const assetId = formText(formData, 'asset_id');
    try {
      await attachAssetToCase(createDb(platform.env.DB), caseId, assetId);
    } catch (error) {
      return fail(error instanceof CaseAssetInputError ? 400 : 500, { error: actionError(error), caseId });
    }
    redirect(303, selectedCaseRedirect(caseId, 'attached'));
  },

  detach: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    const assetId = formText(formData, 'asset_id');
    try {
      await detachAssetFromCase(createDb(platform.env.DB), caseId, assetId);
    } catch (error) {
      return fail(error instanceof CaseAssetInputError ? 400 : 500, { error: actionError(error), caseId });
    }
    redirect(303, selectedCaseRedirect(caseId, 'detached'));
  },

  caption: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    const assetId = formText(formData, 'asset_id');
    try {
      await updateCaseAssetCaption(createDb(platform.env.DB), caseId, assetId, formText(formData, 'caption'));
    } catch (error) {
      return fail(error instanceof CaseAssetInputError ? 400 : 500, { error: actionError(error), caseId });
    }
    redirect(303, selectedCaseRedirect(caseId, 'caption-saved'));
  },

  reorder: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    const assetId = formText(formData, 'asset_id');
    const direction = formText(formData, 'direction');
    if (direction !== 'up' && direction !== 'down') {
      return fail(400, { error: 'A valid movement direction is required.', caseId });
    }
    try {
      await moveCaseAsset(createDb(platform.env.DB), caseId, assetId, direction);
    } catch (error) {
      return fail(error instanceof CaseAssetInputError ? 400 : 500, { error: actionError(error), caseId });
    }
    redirect(303, selectedCaseRedirect(caseId, 'reordered'));
  }
};
