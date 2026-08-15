import { fail, redirect } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import { AssetLibraryInputError, createAssetFromUpload } from '$lib/server/db/asset-library.js';
import { MediaStorageLimitError } from '$lib/server/storage/media.js';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export async function load() {
  return {};
}

export const actions = {
  upload: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB || !platform.env.MEDIA) return fail(503, { error: 'Image storage is not configured.' });

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
      const created = await createAssetFromUpload(createDb(platform.env.DB), platform.env.MEDIA, imageValue, {
        originalFilename: formText(formData, 'image_name'),
        altText: formText(formData, 'alt_text'),
        sourceLabel: formText(formData, 'source_label'),
        sourceUrl: formText(formData, 'source_url'),
        licence: formText(formData, 'licence')
      });
      redirect(303, `/admin/images/${encodeURIComponent(created.id)}?status=uploaded`);
    } catch (error) {
      const clientError = error instanceof AssetLibraryInputError || error instanceof MediaStorageLimitError;
      if (!clientError) console.error('Teaching image upload failed.', error);
      return fail(clientError ? 400 : 500, {
        error: error instanceof Error ? error.message : 'Unable to save the teaching image.'
      });
    }
  }
};
