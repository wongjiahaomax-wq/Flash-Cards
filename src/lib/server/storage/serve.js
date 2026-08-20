/**
 * @typedef {{ isActive: boolean, mimeType: string, storageKey: string }} TeachingAsset
 */

/**
 * @param {{ user: unknown, bucket: R2Bucket, request: Request, storageKey: string, mimeType?: string | null, cacheControl?: string }} options
 */
async function servePrivateImmutableObject({ user, bucket, request, storageKey, mimeType, cacheControl = 'private, max-age=31536000, immutable' }) {
  if (!user) {
    return new Response('Authentication required.', {
      status: 401,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  const normalizedKey = String(storageKey ?? '').trim();
  if (!normalizedKey) return new Response('Not found.', { status: 404, headers: { 'Cache-Control': 'no-store' } });

  const object = await bucket.get(normalizedKey);
  if (!object) return new Response('Not found.', { status: 404, headers: { 'Cache-Control': 'no-store' } });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (mimeType) headers.set('Content-Type', mimeType);
  headers.set('Cache-Control', cacheControl);
  if (object.httpEtag) headers.set('ETag', object.httpEtag);

  if (object.httpEtag && request.headers.get('if-none-match') === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(object.body, { headers });
}

/**
 * Deliver one active Asset through the private R2 binding. Keeping this logic
 * separate makes the route contract easy to exercise without a live D1/R2
 * runtime and ensures missing/inactive records never trigger an R2 read.
 *
 * @param {{ user: unknown, asset: TeachingAsset | null | undefined, bucket: R2Bucket, request: Request }} options
 */
export async function serveTeachingImage({ user, asset, bucket, request }) {
  if (!user) {
    return new Response('Authentication required.', {
      status: 401,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  if (!asset?.isActive) return new Response('Not found.', { status: 404 });
  return servePrivateImmutableObject({ user, bucket, request, storageKey: asset.storageKey, mimeType: asset.mimeType });
}

/**
 * Deliver the exact object snapshotted into one owned Review. Current Asset
 * activity/storage metadata is deliberately irrelevant: the caller supplies a
 * storage key loaded from review_assets.storage_key_snapshot after ownership
 * validation. Review URLs are owner-specific, so browser caches must revalidate
 * with the authenticated endpoint instead of treating a successful response as
 * fresh across later application sessions on the same browser.
 *
 * @param {{ user: unknown, storageKeySnapshot: string, bucket: R2Bucket, request: Request }} options
 */
export async function serveReviewImage({ user, storageKeySnapshot, bucket, request }) {
  return servePrivateImmutableObject({
    user,
    bucket,
    request,
    storageKey: storageKeySnapshot,
    cacheControl: 'private, max-age=0, must-revalidate'
  });
}
