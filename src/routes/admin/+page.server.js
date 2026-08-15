import { fail, redirect } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';

import { createDb } from '$lib/server/db/index.js';
import { assets } from '$lib/server/db/schema.js';
import {
  assertSupportedImageType,
  deleteTeachingImage,
  getTeachingImageUrl,
  MediaStorageLimitError,
  putTeachingImage
} from '$lib/server/storage/media.js';

class AssetInputError extends Error {}

/** @param {App.Locals['user']} user */
function isAdmin(user) {
  return String(user?.role ?? '')
    .split(',')
    .map((role) => role.trim())
    .includes('admin');
}

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

export async function load({ locals, platform }) {
  if (!isAdmin(locals.user)) return { assets: [] };

  const db = platform?.env?.DB ? createDb(platform.env.DB) : null;
  const rows = db
    ? await db.select().from(assets).orderBy(desc(assets.createdAt)).limit(100)
    : [];

  return {
    assets: rows.map((asset) => ({
      ...asset,
      imageUrl: getTeachingImageUrl(asset.id)
    }))
  };
}

export const actions = {
  upload: async ({ request, locals, platform }) => {
    if (!isAdmin(locals.user)) return fail(403, { error: 'Administrator access is required.' });

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

    redirect(303, '/admin?uploaded=1');
  }
};
