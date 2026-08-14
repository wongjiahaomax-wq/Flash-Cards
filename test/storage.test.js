import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_IMAGE_BYTES,
  MAX_MEDIA_BYTES,
  MediaStorageLimitError,
  assertImageSize,
  assertMediaCapacity,
  getMediaUsageBytes,
  putTeachingImage
} from '../src/lib/server/storage/media.js';

/**
 * @typedef {{ objects: Array<{ size: number }>, truncated: boolean }} MockPage
 * @typedef {{ pages?: MockPage[], existing?: unknown }} MockBucketOptions
 */

/**
 * @param {MockBucketOptions} [options]
 */
function mockBucket(options = {}) {
  const { pages = [], existing = null } = options;
  /** @type {{ list: number, head: number, put: number, putOptions: R2PutOptions | undefined }} */
  const calls = { list: 0, head: 0, put: 0, putOptions: undefined };

  /** @type {R2Bucket} */
  const bucket = /** @type {any} */ ({
    /** @param {R2ListOptions} [listOptions] */
    async list(listOptions = {}) {
      calls.list += 1;
      const index = listOptions.cursor ? Number(listOptions.cursor) : 0;
      /** @type {MockPage} */
      const page = pages[index] ?? { objects: [], truncated: false };
      return {
        objects: page.objects,
        truncated: page.truncated,
        cursor: page.truncated ? String(index + 1) : undefined,
        delimitedPrefixes: []
      };
    },
    /** @param {string} _key */
    async head(_key) {
      calls.head += 1;
      return existing;
    },
    /**
     * @param {string} key
     * @param {Blob} value
     * @param {R2PutOptions} [putOptions]
     */
    async put(key, value, putOptions = {}) {
      calls.put += 1;
      calls.putOptions = putOptions;
      return {
        key,
        version: 'test-version',
        size: value.size,
        etag: 'test-etag',
        httpEtag: '"test-etag"',
        uploaded: new Date(),
        httpMetadata: putOptions.httpMetadata ?? {},
        customMetadata: {},
        checksums: {},
        storageClass: putOptions.storageClass ?? 'Standard',
        writeHttpMetadata() {}
      };
    }
  });

  return { bucket, calls };
}

test('image limit is 5 MiB and total media limit is 5 GiB', () => {
  assert.equal(MAX_IMAGE_BYTES, 5 * 1024 * 1024);
  assert.equal(MAX_MEDIA_BYTES, 5 * 1024 * 1024 * 1024);
});

test('rejects an image larger than 5 MiB', () => {
  assert.throws(
    () => assertImageSize(MAX_IMAGE_BYTES + 1),
    (error) => error instanceof MediaStorageLimitError && error.code === 'IMAGE_TOO_LARGE'
  );
});

test('totals R2 usage across paginated list results', async () => {
  const { bucket, calls } = mockBucket({
    pages: [
      { objects: [{ size: 100 }, { size: 200 }], truncated: true },
      { objects: [{ size: 300 }], truncated: false }
    ]
  });

  assert.equal(await getMediaUsageBytes(bucket), 600);
  assert.equal(calls.list, 2);
});

test('rejects an upload that would exceed 5 GiB total storage', async () => {
  const { bucket } = mockBucket({
    pages: [{ objects: [{ size: MAX_MEDIA_BYTES - 10 }], truncated: false }]
  });

  await assert.rejects(
    () => assertMediaCapacity(bucket, 11),
    (error) => error instanceof MediaStorageLimitError && error.code === 'BUCKET_LIMIT'
  );
});

test('teaching image uploads use Standard storage and preserve content type', async () => {
  const { bucket, calls } = mockBucket({
    pages: [{ objects: [{ size: 1024 }], truncated: false }]
  });
  const file = new Blob([new Uint8Array(2048)], { type: 'image/png' });

  const result = await putTeachingImage(bucket, 'cases/example.png', file);

  assert.equal(result.sizeBytes, 2048);
  assert.equal(result.projectedBytes, 3072);
  assert.equal(calls.put, 1);
  assert.deepEqual(calls.putOptions, {
    storageClass: 'Standard',
    httpMetadata: { contentType: 'image/png' }
  });
});

test('teaching image keys are immutable', async () => {
  const { bucket, calls } = mockBucket({ existing: { key: 'cases/example.png' } });
  const file = new Blob([new Uint8Array(32)], { type: 'image/png' });

  await assert.rejects(
    () => putTeachingImage(bucket, 'cases/example.png', file),
    (error) => error instanceof MediaStorageLimitError && error.code === 'OBJECT_EXISTS'
  );

  assert.equal(calls.put, 0);
  assert.equal(calls.list, 0);
});
