import { fail } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import {
  ContentPackageError,
  importContentPackage,
  importPackageDigest,
  parseImportPackage,
  validateImportPackage
} from '$lib/server/import/reviewed-content-package.js';

const PREVIEW_COOKIE = 'flashcards_import_preview_sha256';
const PREVIEW_MAX_AGE_SECONDS = 15 * 60;

/** @param {FormData} formData */
function packageFile(formData) {
  const value = formData.get('package');
  if (!value || typeof value !== 'object' || typeof value.arrayBuffer !== 'function' || typeof value.size !== 'number') return null;
  return value;
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

export function load() {
  return {};
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
      const parsed = await parseImportPackage(bytes);
      const validation = await validateImportPackage(createDb(platform.env.DB), parsed);
      if (!validation.valid) {
        return fail(400, { error: 'The package did not pass validation.', issues: validation.errors, preview: validation.preview });
      }

      const digest = await importPackageDigest(bytes);
      rememberPreview(cookies, url, digest);
      return { preview: validation.preview, warnings: validation.warnings, packageId: parsed.manifest.packageId };
    } catch (error) {
      return fail(400, packageError(error));
    }
  },

  import: async ({ request, locals, platform, cookies }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB || !platform.env.MEDIA) return fail(503, { error: 'The study database or image storage is not configured.' });

    const formData = await request.formData();
    if (formData.get('confirm') !== 'on') return fail(400, { error: 'Explicit administrator confirmation is required before importing.' });
    const file = packageFile(formData);
    if (!file) return fail(400, { error: 'Choose the same import package ZIP to confirm the import.' });

    const previewDigest = cookies.get(PREVIEW_COOKIE);
    if (!previewDigest) {
      return fail(400, { error: 'Run Validate and preview successfully before confirming an import.' });
    }

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const submittedDigest = await importPackageDigest(bytes);
      if (submittedDigest !== previewDigest) {
        clearPreview(cookies);
        return fail(400, { error: 'The selected package does not match the most recent successful dry-run preview. Preview this exact ZIP before importing.' });
      }

      // Consume the preview before validation/writes so every import attempt
      // requires a fresh, matching administrator preview.
      clearPreview(cookies);
      const parsed = await parseImportPackage(bytes);
      const validation = await validateImportPackage(createDb(platform.env.DB), parsed);
      if (!validation.valid) {
        return fail(400, { error: 'The package did not pass validation; no writes were performed. Run a fresh preview before retrying.', issues: validation.errors, preview: validation.preview });
      }

      const result = await importContentPackage(createDb(platform.env.DB), platform.env.MEDIA, validation);
      return { result };
    } catch (error) {
      clearPreview(cookies);
      console.error('Content package import failed.', error);
      return fail(400, packageError(error));
    }
  }
};
