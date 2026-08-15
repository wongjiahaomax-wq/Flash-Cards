import { fail } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { ContentPackageError, importPackageDigest } from '$lib/server/import/reviewed-content-package.js';
import {
  cancelImportJob,
  createImportJob,
  listImportJobs,
  previewResumableImport,
  processNextImportChunk,
  serializeImportJob
} from '$lib/server/import/resumable-content-package.js';

const PREVIEW_COOKIE = 'flashcards_import_preview_sha256';
const PREVIEW_MAX_AGE_SECONDS = 15 * 60;

/** @param {FormData} formData */
function packageFile(formData) {
  const value = formData.get('package');
  if (!value || typeof value !== 'object' || typeof value.arrayBuffer !== 'function' || typeof value.size !== 'number') return null;
  return value;
}

/** @param {FormData} formData */
function jobId(formData) {
  const value = formData.get('jobId');
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** @param {unknown} error */
function packageError(error) {
  if (error instanceof ContentPackageError) return { error: error.message, issues: error.issues };
  return { error: error instanceof Error ? error.message : 'Unable to process the import package.' };
}

/** @param {import('@sveltejs/kit').Cookies} cookies */
function clearPreview(cookies) {
  cookies.delete(PREVIEW_COOKIE, { path: '/admin/import' });
}

/** @param {import('@sveltejs/kit').Cookies} cookies @param {URL} url @param {string} digest */
function rememberPreview(cookies, url, digest) {
  cookies.set(PREVIEW_COOKIE, digest, {
    path: '/admin/import',
    httpOnly: true,
    sameSite: 'strict',
    secure: url.protocol === 'https:',
    maxAge: PREVIEW_MAX_AGE_SECONDS
  });
}

export async function load({ locals, platform }) {
  if (!canManageCaseAssets(locals.user) || !platform?.env?.DB) return { jobs: [] };
  const jobs = await listImportJobs(platform.env.DB, 10);
  return { jobs: jobs.map(serializeImportJob) };
}

export const actions = {
  preview: async ({ request, locals, platform, cookies, url }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });

    clearPreview(cookies);
    const file = packageFile(await request.formData());
    if (!file) return fail(400, { error: 'Choose a Flash-Cards Import Package ZIP.' });

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const preview = await previewResumableImport(bytes);
      const digest = await importPackageDigest(bytes);
      rememberPreview(cookies, url, digest);
      return {
        preview: preview.preview,
        warnings: preview.warnings,
        packageId: preview.packageId,
        previewNotice: 'Package structure is valid. Database conflict validation will run in bounded resumable steps after confirmation, before any content writes.'
      };
    } catch (error) {
      return fail(400, packageError(error));
    }
  },

  start: async ({ request, locals, platform, cookies }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB || !platform.env.MEDIA) return fail(503, { error: 'The study database or image storage is not configured.' });

    const formData = await request.formData();
    if (formData.get('confirm') !== 'on') return fail(400, { error: 'Explicit administrator confirmation is required before starting an import.' });
    const file = packageFile(formData);
    if (!file) return fail(400, { error: 'Choose the same import package ZIP to start the import.' });

    const previewDigest = cookies.get(PREVIEW_COOKIE);
    if (!previewDigest) return fail(400, { error: 'Run Validate and preview successfully before starting an import.' });

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const submittedDigest = await importPackageDigest(bytes);
      if (submittedDigest !== previewDigest) {
        clearPreview(cookies);
        return fail(400, { error: 'The selected package does not match the most recent successful preview. Preview this exact ZIP before importing.' });
      }

      clearPreview(cookies);
      const createdBy = String(locals.user?.id ?? '').trim();
      if (!createdBy) return fail(403, { error: 'The administrator identity is unavailable.' });
      const job = await createImportJob(platform.env.DB, platform.env.MEDIA, bytes, createdBy);
      if (!job) throw new ContentPackageError('The import job could not be created.');
      return { job, autoStartJobId: job.id };
    } catch (error) {
      clearPreview(cookies);
      console.error('Unable to start resumable content import.', error);
      return fail(400, packageError(error));
    }
  },

  process: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB || !platform.env.MEDIA) return fail(503, { error: 'The study database or image storage is not configured.' });
    const id = jobId(await request.formData());
    if (!id) return fail(400, { error: 'Import job ID is required.' });
    try {
      return await processNextImportChunk(platform.env.DB, platform.env.MEDIA, id);
    } catch (error) {
      console.error('Resumable import chunk failed.', { id, error });
      return fail(409, packageError(error));
    }
  },

  cancel: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB || !platform.env.MEDIA) return fail(503, { error: 'The study database or image storage is not configured.' });
    const id = jobId(await request.formData());
    if (!id) return fail(400, { error: 'Import job ID is required.' });
    try {
      return { job: await cancelImportJob(platform.env.DB, platform.env.MEDIA, id) };
    } catch (error) {
      return fail(409, packageError(error));
    }
  }
};
