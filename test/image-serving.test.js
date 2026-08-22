import assert from 'node:assert/strict';
import test from 'node:test';

import { serveTeachingImage } from '../src/lib/server/storage/serve.js';

const asset = {
  isActive: true,
  mimeType: 'image/png',
  storageKey: 'teaching-images/immutable.png'
};

/** @param {unknown} object */
function mockBucket(object) {
  /** @type {string[]} */
  const calls = [];
  return {
    calls,
    bucket: /** @type {R2Bucket} */ ({
      async get(key) {
        calls.push(key);
        return /** @type {R2ObjectBody | null} */ (object);
      }
    })
  };
}

test('image serving requires authentication and does not read R2', async () => {
  const { bucket, calls } = mockBucket(null);
  const response = await serveTeachingImage({
    user: null,
    asset,
    bucket,
    request: new Request('https://example.test/api/assets/a/image')
  });

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(calls, []);
});

test('missing or inactive Assets return 404 without reading R2', async () => {
  const { bucket, calls } = mockBucket(null);
  const request = new Request('https://example.test/api/assets/a/image');

  const missing = await serveTeachingImage({ user: {}, asset: null, bucket, request });
  const inactive = await serveTeachingImage({ user: {}, asset: { ...asset, isActive: false }, bucket, request });

  assert.equal(missing.status, 404);
  assert.equal(inactive.status, 404);
  assert.deepEqual(calls, []);
});

test('missing R2 objects return 404', async () => {
  const { bucket, calls } = mockBucket(null);
  const response = await serveTeachingImage({
    user: {},
    asset,
    bucket,
    request: new Request('https://example.test/api/assets/a/image')
  });

  assert.equal(response.status, 404);
  assert.deepEqual(calls, [asset.storageKey]);
});

test('successful image serving preserves metadata, ETag, and private immutable caching without proxy method calls', async () => {
  const object = {
    body: new Blob(['image-bytes']).stream(),
    httpEtag: '"asset-etag"',
    httpMetadata: {
      contentType: 'application/octet-stream',
      contentLanguage: 'en'
    },
    writeHttpMetadata() {
      throw new Error('writeHttpMetadata must not be called through the Vite platform proxy');
    }
  };
  const { bucket } = mockBucket(object);
  const response = await serveTeachingImage({
    user: {},
    asset,
    bucket,
    request: new Request('https://example.test/api/assets/a/image')
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('content-language'), 'en');
  assert.equal(response.headers.get('cache-control'), 'private, max-age=31536000, immutable');
  assert.equal(response.headers.get('etag'), '"asset-etag"');
  assert.equal(await response.text(), 'image-bytes');
});

test('matching ETag returns 304 without serving image bytes or calling the proxied metadata method', async () => {
  const object = {
    body: new Blob(['image-bytes']).stream(),
    httpEtag: '"asset-etag"',
    httpMetadata: { contentType: 'image/png' },
    writeHttpMetadata() {
      throw new Error('writeHttpMetadata must not be called through the Vite platform proxy');
    }
  };
  const { bucket } = mockBucket(object);
  const response = await serveTeachingImage({
    user: {},
    asset,
    bucket,
    request: new Request('https://example.test/api/assets/a/image', {
      headers: { 'if-none-match': '"asset-etag"' }
    })
  });

  assert.equal(response.status, 304);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('etag'), '"asset-etag"');
});
