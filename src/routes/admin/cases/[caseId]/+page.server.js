import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

import { AdminContentInputError, createCaseTopic, listAdminConcepts } from '$lib/server/db/admin-content.js';
import { createAssetFromUpload, AssetLibraryInputError } from '$lib/server/db/asset-library.js';
import { AssetQuestionInputError, createAssetQuestion, optInAssetQuestion, optInFixedAssetQuestion, removeAssetQuestionOptIn, updateAssetQuestionAnswer } from '$lib/server/db/asset-questions.js';
import { canManageCaseAssets, getAdminCaseData } from '$lib/server/db/case-assets.js';
import { listCaseImageQuestionSummaries } from '$lib/server/db/case-image-question-summaries.js';
import { listCaseQuestions } from '$lib/server/db/case-questions.js';
import { AdminImageWorkflowInputError, attachAssetsToCase, bulkAddAssetsToStimulusGroup, listCaseImagePicker, updateStimulusOptionCaption, validateStimulusGroupTargetForNewAssets } from '$lib/server/db/admin-image-workflow.js';
import { createDb } from '$lib/server/db/index.js';
import { caseAssets, stimulusGroups } from '$lib/server/db/schema.js';
import { convertCaseAssetToStimulusOption, createStimulusGroup, getAdminStimulusData, StimulusGroupInputError } from '$lib/server/db/stimulus-groups.js';
import { getTeachingImageUrl, MediaStorageLimitError } from '$lib/server/storage/media.js';
import { actions as parentActions } from '../../+page.server.js';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) { const value = formData.get(name); return typeof value === 'string' ? value.trim() : ''; }
/** @param {FormData} formData */
function selectedAssetIds(formData) { return formData.getAll('asset_id').filter((value) => typeof value === 'string').map((value) => value.trim()).filter(Boolean); }
/** @param {boolean} [open] @param {string} [search] */
function emptyImagePicker(open = false, search = '') { return { open, search, assets: [], hasMore: false, limit: 60, targetGroupId: null, targetGroupName: null }; }
/** @param {unknown} errorValue */
function reusableQuestionActionError(errorValue) { const clientError = errorValue instanceof AssetQuestionInputError; if (!clientError) console.error('Case reusable image question action failed.', errorValue); return fail(clientError ? 400 : 500, { error: errorValue instanceof Error ? errorValue.message : 'Unable to update the reusable image question.' }); }

export async function load({ locals, platform, params, url }) {
  const pickerOpen = url.searchParams.get('picker') === '1';
  const pickerSearch = url.searchParams.get('image_q')?.trim() ?? '';
  if (!canManageCaseAssets(locals.user) || !platform?.env?.DB) return { concepts: [], selectedCase: null, imagePicker: emptyImagePicker(pickerOpen, pickerSearch), previewMode: false };

  const db = createDb(platform.env.DB);
  const [concepts, manager, questions, stimulusGroupsData] = await Promise.all([
    listAdminConcepts(db), getAdminCaseData(db, params.caseId, { includeAvailable: false }), listCaseQuestions(db, params.caseId), getAdminStimulusData(db, params.caseId)
  ]);
  if (!manager) return { concepts, selectedCase: null, imagePicker: emptyImagePicker(pickerOpen, pickerSearch), previewMode: false };

  const stimulusGroups = stimulusGroupsData.map((group) => ({ ...group, options: group.options.map((option) => ({ ...option, imageUrl: option.assetIsActive ? getTeachingImageUrl(option.assetId) : null })) }));
  const targetRequested = url.searchParams.get('target_group')?.trim() ?? '';
  const targetGroup = stimulusGroups.find((group) => group.id === targetRequested && group.isActive) ?? null;
  if (targetRequested && !targetGroup) throw error(400, 'The requested alternative image set is missing, inactive, or does not belong to this Case.');

  const imageQuestionContexts = [
    ...manager.attached.map((asset) => ({ assetId: asset.assetId, stimulusOptionId: null })),
    ...stimulusGroups.flatMap((group) => group.options.map((option) => ({ assetId: option.assetId, stimulusOptionId: option.id })))
  ];
  const reusableImageQuestions = await listCaseImageQuestionSummaries(db, imageQuestionContexts);
  const pickerResults = pickerOpen ? await listCaseImagePicker(db, params.caseId, { search: pickerSearch }) : { assets: [], hasMore: false, limit: 60, search: pickerSearch };

  return {
    concepts, previewMode: false,
    selectedCase: { ...manager, questions, stimulusGroups, reusableImageQuestions, attached: manager.attached.map((asset) => ({ ...asset, imageUrl: asset.isActive ? getTeachingImageUrl(asset.assetId) : null })) },
    imagePicker: { open: pickerOpen, ...pickerResults, targetGroupId: targetGroup?.id ?? null, targetGroupName: targetGroup?.name ?? null }
  };
}

export const actions = {
  ...parentActions,
  createCaseTopic: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' }); if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id') || params.caseId; if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    const relationshipIntent = formText(formData, 'relationship_intent');
    try { await createCaseTopic(createDb(platform.env.DB), { caseId, name: formText(formData, 'name'), relationshipIntent }); }
    catch (errorValue) { return fail(errorValue instanceof AdminContentInputError ? 400 : 500, { error: errorValue instanceof AdminContentInputError ? errorValue.message : 'Unable to create and attach the Topic.', caseId }); }
    const status = relationshipIntent === 'primary' ? 'topic-created-primary' : 'topic-created-secondary'; redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=${encodeURIComponent(status)}#topics`);
  },
  attachMany: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' }); if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id') || params.caseId; if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    const ids = selectedAssetIds(formData); const targetGroupId = formText(formData, 'target_group_id');
    try { const db = createDb(platform.env.DB); if (targetGroupId) await bulkAddAssetsToStimulusGroup(db, targetGroupId, ids, { expectedCaseId: caseId }); else await attachAssetsToCase(db, caseId, ids); }
    catch (errorValue) { const clientError = errorValue instanceof AdminImageWorkflowInputError; if (!clientError) console.error('Unable to attach selected Case images.', errorValue); return fail(clientError ? 400 : 500, { error: clientError ? errorValue.message : 'Unable to attach the selected images.' }); }
    redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=images-attached#images`);
  },
  uploadAndAttach: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' }); if (!platform?.env?.DB || !platform.env.MEDIA) return fail(503, { error: 'Image storage is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id') || params.caseId; if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    const targetGroupId = formText(formData, 'target_group_id'); const imageValue = formData.get('image');
    if (!imageValue || typeof imageValue !== 'object' || typeof imageValue.size !== 'number' || typeof imageValue.type !== 'string' || typeof imageValue.arrayBuffer !== 'function') return fail(400, { error: 'Choose a JPEG or PNG image to upload.' });
    const db = createDb(platform.env.DB); let created = null;
    try {
      const caseData = await getAdminCaseData(db, caseId, { includeAvailable: false }); if (!caseData) throw new AdminImageWorkflowInputError('The selected Case is missing or inactive.');
      if (targetGroupId) await validateStimulusGroupTargetForNewAssets(db, targetGroupId, { expectedCaseId: caseId });
      created = await createAssetFromUpload(db, platform.env.MEDIA, imageValue, { originalFilename: formText(formData, 'image_name'), altText: formText(formData, 'alt_text'), sourceLabel: formText(formData, 'source_label'), sourceUrl: formText(formData, 'source_url'), licence: formText(formData, 'licence') });
      try { if (targetGroupId) await bulkAddAssetsToStimulusGroup(db, targetGroupId, [created.id], { expectedCaseId: caseId }); else await attachAssetsToCase(db, caseId, [created.id]); }
      catch (relationshipError) { const clientError = relationshipError instanceof AdminImageWorkflowInputError; if (!clientError) console.error('Uploaded teaching image could not be attached to the Case.', relationshipError); return fail(clientError ? 409 : 500, { partialSuccess: true, uploadedAssetId: created.id, error: clientError ? `The image was uploaded as reusable Asset ${created.id}, but it could not be attached to this Case: ${relationshipError.message}` : `The image was uploaded as reusable Asset ${created.id}, but the Case relationship could not be saved. Refresh the Case and attach that Asset from the library.` }); }
    } catch (errorValue) { const clientError = errorValue instanceof AdminImageWorkflowInputError || errorValue instanceof AssetLibraryInputError || errorValue instanceof MediaStorageLimitError; if (!clientError) console.error('Case image upload failed.', errorValue); return fail(clientError ? 400 : 500, { error: errorValue instanceof Error ? errorValue.message : 'Unable to save the teaching image.' }); }
    redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=image-uploaded#images`);
  },
  updateStimulusOptionCaption: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' }); if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id') || params.caseId; if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    try { await updateStimulusOptionCaption(createDb(platform.env.DB), caseId, formText(formData, 'option_id'), formText(formData, 'caption')); }
    catch (errorValue) { const clientError = errorValue instanceof AdminImageWorkflowInputError; if (!clientError) console.error('Unable to update alternative image caption.', errorValue); return fail(clientError ? 400 : 500, { error: clientError ? errorValue.message : 'Unable to update the alternative image caption.' }); }
    redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=option-caption-updated#images`);
  },
  createReusableImageQuestion: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' }); if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id') || params.caseId; if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    try { await createAssetQuestion(createDb(platform.env.DB), { assetId: formText(formData, 'asset_id'), promptMd: formText(formData, 'prompt_md'), answerMd: formText(formData, 'answer_md') }); } catch (errorValue) { return reusableQuestionActionError(errorValue); }
    redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=reusable-question-created#images`);
  },
  saveReusableImageAnswer: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' }); if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id') || params.caseId; if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    try { await updateAssetQuestionAnswer(createDb(platform.env.DB), { assetQuestionId: formText(formData, 'asset_question_id'), answerMd: formText(formData, 'answer_md') }); } catch (errorValue) { return reusableQuestionActionError(errorValue); }
    redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=reusable-question-saved#images`);
  },
  reuseAssetQuestion: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' }); if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id') || params.caseId; if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    const db = createDb(platform.env.DB);
    try { const optionId = formText(formData, 'option_id'); if (optionId) await optInAssetQuestion(db, { caseId, optionId, assetQuestionId: formText(formData, 'asset_question_id') }); else await optInFixedAssetQuestion(db, { caseId, assetId: formText(formData, 'asset_id'), assetQuestionId: formText(formData, 'asset_question_id') }); } catch (errorValue) { return reusableQuestionActionError(errorValue); }
    redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=reusable-question-added#images`);
  },
  removeAssetQuestionReuse: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' }); if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id') || params.caseId; if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    try { await removeAssetQuestionOptIn(createDb(platform.env.DB), { optionId: formText(formData, 'option_id'), assetQuestionId: formText(formData, 'asset_question_id') }); } catch (errorValue) { return reusableQuestionActionError(errorValue); }
    redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=reusable-question-removed#images`);
  },
  startAlternativeSet: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' }); if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id') || params.caseId; const assetId = formText(formData, 'asset_id'); const name = formText(formData, 'set_name'); if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.', caseId });
    const db = createDb(platform.env.DB); let createdGroupId = null;
    try { const fixed = await db.select({ assetId: caseAssets.assetId }).from(caseAssets).where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId))).limit(1); if (!fixed[0]) throw new StimulusGroupInputError('Choose a fixed image from this Case to start an alternative set.'); createdGroupId = await createStimulusGroup(db, { caseId, name, specificQuestionMode: 'none' }); await convertCaseAssetToStimulusOption(db, createdGroupId, assetId); }
    catch (errorValue) { if (createdGroupId) { try { await db.delete(stimulusGroups).where(eq(stimulusGroups.id, createdGroupId)); } catch {} } return fail(errorValue instanceof StimulusGroupInputError ? 400 : 500, { error: errorValue instanceof StimulusGroupInputError ? errorValue.message : 'Unable to start an alternative image set.', caseId }); }
    redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=alternative-set-created#images`);
  }
};