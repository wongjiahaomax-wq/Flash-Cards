import { error, fail, redirect } from '@sveltejs/kit';

import { AdminContentInputError, createCaseTopic, listCaseEditorTaxonomyOptions, updateCase } from '$lib/server/db/admin-content.js';
import { createAssetFromUpload, AssetLibraryInputError } from '$lib/server/db/asset-library.js';
import { AssetQuestionInputError, createAssetQuestion, optInAssetQuestion, optInFixedAssetQuestion, removeAssetQuestionOptIn, updateAssetQuestionAnswer } from '$lib/server/db/asset-questions.js';
import { canManageCaseAssets, getAdminCaseData, updateCaseAssetCaption } from '$lib/server/db/case-assets.js';
import { listCaseImageQuestionSummaries } from '$lib/server/db/case-image-question-summaries.js';
import { CaseQuestionInputError, listCaseQuestions, saveCaseQuestion } from '$lib/server/db/case-questions.js';
import { listProductionCaseTags } from '$lib/server/db/case-tag-read.ts';
import { AdminImageWorkflowInputError, attachAssetsToCase, bulkAddAssetsToStimulusGroup, listCaseImagePicker, updateStimulusOptionCaption, validateStimulusGroupTargetForNewAssets } from '$lib/server/db/admin-image-workflow.js';
import { createDb } from '$lib/server/db/index.js';
import { listActiveTagOptions } from '$lib/server/db/library-options.js';
import { getAdminStimulusData, saveStimulusGroupQuestion, saveStimulusOptionQuestion, startStimulusGroupFromCaseAsset, StimulusGroupInputError, updateStimulusGroup } from '$lib/server/db/stimulus-groups.js';
import { getTeachingImageUrl, MediaStorageLimitError } from '$lib/server/storage/media.js';
import { assignPrimaryTopicToSystem, TaxonomyInputError } from '$lib/server/db/taxonomy-admin-write.ts';
import { normalizeCaseLibraryReturnQuery } from '$lib/admin-case-library-state.ts';
import { actions as parentActions } from '../../+page.server.js';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) { const value = formData.get(name); return typeof value === 'string' ? value.trim() : ''; }
/** @param {FormData} formData */
function selectedAssetIds(formData) { return formData.getAll('asset_id').filter((value) => typeof value === 'string').map((value) => value.trim()).filter(Boolean); }
/** @param {Request} request @param {FormData} formData */
function editorReturnQuery(request, formData) {
  const submitted = formText(formData, 'return_query');
  if (submitted) return normalizeCaseLibraryReturnQuery(submitted);
  const referer = request.headers.get('referer');
  if (!referer) return '';
  try { return normalizeCaseLibraryReturnQuery(new URL(referer).searchParams.get('return_query')); } catch { return ''; }
}
/** @param {string} caseId @param {string} status @param {Request} request @param {FormData} formData @param {string} [hash] */
function editorRedirect(caseId, status, request, formData, hash = '') {
  const returnQuery = editorReturnQuery(request, formData);
  return `/admin/cases/${encodeURIComponent(caseId)}?status=${encodeURIComponent(status)}${returnQuery ? `&return_query=${encodeURIComponent(returnQuery)}` : ''}${hash}`;
}
/** @param {boolean} [open] @param {string} [search] */
function emptyImagePicker(open = false, search = '') { return { open, search, assets: [], hasMore: false, limit: 60, targetGroupId: null, targetGroupName: null }; }
/** @param {unknown} errorValue */
function reusableQuestionActionError(errorValue) { const clientError = errorValue instanceof AssetQuestionInputError; if (!clientError) console.error('Case reusable image question action failed.', errorValue); return fail(clientError ? 400 : 500, { error: errorValue instanceof Error ? errorValue.message : 'Unable to update the reusable image question.' }); }
/** @param {unknown} input */
function saveAllDrafts(input) { return Array.isArray(input) && input.length > 0 && input.length <= 60 ? input : null; }
/** @param {unknown} input */
function snapshotFields(input) {
  if (!Array.isArray(input)) return {};
  return Object.fromEntries(input.filter((field) => field && typeof field.name === 'string').map((field) => [field.name, field.checked === false ? '' : String(field.value ?? '')]));
}

export async function load({ locals, platform, params, url }) {
  const pickerOpen = url.searchParams.get('picker') === '1';
  const pickerSearch = url.searchParams.get('image_q')?.trim() ?? '';
  const pickerSelectedAssetIds = url.searchParams.getAll('picker_selected').map((value) => value.trim()).filter(Boolean);
  const caseLibraryReturnQuery = normalizeCaseLibraryReturnQuery(url.searchParams.get('return_query'));
  if (!canManageCaseAssets(locals.user) || !platform?.env?.DB) return { concepts: [], systems: [], status: null, removedQuestionPromptId: null, selectedCase: null, imagePicker: emptyImagePicker(pickerOpen, pickerSearch), previewMode: false, caseLibraryReturnQuery };

  const db = createDb(platform.env.DB);
  const [taxonomyOptions, tagOptions, manager, questions, stimulusGroupsData] = await Promise.all([
    listCaseEditorTaxonomyOptions(db), listActiveTagOptions(db), getAdminCaseData(db, params.caseId, { includeAvailable: false }), listCaseQuestions(db, params.caseId), getAdminStimulusData(db, params.caseId)
  ]);
  const { concepts, systems } = taxonomyOptions;
  if (!manager) return { concepts, systems, status: null, removedQuestionPromptId: null, selectedCase: null, imagePicker: emptyImagePicker(pickerOpen, pickerSearch), previewMode: false, caseLibraryReturnQuery };

  const stimulusGroups = stimulusGroupsData.map((group) => ({ ...group, options: group.options.map((option) => ({ ...option, imageUrl: option.assetIsActive ? getTeachingImageUrl(option.assetId) : null })) }));
  const targetRequested = url.searchParams.get('target_group')?.trim() ?? '';
  const targetGroup = stimulusGroups.find((group) => group.id === targetRequested && group.isActive) ?? null;
  if (targetRequested && !targetGroup) throw error(400, 'The requested alternative image set is missing, inactive, or does not belong to this Case.');

  const imageQuestionContexts = [
    ...manager.attached.map((asset) => ({ assetId: asset.assetId, stimulusOptionId: null })),
    ...stimulusGroups.flatMap((group) => group.options.map((option) => ({ assetId: option.assetId, stimulusOptionId: option.id })))
  ];
  const [caseTags, reusableImageQuestions, pickerResults] = await Promise.all([
    listProductionCaseTags(db, params.caseId),
    listCaseImageQuestionSummaries(db, imageQuestionContexts),
    pickerOpen ? listCaseImagePicker(db, params.caseId, { search: pickerSearch }) : Promise.resolve({ assets: [], hasMore: false, limit: 60, search: pickerSearch })
  ]);

  return {
    concepts, systems, status: url.searchParams.get('status'), removedQuestionPromptId: url.searchParams.get('removed_question'), previewMode: false, caseLibraryReturnQuery,
    selectedCase: { ...manager, questions, stimulusGroups, reusableImageQuestions, caseTags, tagOptions, attached: manager.attached.map((asset) => ({ ...asset, imageUrl: asset.isActive ? getTeachingImageUrl(asset.assetId) : null })) },
    imagePicker: { open: pickerOpen, ...pickerResults, selectedAssetIds: pickerSelectedAssetIds, targetGroupId: targetGroup?.id ?? null, targetGroupName: targetGroup?.name ?? null }
  };
}

export const actions = {
  ...parentActions,
  saveAll: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    let body;
    try { body = await request.json(); } catch { return fail(400, { error: 'Save All requires valid draft data.' }); }
    const drafts = saveAllDrafts(body?.drafts);
    if (!drafts) return fail(400, { error: 'Save All requires one to 60 valid drafts.' });
    const db = createDb(platform.env.DB);
    try {
      for (const draft of drafts) {
        if (draft?.kind === 'case-details') {
          const fields = draft.fields ?? {};
          await updateCase(db, { caseId: params.caseId, title: String(fields.title ?? ''), vignetteMd: String(fields.vignetteMd ?? ''), questionSelectionMode: fields.questionSelectionMode, questionCount: fields.questionCount });
        } else if (draft?.kind === 'question') {
          const fields = draft.fields ?? {};
          await saveCaseQuestion(db, { caseId: params.caseId, caseQuestionId: String(fields.caseQuestionId ?? '') || null, originalPromptId: String(fields.originalPromptId ?? '') || null, promptMd: String(fields.promptMd ?? ''), answerMd: String(fields.answerMd ?? ''), reusableForTopic: fields.reusableForTopic });
        } else if (draft?.kind === 'form') {
          const fields = snapshotFields(draft.fields);
          if (fields.case_id !== params.caseId) throw new AdminContentInputError('The selected Case does not match this editor.');
          if (draft.action === '?/caption') await updateCaseAssetCaption(db, params.caseId, fields.asset_id, fields.caption);
          else if (draft.action === '?/updateStimulusOptionCaption') await updateStimulusOptionCaption(db, params.caseId, fields.option_id, fields.caption);
          else if (draft.action === '?/saveReusableImageAnswer') await updateAssetQuestionAnswer(db, { assetQuestionId: fields.asset_question_id, answerMd: fields.answer_md });
          else if (draft.action === '?/updateStimulusGroup') await updateStimulusGroup(db, { groupId: fields.group_id, name: fields.name, specificQuestionMode: fields.specific_question_mode, minimumSpecificQuestions: fields.minimum_specific_questions, isActive: fields.is_active || null });
          else if (draft.action === '?/saveStimulusOptionQuestion') await saveStimulusOptionQuestion(db, fields.option_id, { relationshipId: fields.stimulus_question_id, originalPromptId: fields.original_prompt_id, promptMd: fields.prompt_md, answerMd: fields.answer_md });
          else if (draft.action === '?/saveStimulusGroupQuestion') await saveStimulusGroupQuestion(db, fields.group_id, { relationshipId: fields.stimulus_question_id, originalPromptId: fields.original_prompt_id, promptMd: fields.prompt_md, answerMd: fields.answer_md });
          else throw new AdminContentInputError('This editor form cannot be included in Save All yet. Save it individually.');
        } else throw new AdminContentInputError('Save All received an unknown draft.');
      }
    } catch (errorValue) {
      const clientError = errorValue instanceof AdminContentInputError || errorValue instanceof CaseQuestionInputError || errorValue instanceof AdminImageWorkflowInputError || errorValue instanceof AssetQuestionInputError;
      if (!clientError) console.error('Case Save All failed.', errorValue);
      return fail(clientError ? 400 : 500, { error: errorValue instanceof Error ? errorValue.message : 'Unable to save all Case-editor drafts.' });
    }
    return { ok: true };
  },
  assignPrimaryTopicToSystem: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id') || params.caseId;
    if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    try {
      await assignPrimaryTopicToSystem(createDb(platform.env.DB), {
        caseId,
        topicId: formText(formData, 'topic_id'),
        systemId: formText(formData, 'system_id')
      });
    } catch (errorValue) {
      return fail(errorValue instanceof TaxonomyInputError ? 400 : 500, { error: errorValue instanceof TaxonomyInputError ? errorValue.message : 'Unable to place the Primary Topic under that System.', caseId });
    }
    redirect(303, editorRedirect(caseId, 'primary-topic-system-assigned', request, formData, '#topics'));
  },
  createCaseTopic: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' }); if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id') || params.caseId; if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    const relationshipIntent = formText(formData, 'relationship_intent');
    try { await createCaseTopic(createDb(platform.env.DB), { caseId, name: formText(formData, 'name'), relationshipIntent }); }
    catch (errorValue) { return fail(errorValue instanceof AdminContentInputError ? 400 : 500, { error: errorValue instanceof AdminContentInputError ? errorValue.message : 'Unable to create and attach the Topic.', caseId }); }
    const status = relationshipIntent === 'primary' ? 'topic-created-primary' : 'topic-created-secondary'; redirect(303, editorRedirect(caseId, status, request, formData, '#topics'));
  },
  attachMany: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' }); if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id') || params.caseId; if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    const ids = selectedAssetIds(formData); const targetGroupId = formText(formData, 'target_group_id');
    try { const db = createDb(platform.env.DB); if (targetGroupId) await bulkAddAssetsToStimulusGroup(db, targetGroupId, ids, { expectedCaseId: caseId }); else await attachAssetsToCase(db, caseId, ids); }
    catch (errorValue) { const clientError = errorValue instanceof AdminImageWorkflowInputError; if (!clientError) console.error('Unable to attach selected Case images.', errorValue); return fail(clientError ? 400 : 500, { error: clientError ? errorValue.message : 'Unable to attach the selected images.' }); }
    redirect(303, editorRedirect(caseId, 'images-attached', request, formData, '#images'));
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
    redirect(303, editorRedirect(caseId, 'image-uploaded', request, formData, '#images'));
  },
  updateStimulusOptionCaption: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' }); if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id') || params.caseId; if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    try { await updateStimulusOptionCaption(createDb(platform.env.DB), caseId, formText(formData, 'option_id'), formText(formData, 'caption')); }
    catch (errorValue) { const clientError = errorValue instanceof AdminImageWorkflowInputError; if (!clientError) console.error('Unable to update alternative image caption.', errorValue); return fail(clientError ? 400 : 500, { error: clientError ? errorValue.message : 'Unable to update the alternative image caption.' }); }
    redirect(303, editorRedirect(caseId, 'option-caption-updated', request, formData, '#images'));
  },
  createReusableImageQuestion: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' }); if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id') || params.caseId; if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    try { await createAssetQuestion(createDb(platform.env.DB), { assetId: formText(formData, 'asset_id'), promptMd: formText(formData, 'prompt_md'), answerMd: formText(formData, 'answer_md') }); } catch (errorValue) { return reusableQuestionActionError(errorValue); }
    redirect(303, editorRedirect(caseId, 'reusable-question-created', request, formData, '#images'));
  },
  saveReusableImageAnswer: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' }); if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id') || params.caseId; if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    try { await updateAssetQuestionAnswer(createDb(platform.env.DB), { assetQuestionId: formText(formData, 'asset_question_id'), answerMd: formText(formData, 'answer_md') }); } catch (errorValue) { return reusableQuestionActionError(errorValue); }
    redirect(303, editorRedirect(caseId, 'reusable-question-saved', request, formData, '#images'));
  },
  reuseAssetQuestion: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' }); if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id') || params.caseId; if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    const db = createDb(platform.env.DB);
    try { const optionId = formText(formData, 'option_id'); if (optionId) await optInAssetQuestion(db, { caseId, optionId, assetQuestionId: formText(formData, 'asset_question_id') }); else await optInFixedAssetQuestion(db, { caseId, assetId: formText(formData, 'asset_id'), assetQuestionId: formText(formData, 'asset_question_id') }); } catch (errorValue) { return reusableQuestionActionError(errorValue); }
    redirect(303, editorRedirect(caseId, 'reusable-question-added', request, formData, '#images'));
  },
  removeAssetQuestionReuse: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' }); if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id') || params.caseId; if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.' });
    try { await removeAssetQuestionOptIn(createDb(platform.env.DB), { caseId, optionId: formText(formData, 'option_id'), assetQuestionId: formText(formData, 'asset_question_id') }); } catch (errorValue) { return reusableQuestionActionError(errorValue); }
    redirect(303, editorRedirect(caseId, 'reusable-question-removed', request, formData, '#images'));
  },
  startAlternativeSet: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' }); if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData(); const caseId = formText(formData, 'case_id') || params.caseId; const assetId = formText(formData, 'asset_id'); const name = formText(formData, 'set_name'); if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this editor.', caseId });
    try { await startStimulusGroupFromCaseAsset(createDb(platform.env.DB), { caseId, assetId, name }); }
    catch (errorValue) { return fail(errorValue instanceof StimulusGroupInputError ? 400 : 500, { error: errorValue instanceof StimulusGroupInputError ? errorValue.message : 'Unable to start an alternative image set.', caseId }); }
    redirect(303, editorRedirect(caseId, 'alternative-set-created', request, formData, '#images'));
  }
};
