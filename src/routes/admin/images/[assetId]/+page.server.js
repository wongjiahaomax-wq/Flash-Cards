import { fail, redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import {
  AssetLibraryInputError,
  getAssetLibraryDetail,
  listAssetLibraryCollections,
  updateAssetMetadata
} from '$lib/server/db/asset-library.js';
import {
  AssetQuestionInputError,
  createAssetQuestion,
  listAssetQuestions,
  optInAssetQuestion,
  optInFixedAssetQuestion,
  removeAssetQuestionOptIn,
  setAssetQuestionActive,
  updateAssetQuestionAnswer
} from '$lib/server/db/asset-questions.js';
import { assets, stimulusOptionAssetQuestions } from '$lib/server/db/schema.js';

/** @typedef {import('$lib/server/db/index.js').LearningDb} LearningDb */

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {string} assetId @param {string} status */
function detailRedirect(assetId, status) {
  return `/admin/images/${encodeURIComponent(assetId)}?status=${encodeURIComponent(status)}#reusable-questions`;
}

/** @param {LearningDb} db @param {string} assetId */
async function isProductionAsset(db, assetId) {
  return Boolean((await db.select({ id: assets.id }).from(assets).where(and(eq(assets.id, assetId), isNull(assets.previewSessionId))).limit(1))[0]);
}

/** @param {unknown} error */
function actionError(error) {
  const clientError = error instanceof AssetLibraryInputError || error instanceof AssetQuestionInputError;
  if (!clientError) console.error('Reusable image question action failed.', error);
  return fail(clientError ? 400 : 500, { error: error instanceof Error ? error.message : 'Unable to update the reusable image question.' });
}

export async function load({ locals, params, platform, url }) {
  if (!canManageCaseAssets(locals.user) || !platform?.env?.DB) return { detail: null, collections: [], reusableQuestions: [], status: null };
  const db = createDb(platform.env.DB);
  if (!(await isProductionAsset(db, params.assetId))) return { detail: null, collections: [], reusableQuestions: [], status: null };
  const [detail, reusableQuestions] = await Promise.all([
    getAssetLibraryDetail(db, params.assetId),
    listAssetQuestions(db, params.assetId)
  ]);
  const optionIds = detail?.usages.map((usage) => usage.stimulusOptionId).filter(Boolean) ?? [];
  const optedRows = optionIds.length
    ? await db.select({ optionId: stimulusOptionAssetQuestions.stimulusGroupOptionId, assetQuestionId: stimulusOptionAssetQuestions.assetQuestionId }).from(stimulusOptionAssetQuestions)
    : [];
  const opted = new Set(optedRows.filter((row) => optionIds.includes(row.optionId)).map((row) => `${row.optionId}:${row.assetQuestionId}`));
  return {
    detail,
    collections: await listAssetLibraryCollections(db),
    reusableQuestions: reusableQuestions.map((question) => ({ ...question, optedKeys: [...opted].filter((key) => key.endsWith(`:${question.id}`)) })),
    optedKeys: [...opted],
    status: url.searchParams.get('status')
  };
}

export const actions = {
  saveMetadata: async ({ request, locals, params, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const db = createDb(platform.env.DB);
    if (!(await isProductionAsset(db, params.assetId))) return fail(404, { error: 'Production Asset not found.' });
    const formData = await request.formData();
    try {
      await updateAssetMetadata(db, params.assetId, {
        originalFilename: formText(formData, 'original_filename'), altText: formText(formData, 'alt_text'),
        sourceLabel: formText(formData, 'source_label'), sourceUrl: formText(formData, 'source_url'), licence: formText(formData, 'licence'),
        imageCollectionId: formText(formData, 'image_collection_id'), isActive: formData.has('is_active')
      });
    } catch (error) { return actionError(error); }
    redirect(303, `/admin/images/${encodeURIComponent(params.assetId)}?status=saved`);
  },

  createReusableQuestion: async ({ request, locals, params, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try {
      await createAssetQuestion(createDb(platform.env.DB), { assetId: params.assetId, promptMd: formText(formData, 'prompt_md'), answerMd: formText(formData, 'answer_md') });
    } catch (error) { return actionError(error); }
    redirect(303, detailRedirect(params.assetId, 'reusable-created'));
  },

  saveReusableAnswer: async ({ request, locals, params, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try { await updateAssetQuestionAnswer(createDb(platform.env.DB), { assetQuestionId: formText(formData, 'asset_question_id'), answerMd: formText(formData, 'answer_md') }); }
    catch (error) { return actionError(error); }
    redirect(303, detailRedirect(params.assetId, 'reusable-saved'));
  },

  setReusableActive: async ({ request, locals, params, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try { await setAssetQuestionActive(createDb(platform.env.DB), { assetQuestionId: formText(formData, 'asset_question_id'), isActive: formText(formData, 'active') === 'true' }); }
    catch (error) { return actionError(error); }
    redirect(303, detailRedirect(params.assetId, 'reusable-status'));
  },

  optInReusable: async ({ request, locals, params, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const db = createDb(platform.env.DB);
    try {
      const optionId = formText(formData, 'option_id');
      if (optionId) await optInAssetQuestion(db, { caseId: formText(formData, 'case_id'), optionId, assetQuestionId: formText(formData, 'asset_question_id') });
      else await optInFixedAssetQuestion(db, { caseId: formText(formData, 'case_id'), assetId: params.assetId, assetQuestionId: formText(formData, 'asset_question_id') });
    } catch (error) { return actionError(error); }
    redirect(303, detailRedirect(params.assetId, 'reused'));
  },

  removeReusable: async ({ request, locals, params, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try { await removeAssetQuestionOptIn(createDb(platform.env.DB), { optionId: formText(formData, 'option_id'), assetQuestionId: formText(formData, 'asset_question_id') }); }
    catch (error) { return actionError(error); }
    redirect(303, detailRedirect(params.assetId, 'removed-from-case'));
  }
};
