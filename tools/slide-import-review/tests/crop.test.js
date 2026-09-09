import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fullCrop, minimumCropSize, moveCrop, resizeCrop, cropToPixels,
  resolveCropSourceCandidates
} from '../src/crop.js';

test('full crop starts at the complete source', () => {
  assert.deepEqual(fullCrop(), { x: 0, y: 0, width: 1, height: 1 });
});

test('moving a crop preserves its size and clamps at every boundary', () => {
  const crop = { x: 0.2, y: 0.25, width: 0.4, height: 0.3 };
  assert.deepEqual(moveCrop(crop, -1, -1), { x: 0, y: 0, width: 0.4, height: 0.3 });
  assert.deepEqual(moveCrop(crop, 1, 1), { x: 0.6, y: 0.7, width: 0.4, height: 0.3 });
});

test('all edge and corner resizes preserve the opposite boundary', () => {
  const crop = { x: 0.2, y: 0.25, width: 0.4, height: 0.3 };
  const min = { width: 0.1, height: 0.1 };
  assert.equal(resizeCrop(crop, 0.1, 0, 'e', min).x, crop.x);
  assert.equal(resizeCrop(crop, -0.1, 0, 'w', min).x + resizeCrop(crop, -0.1, 0, 'w', min).width, 0.6);
  assert.equal(resizeCrop(crop, 0, 0.1, 's', min).y, crop.y);
  assert.equal(resizeCrop(crop, 0, -0.1, 'n', min).y + resizeCrop(crop, 0, -0.1, 'n', min).height, 0.55);
  const nw = resizeCrop(crop, -0.1, -0.1, 'nw', min);
  const se = resizeCrop(crop, 0.1, 0.1, 'se', min);
  assert.equal(nw.x + nw.width, 0.6);
  assert.equal(nw.y + nw.height, 0.55);
  assert.equal(se.x, crop.x);
  assert.equal(se.y, crop.y);
  for (const mode of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const value = resizeCrop(crop, 2, 2, mode, min);
    assert.ok(value.x >= 0 && value.y >= 0 && value.x + value.width <= 1 && value.y + value.height <= 1);
    assert.ok(value.width >= min.width && value.height >= min.height);
  }
});

test('minimum crop size is derived from rendered dimensions', () => {
  assert.deepEqual(minimumCropSize(1200, 600), { width: 0.02, height: 0.04 });
  assert.deepEqual(minimumCropSize(10, 10), { width: 1, height: 1 });
});

test('normalized crop converts to bounded natural-image pixels without upscaling', () => {
  assert.deepEqual(cropToPixels({ x: 0.1, y: 0.2, width: 0.5, height: 0.4 }, 1000, 500), { x: 100, y: 100, width: 500, height: 200 });
  assert.deepEqual(cropToPixels({ x: 0.999, y: 0.999, width: 0.001, height: 0.001 }, 100, 50), { x: 99, y: 49, width: 1, height: 1 });
});

test('crop source candidates are restricted to Asset sourceRefs and existing previews', () => {
  const refs = [
    { sourceId: 'source-1', pages: [1, 2] },
    { sourceId: 'source-2', pages: [4] }
  ];
  const coverage = [
    { sourceId: 'source-1', page: 1, previewPath: 'source-previews/one.jpg' },
    { sourceId: 'source-1', page: 2, previewPath: 'source-previews/two.jpg' },
    { sourceId: 'source-2', page: 4, previewPath: 'source-previews/four.jpg' },
    { sourceId: 'source-3', page: 9, previewPath: 'source-previews/unrelated.jpg' }
  ];
  const candidates = resolveCropSourceCandidates(refs, coverage, new Set(['source-previews/one.jpg', 'source-previews/four.jpg']));
  assert.deepEqual(candidates, [
    { sourceId: 'source-1', page: 1, previewPath: 'source-previews/one.jpg' },
    { sourceId: 'source-2', page: 4, previewPath: 'source-previews/four.jpg' }
  ]);
});
