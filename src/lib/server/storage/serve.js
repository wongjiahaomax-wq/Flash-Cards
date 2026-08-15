/**
 * @typedef {{ isActive: boolean, mimeType: string, storageKey: string }} TeachingAsset
 */

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

  const object = await bucket.get(asset.storageKey);
  if (!object) return new Response('Not found.', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', asset.mimeType);
  headers.set('Cache-Control', 'private, max-age=31536000, immutable');
  if (object.httpEtag) headers.set('ETag', object.httpEtag);

  if (object.httpEtag && request.headers.get('if-none-match') === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(object.body, { headers });
}
