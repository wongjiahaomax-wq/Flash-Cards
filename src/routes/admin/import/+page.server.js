import { fail } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import {
  ContentPackageError,
  importContentPackage,
  parseImportPackage,
  validateImportPackage
} from '$lib/server/import/content-package.js';

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

export function load() {
  return {};
}

export const actions = {
  preview: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const file = packageFile(await request.formData());
    if (!file) return fail(400, { error: 'Choose a Flash-Cards Import Package ZIP.' });
    try {
      const parsed = await parseImportPackage(await file.arrayBuffer());
      const validation = await validateImportPackage(createDb(platform.env.DB), parsed);
      return validation.valid
        ? { preview: validation.preview, warnings: validation.warnings, packageId: parsed.manifest.packageId }
        : fail(400, { error: 'The package did not pass validation.', issues: validation.errors, preview: validation.preview });
    } catch (error) {
      return fail(400, packageError(error));
    }
  },

  import: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB || !platform.env.MEDIA) return fail(503, { error: 'The study database or image storage is not configured.' });
    const formData = await request.formData();
    if (formData.get('confirm') !== 'on') return fail(400, { error: 'Explicit administrator confirmation is required before importing.' });
    const file = packageFile(formData);
    if (!file) return fail(400, { error: 'Choose the same import package ZIP to confirm the import.' });
    try {
      const parsed = await parseImportPackage(await file.arrayBuffer());
      const validation = await validateImportPackage(createDb(platform.env.DB), parsed);
      if (!validation.valid) return fail(400, { error: 'The package did not pass validation; no writes were performed.', issues: validation.errors, preview: validation.preview });
      const result = await importContentPackage(createDb(platform.env.DB), platform.env.MEDIA, validation);
      return { result };
    } catch (error) {
      console.error('Content package import failed.', error);
      return fail(400, packageError(error));
    }
  }
};
