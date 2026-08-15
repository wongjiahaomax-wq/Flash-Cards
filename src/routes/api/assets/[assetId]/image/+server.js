import { eq } from 'drizzle-orm';

import { createDb } from '$lib/server/db/index.js';
import { assets } from '$lib/server/db/schema.js';
import { serveTeachingImage } from '$lib/server/storage/serve.js';

/**
 * Authenticated, application-controlled image delivery. The R2 bucket remains
 * private and the source_url Asset field is never used as a runtime image URL.
 */
export async function GET({ params, locals, platform, request }) {
  if (!locals.user) {
    return new Response('Authentication required.', {
      status: 401,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  const env = platform?.env;
  if (!env?.DB || !env?.MEDIA) {
    return new Response('Image storage is not configured.', { status: 503 });
  }

  const assetId = String(params.assetId ?? '').trim();
  if (!assetId) return new Response('Not found.', { status: 404 });

  const [asset] = await createDb(env.DB)
    .select()
    .from(assets)
    .where(eq(assets.id, assetId))
    .limit(1);

  if (!asset?.isActive) return new Response('Not found.', { status: 404 });

  return serveTeachingImage({ user: locals.user, asset, bucket: env.MEDIA, request });
}
