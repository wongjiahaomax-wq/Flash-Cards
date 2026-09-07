import test from 'node:test';
import assert from 'node:assert/strict';
import { trimResourceUrlCache, RESOURCE_URL_CACHE_BYTES } from '../src/resource-cache.js';

test('active Case resource working set can exceed the general URL budget without revocation', () => {
  const activeBytes = Math.ceil(RESOURCE_URL_CACHE_BYTES * 0.75);
  const cache = new Map([
    ['source-a', { bytes: activeBytes, used: 1, url: 'blob:source-a' }],
    ['media-a', { bytes: activeBytes, used: 2, url: 'blob:media-a' }]
  ]);
  const released = [];
  trimResourceUrlCache(cache, new Set(cache.keys()), undefined, path => released.push(path));
  assert.equal(cache.size, 2);
  assert.deepEqual(released, []);
});

test('URL cache evicts stale resources once the active working set changes', () => {
  const cache = new Map([
    ['old', { bytes: RESOURCE_URL_CACHE_BYTES * 0.75, used: 1, url: 'blob:old' }],
    ['active', { bytes: RESOURCE_URL_CACHE_BYTES * 0.75, used: 2, url: 'blob:active' }]
  ]);
  const released = [];
  trimResourceUrlCache(cache, new Set(['active']), undefined, (path, item) => {
    assert.equal(cache.get(path).url, item.url);
    released.push(item.url);
  });
  assert.deepEqual([...cache.keys()], ['active']);
  assert.deepEqual(released, ['blob:old']);
});
