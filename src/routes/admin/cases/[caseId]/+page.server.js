import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

import { listAdminConcepts } from '$lib/server/db/admin-content.js';
import { createAssetFromUpload, AssetLibraryInputError } from '$lib/server/db/asset-library.js';
import { canManageCaseAssets, getAdminCaseData } from '$lib/server/db/case-assets.js';
import { listCaseQuestions } from '$lib/server/db/case-questions.js';
import {
  AdminImageWorkflowInputError,
  attachAssetsToCase,
  bulkAddAssetsToStimulusGroup,
  listActiveStimulusGroupTargets,
  listCaseImagePicker
} from '$lib/server/db/admin-image-workflow.js';
import { createDb } from '$lib/server/db/index.js';
import { caseAssets, stimulusGroups } from '$lib/server/db/schema.js';
import {
  convertCaseAssetToStimulusOption,
  createStimulusGroup,
  getAdminStimulusData,
  StimulusGroupInputError
} from '$lib/server/db/stimulus-groups.js';
import { getTeachingImageUrl, MediaStorageLimitError } from '$lib/server/storage/media.js';
import { actions as parentActions } from '../../+page.server.js';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {FormData} formData */
function selectedAssetIds(formData) {
  return formData.getAll('asset_id').filter((value) => typeof value === 'string').map((value) => value.trim()).filter(Boolean);
}

export async function load({ locals, platform, params, url }) {
  const pickerOpen = url.searchParams.get('picker') === '1';
  const pickerSearch = url.searchParams.get('image_q')?.trim() ?? '';
  if (!canManageCaseAssets(locals.user) || !platform?.env?.DB) {
    return {
      concepts: [],
      selectedCase: null,
      imagePicker: { open: pickerOpen, search: pickerSearch, assets: [], hasMore: false, targetGroupId: null, targetGroupName: null }
    };
  }

  const db = createDb(platform.env.DB);
  const [concepts, manager, questions, stimulusGroupsData] = await Promise.all([
    listAdminConcepts(db),
    getAdminCaseData(db, params.caseId, { includeAvailable: false }),
    listCaseQuestions(db, params.caseId).catch(() => []),
    getAdminStimulusData(db, params.caseId).catch(() => [])
  ]);
  if (!manager) {
    return {
      concepts,
      selectedCase: null,
      imagePicker: { open: pickerOpen, search: pickerSearch, assets: [], hasMore: false, targetGroupId: null, targetGroupName: null }
    };
  }

  const stimulusGroups = stimulusGroupsData.map((group) => ({
    ...group,
    options: group.options.map((option) => ({
      ...option,
      imageUrl: option.assetIsActive ? getTeachingImageUrl(option.assetId) : null
    }))
  }));
  const targetRequested = url.searchParams.get('target_group')?.trim() ?? '';
  const targetGroup = stimulusGroups.find((group) => group.id === targetRequested && group.isActive) ?? null;
  const pickerResults = pickerOpen
    ? await listCaseImagePicker(db, params.caseId, { search: pickerSearch })
    : { assets: [], hasMore: false, limit: 60, search: pickerSearch };

  return {
    concepts,
    selectedCase: {
      ...manager,
      questions,
      stimulusGroups,
      attached: manager.attached.map((asset) => ({
        ...asset,
        imageUrl: asset.isActive ? getTeachingImageUrl(asset.assetId) : null
      }))
    },
    imagePicker: {
      open: pickerOpen,
      search: pickerSearch,
      ...pickerResults,
      targetGroupId: targetGroup?.id ?? null,
      targetGroupName: targetGroup?.name ?? null
    }
  };
}

export const actions = {
  ...parentActions,

  attachMany: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id') || params.caseId;
    if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    const ids = selectedAssetIds(formData);
    const targetGroupId = formText(formData, 'target_group_id');
    try {
      const db = createDb(platform.env.DB);
      if (targetGroupId) await bulkAddAssetsToStimulusGroup(db, targetGroupId, ids, { expectedCaseId: caseId });
      else await attachAssetsToCase(db, caseId, ids);
    } catch (error) {
      const clientError = error instanceof AdminImageWorkflowInputError;
      if (!clientError) console.error('Unable to attach selected Case images.', error);
      return fail(clientError ? 400 : 500, { error: clientError ? error.message : 'Unable to attach the selected images.' });
    }
    redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=images-attached#images`);
  },

  uploadAndAttach: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB || !platform.env.MEDIA) return fail(503, { error: 'Image storage is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id') || params.caseId;
    if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    const targetGroupId = formText(formData, 'target_group_id');
    const imageValue = formData.get('image');
    if (
      !imageValue || typeof imageValue !== 'object' || typeof imageValue.size !== 'number' ||
      typeof imageValue.type !== 'string' || typeof imageValue.arrayBuffer !== 'function'
    ) return fail(400, { error: 'Choose a JPEG or PNG image to upload.' });

    const db = createDb(platform.env.DB);
    try {
      const caseData = await getAdminCaseData(db, caseId, { includeAvailable: false });
      if (!caseData) throw new AdminImageWorkflowInputError('The selected Case is missing or inactive.');
      if (targetGroupId) {
        const targets = await listActiveStimulusGroupTargets(db);
        if (!targets.some((target) => target.id === targetGroupId && target.caseId === caseId)) {
          throw new AdminImageWorkflowInputError('The selected alternative image set is missing or inactive.');
        }
      }
      const created = await createAssetFromUpload(db, platform.env.MEDIA, imageValue, {
        originalFilename: formText(formData, 'image_name'),
        altText: formText(formData, 'alt_text'),
        sourceLabel: formText(formData, 'source_label'),
        sourceUrl: formText(formData, 'source_url'),
        licence: formText(formData, 'licence')
      });
      if (targetGroupId) await bulkAddAssetsToStimulusGroup(db, targetGroupId, [created.id], { expectedCaseId: caseId });
      else await attachAssetsToCase(db, caseId, [created.id]);
    } catch (error) {
      const clientError = error instanceof AdminImageWorkflowInputError || error instanceof AssetLibraryInputError || error instanceof MediaStorageLimitError;
      if (!clientError) console.error('Case image upload failed.', error);
      return fail(clientError ? 400 : 500, { error: error instanceof Error ? error.message : 'Unable to save the teaching image.' });
    }
    redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=image-uploaded#images`);
  },

  startAlternativeSet: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id') || params.caseId;
    const assetId = formText(formData, 'asset_id');
    const name = formText(formData, 'set_name');
    if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.', caseId });

    const db = createDb(platform.env.DB);
    let createdGroupId = null;
    try {
      const fixed = await db
        .select({ assetId: caseAssets.assetId })
        .from(caseAssets)
        .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId)))
        .limit(1);
      if (!fixed[0]) throw new StimulusGroupInputError('Choose a fixed image from this Case to start an alternative set.');
      createdGroupId = await createStimulusGroup(db, { caseId, name, specificQuestionMode: 'none' });
      await convertCaseAssetToStimulusOption(db, createdGroupId, assetId);
    } catch (error) {
      if (createdGroupId) {
        try { await db.delete(stimulusGroups).where(eq(stimulusGroups.id, createdGroupId)); } catch { /* best-effort cleanup */ }
      }
      return fail(error instanceof StimulusGroupInputError ? 400 : 500, {
        error: error instanceof StimulusGroupInputError ? error.message : 'Unable to start an alternative image set.', caseId
      });
    }
    redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=alternative-set-created#images`);
  }
};
