import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MediaStorageLimitError,
  putTeachingImage
} from '../src/lib/server/storage/media.js';

class ConditionalR2Fake {
  constructor() {
    this.object = null;
  }

  async head(key) {
    if (!this.object || this.object.key !== key) return null;
    return { key, size: this.object.bytes.byteLength, etag: this.object.etag };
  }

  async list() {
    return {
      objects: this.object
        ? [{ key: this.object.key, size: this.object.bytes.byteLength }]
        : [],
      truncated: false
    };
  }

  async put(key, body, options = {}) {
    // Materialize both bodies before the fake performs its atomic precondition
    // check + store. This lets both callers pass their earlier friendly HEAD,
    // while still modelling R2's server-side conditional PUT as one operation.
    const bytes = body instanceof Uint8Array
      ? body.slice()
      : new Uint8Array(await body.arrayBuffer());
    await Promise.resolve();

    const condition = options.onlyIf instanceof Headers
      ? options.onlyIf.get('if-none-match')
      : null;
    if (condition === '*' && this.object?.key === key) return null;

    this.object = { key, bytes, etag: `etag-${bytes.byteLength}` };
    return { key, size: bytes.byteLength, etag: this.object.etag };
  }

  async delete(key) {
    if (this.object?.key === key) this.object = null;
  }
}

test('conditional teaching-image PUT allows only one concurrent creator for an immutable key', async () => {
  const bucket = new ConditionalR2Fake();
  const key = 'teaching-images/deterministic-race.png';
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const file = new Blob([bytes], { type: 'image/png' });

  const results = await Promise.allSettled([
    putTeachingImage(bucket, key, file),
    putTeachingImage(bucket, key, file)
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(rejected);
  assert.ok(rejected.reason instanceof MediaStorageLimitError);
  assert.equal(rejected.reason.code, 'OBJECT_EXISTS');

  assert.ok(bucket.object, 'the winning immutable object must remain present');
  assert.equal(bucket.object.key, key);
  assert.deepEqual([...bucket.object.bytes], [...bytes]);
});
