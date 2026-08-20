import assert from 'node:assert/strict';
import test from 'node:test';

import { serveReviewImage, serveTeachingImage } from '../src/lib/server/storage/serve.js';

function bucketFixture() {
  const etag = '"review-object-etag"';
  const bucket = {
    async get() {
      return /** @type {any} */ ({
        body: new Blob(['historical-image']).stream(),
        httpEtag: etag,
        /** @param {Headers} headers */
        writeHttpMetadata(headers) {
          headers.set('Content-Type', 'image/png');
        }
      });
    }
  };
  return /** @type {R2Bucket} */ (/** @type {unknown} */ (bucket));
}

test('Review-owned media forces browser revalidation while retaining ETag support', async () => {
  const bucket = bucketFixture();
  const first = await serveReviewImage({
    user: { id: 'learner-a' },
    storageKeySnapshot: 'teaching-images/historical.png',
    bucket,
    request: new Request('https://example.test/review-image')
  });

  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'private, max-age=0, must-revalidate');
  assert.equal(first.headers.get('etag'), '"review-object-etag"');
  assert.equal(await first.text(), 'historical-image');

  const revalidated = await serveReviewImage({
    user: { id: 'learner-a' },
    storageKeySnapshot: 'teaching-images/historical.png',
    bucket,
    request: new Request('https://example.test/review-image', {
      headers: { 'If-None-Match': '"review-object-etag"' }
    })
  });

  assert.equal(revalidated.status, 304);
  assert.equal(revalidated.headers.get('cache-control'), 'private, max-age=0, must-revalidate');
  assert.equal(revalidated.headers.get('etag'), '"review-object-etag"');
});

test('ordinary active teaching Assets keep long-lived immutable private caching', async () => {
  const response = await serveTeachingImage({
    user: { id: 'learner-a' },
    asset: {
      isActive: true,
      storageKey: 'teaching-images/current.png',
      mimeType: 'image/png'
    },
    bucket: bucketFixture(),
    request: new Request('https://example.test/current-image')
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, max-age=31536000, immutable');
});
