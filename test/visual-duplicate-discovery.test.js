// @ts-nocheck
//
// Executable coverage for Tranche 2 (visual duplicate discovery). Every required
// behavior is exercised at runtime: deterministic region generation, exact 64-bit
// BigInt hashing, white-alpha compositing, threshold/ranking stability, asymmetric
// crop detection, scan bounds (120 assets, 96 MiB, 4/2 concurrency), cancellation
// and stale-run suppression, per-image failure isolation, sessionStorage
// dismissals, Topic/System/global scope membership, and read-only integration with
// the existing Tranche-1 comparison flow.

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('$lib/')) {
      return { url: new URL(`../src/lib/${specifier.slice('$lib/'.length)}`, import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});

import { createDb } from '../src/lib/server/db/index.js';
import {
  AssetVisualDiscoveryInputError,
  listVisualDuplicateCandidates,
  listVisualDuplicateScopes,
  VISUAL_DISCOVERY_MAX_ASSETS
} from '../src/lib/server/db/asset-visual-discovery.js';
import {
  canonicalPairKey,
  classifyPair,
  compareFingerprints,
  compositeGray,
  derivePairMetrics,
  differenceHash64,
  hammingDistance,
  hashWorkingRaster,
  popcount64,
  rankDiscoveredPairs,
  regionRects,
  REGION_COUNT,
  workingRasterSize
} from '../src/lib/images/visual-duplicate-matcher.js';
import {
  createVisualDuplicateController,
  DEFAULT_LIMITS,
  readBoundedBytes,
  runVisualDuplicateScan
} from '../src/lib/images/visual-duplicate-discovery.js';
import { createVisualDuplicateDismissals } from '../src/lib/images/visual-duplicate-dismissals.js';
import { buildCompareHref, createAdminDiscoveryController } from '../src/lib/images/visual-duplicate-browser.js';
import { MAX_IMAGE_BYTES } from '../src/lib/server/storage/media.js';
import { applyCurrentSchema } from './current-schema.js';

// ---------------------------------------------------------------------------
// Deterministic raster fixtures (no real or Production-derived images)
// ---------------------------------------------------------------------------

/** @param {number} width @param {number} height @param {(fx: number, fy: number) => number[]} fn */
function rasterFrom(width, height, fn) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fn(width === 1 ? 0 : x / (width - 1), height === 1 ? 0 : y / (height - 1));
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }
  return { data, width, height };
}

/** A smooth, resolution-independent clinical-style gradient. */
function gradientRaster(width, height) {
  return rasterFrom(width, height, (fx, fy) => {
    const value = Math.round(255 * (0.55 * fx + 0.35 * fy + 0.2 * Math.sin(fx * 6)));
    return [value, Math.round(value * 0.7), Math.round(value * 0.4), 255];
  });
}

/** @param {{ data: Uint8ClampedArray, width: number, height: number }} raster */
function cloneRaster(raster) {
  return { data: new Uint8ClampedArray(raster.data), width: raster.width, height: raster.height };
}

/**
 * Overwrite a normalized rectangle with a deterministic high-frequency pattern so
 * the affected regions can no longer match the source.
 * @param {{ data: Uint8ClampedArray, width: number, height: number }} raster
 */
function overwriteRect(raster, x0, y0, x1, y1) {
  const copy = cloneRaster(raster);
  const startX = Math.floor(x0 * copy.width);
  const endX = Math.ceil(x1 * copy.width);
  const startY = Math.floor(y0 * copy.height);
  const endY = Math.ceil(y1 * copy.height);
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * copy.width + x) * 4;
      copy.data[offset] = 255;
      copy.data[offset + 1] = 0;
      copy.data[offset + 2] = 255;
      copy.data[offset + 3] = 255;
    }
  }
  return copy;
}

/** @param {number} seed */
function seededRaster(seed, width = 18, height = 18) {
  let state = (seed * 2654435761) % 4294967296;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state;
  };
  return rasterFrom(width, height, (fx, fy) => {
    const base = seed * 11 % 255;
    const value = (base + Math.round(fx * 120) + Math.round(fy * 60) + (next() % 5)) % 256;
    return [value, (value + seed * 3) % 256, (value * 2 + seed) % 256, 255];
  });
}

// ---------------------------------------------------------------------------
// Matcher: regions, hashing, compositing
// ---------------------------------------------------------------------------

test('matcher generates exactly 38 deterministic unique regions including asymmetric crops', () => {
  const regions = regionRects();
  assert.equal(regions.length, REGION_COUNT);
  assert.equal(regions.length, 38);
  assert.equal(new Set(regions.map((region) => region.label)).size, 38);
  assert.deepEqual(regionRects(), regions, 'region generation must be deterministic');

  for (const region of regions) {
    assert.ok(region.x >= 0 && region.y >= 0);
    assert.ok(region.x + region.widthFraction <= 1.000001);
    assert.ok(region.y + region.heightFraction <= 1.000001);
  }

  const labels = new Set(regions.map((region) => region.label));
  for (const expected of [
    '1.0x1.0@full',
    '0.8x0.8@top-left',
    '0.8x0.8@top-right',
    '0.8x0.8@bottom-left',
    '0.8x0.8@bottom-right',
    '0.8x0.8@centre',
    '0.8x1.0@left',
    '0.8x1.0@centre',
    '0.8x1.0@right',
    '1.0x0.8@top',
    '1.0x0.8@centre',
    '1.0x0.8@bottom',
    '0.8x0.6@top-left',
    '0.6x0.8@bottom-right'
  ]) {
    assert.ok(labels.has(expected), `missing region ${expected}`);
  }
});

test('matcher produces exact 64-bit BigInt dHashes and exact Hamming distances above 2^53', () => {
  const alternatingRow = [0, 255, 0, 255, 0, 255, 0, 255, 0];
  const gray = Array.from({ length: 8 }, () => alternatingRow).flat();
  const hash = differenceHash64(gray);
  assert.equal(typeof hash, 'bigint');
  assert.equal(hash, 0x5555555555555555n);
  assert.equal(popcount64(hash), 32);

  // Values above 2^53 stay exact only with BigInt.
  assert.equal(hammingDistance(1n << 63n, (1n << 63n) + 1n), 1);
  assert.equal(hammingDistance(2n ** 53n, 2n ** 53n + 1n), 1);
  assert.equal(hammingDistance(0n, 2n ** 64n - 1n), 64);
  assert.equal(hammingDistance(0x5555555555555555n, 0xAAAAAAAAAAAAAAAAAn & 0xFFFFFFFFFFFFFFFFn), 64);
  assert.equal(0xAAAAAAAAAAAAAAAAAn > 2n ** 63n, true, 'fixture must exceed 2^53 to prove exactness');
  assert.throws(() => hammingDistance(123, 456), /BigInt/);

  const hashes = hashWorkingRaster(gradientRaster(32, 24));
  assert.equal(hashes.length, 38);
  assert.ok(hashes.every((value) => typeof value === 'bigint'));
  assert.ok(hashes.every((value) => value >= 0n && value <= 2n ** 64n - 1n));
  assert.equal(compareFingerprints(hashes, hashes).bestDistance, 0);

  // Differential check: the fast lane-table popcount must stay exact for every
  // 64-bit pattern, including set high bits.
  const naivePopcount = (value) => {
    let remaining = value < 0n ? -value : value;
    let count = 0;
    while (remaining > 0n) { remaining &= remaining - 1n; count += 1; }
    return count;
  };
  let state = 123456789n;
  const nextHash = () => {
    state = (state * 6364136223846793005n + 1442695040888963407n) & (2n ** 64n - 1n);
    return state;
  };
  for (let index = 0; index < 2000; index += 1) {
    const left = nextHash();
    const right = nextHash();
    assert.equal(popcount64(left), naivePopcount(left));
    assert.equal(hammingDistance(left, right), naivePopcount(left ^ right), `popcount mismatch at sample ${index}`);
  }
  assert.equal(popcount64(2n ** 64n - 1n), 64);
  assert.equal(popcount64((1n << 63n) | 1n), 2);
});

test('matcher composites alpha against white before grayscale', () => {
  assert.deepEqual(compositeGray(0, 0, 0, 0), { r: 255, g: 255, b: 255, gray: 255 }, 'transparent black must become white');
  assert.deepEqual(compositeGray(255, 0, 0, 128), { r: 255, g: 127, b: 127, gray: 165 });

  const translucent = rasterFrom(24, 16, (fx, fy) => [Math.round(fx * 255), Math.round(fy * 255), 40, 96]);
  const opaqueComposite = rasterFrom(24, 16, (fx, fy) => {
    const r = Math.round(fx * 255);
    const g = Math.round(fy * 255);
    const b = 40;
    return [compositeGray(r, g, b, 96).r, compositeGray(r, g, b, 96).g, compositeGray(r, g, b, 96).b, 255];
  });
  assert.deepEqual(hashWorkingRaster(translucent), hashWorkingRaster(opaqueComposite));

  const fullyTransparent = rasterFrom(24, 16, () => [12, 200, 80, 0]);
  const white = rasterFrom(24, 16, () => [255, 255, 255, 255]);
  assert.deepEqual(hashWorkingRaster(fullyTransparent), hashWorkingRaster(white));
});

test('working raster respects longest-side and pixel bounds without enlarging small images', () => {
  for (const [width, height] of [[1536, 1024], [4000, 4000], [900, 1600], [120, 80], [1, 5000], [768, 768]]) {
    const target = workingRasterSize(width, height);
    assert.ok(target.width <= 768 && target.height <= 768, `${width}x${height} exceeded the longest side`);
    assert.ok(target.width * target.height <= 768 * 768, `${width}x${height} exceeded the pixel bound`);
    assert.ok(target.width <= width && target.height <= height, `${width}x${height} was enlarged`);
  }
  assert.deepEqual(workingRasterSize(120, 80), { width: 120, height: 80, scale: 1 });
});

// ---------------------------------------------------------------------------
// Matcher: thresholds, ranking, crop and perturbation detection
// ---------------------------------------------------------------------------

test('threshold classification and ranking are stable and deterministic', () => {
  assert.equal(classifyPair(6, 3, 24), 'likely');
  assert.equal(classifyPair(7, 3, 21), 'possible');
  assert.equal(classifyPair(6, 2, 18), 'possible');
  assert.equal(classifyPair(11, 3, 33), null);
  assert.equal(classifyPair(0, 3, 25), 'possible', 'top-3 sum above the Likely bound demotes to Possible');
  assert.equal(classifyPair(0, 2, 37), null, 'top-3 sum above the Possible bound is not proposed');
  assert.equal(classifyPair(10, 2, 30), 'possible');
  assert.equal(classifyPair(0, 0, 0), null, 'unsupported pairs are never proposed');

  assert.equal(derivePairMetrics([0, 0, 0], [0, 0, 0]).classification, 'likely');
  assert.equal(derivePairMetrics([7, 7, 7], [7, 7, 7]).classification, 'possible');
  assert.equal(derivePairMetrics([0, 60, 60], [60, 60, 60]).classification, null);

  const ranked = rankDiscoveredPairs([
    { assetIdA: 'z', assetIdB: 'a', classification: 'possible', bestDistance: 4, top3DistanceSum: 9, support: 5 },
    { assetIdA: 'm', assetIdB: 'b', classification: 'likely', bestDistance: 2, top3DistanceSum: 8, support: 3 },
    { assetIdA: 'c', assetIdB: 'd', classification: 'likely', bestDistance: 2, top3DistanceSum: 8, support: 3 },
    { assetIdA: 'e', assetIdB: 'f', classification: 'likely', bestDistance: 2, top3DistanceSum: 8, support: 4 }
  ]);
  assert.deepEqual(
    ranked.map((pair) => `${pair.classification}:${pair.assetIdA}-${pair.assetIdB}`),
    ['likely:e-f', 'likely:m-b', 'likely:c-d', 'possible:z-a'],
    'Likely precedes Possible; ties fall back to support desc then canonical pair asc'
  );

  // The same inputs always rank identically.
  const again = rankDiscoveredPairs(ranked.map((pair) => ({ ...pair })));
  assert.deepEqual(again, ranked);
  assert.equal(canonicalPairKey('b', 'a'), canonicalPairKey('a', 'b'));
});

test('asymmetric and one-sided crops are proposed as duplicates', () => {
  const base = gradientRaster(100, 80);
  const baseHashes = hashWorkingRaster(base);
  const symmetric = overwriteRect(overwriteRect(overwriteRect(overwriteRect(base, 0, 0, 1, 0.1), 0, 0.9, 1, 1), 0, 0, 0.1, 1), 0.9, 0, 1, 1);
  const cases = {
    'left crop': overwriteRect(base, 0.8, 0, 1, 1),
    'right crop': overwriteRect(base, 0, 0, 0.2, 1),
    'top crop': overwriteRect(base, 0, 0.8, 1, 1),
    'bottom crop': overwriteRect(base, 0, 0, 1, 0.2),
    'symmetric crop': symmetric,
    'rectangular asymmetric crop': overwriteRect(base, 0.7, 0.6, 1, 1)
  };
  for (const [label, variant] of Object.entries(cases)) {
    const metrics = compareFingerprints(baseHashes, hashWorkingRaster(variant));
    assert.equal(metrics.classification, 'likely', `${label} should still be proposed as Likely`);
    assert.ok(metrics.bestDistance <= 6, `${label} should keep an exact matching region`);
  }

  // Proof the asymmetric one-sided regions are what preserve the match: the
  // full-frame dHash differs after the crop, the untouched left-crop region still
  // matches exactly, and the opposite one-sided region no longer matches.
  const leftCrop = cases['left crop'];
  const leftCropHashes = hashWorkingRaster(leftCrop);
  assert.ok(hammingDistance(baseHashes[0], leftCropHashes[0]) > 0, 'full-frame dHash must differ after the crop');
  const leftRegion = regionRects().findIndex((region) => region.label === '0.8x1.0@left');
  const rightRegion = regionRects().findIndex((region) => region.label === '0.8x1.0@right');
  assert.equal(hammingDistance(baseHashes[leftRegion], leftCropHashes[leftRegion]), 0);
  assert.ok(hammingDistance(baseHashes[rightRegion], leftCropHashes[rightRegion]) > 0, 'the opposite width-only crop must not match');
});

test('same source at a different resolution, and mild noise perturbation, are proposed', () => {
  const large = gradientRaster(180, 120);
  const small = gradientRaster(90, 60);
  const resolutionMetrics = compareFingerprints(hashWorkingRaster(large), hashWorkingRaster(small));
  assert.notEqual(resolutionMetrics.classification, null, 'same source at a different resolution must be proposed');
  assert.ok(resolutionMetrics.bestDistance <= 6);

  const noisy = rasterFrom(180, 120, (fx, fy) => {
    const value = Math.round(255 * (0.55 * fx + 0.35 * fy + 0.2 * Math.sin(fx * 6)));
    let state = Math.round(fx * 1000) + Math.round(fy * 1000) * 7;
    state = (state * 1664525 + 1013904223) % 4294967296;
    const jitter = (state % 21) - 10;
    return [Math.max(0, Math.min(255, value + jitter)), Math.round(value * 0.7), Math.round(value * 0.4), 255];
  });
  assert.notEqual(compareFingerprints(hashWorkingRaster(large), hashWorkingRaster(noisy)).classification, null);
});

test('structurally different synthetic patterns are not proposed as Likely', () => {
  const decreasingHorizontal = rasterFrom(120, 90, (fx) => { const value = Math.round(255 * (1 - fx)); return [value, value, value, 255]; });
  const vertical = rasterFrom(120, 90, (_fx, fy) => { const value = Math.round(fy * 255); return [value, value, value, 255]; });
  const metrics = compareFingerprints(hashWorkingRaster(decreasingHorizontal), hashWorkingRaster(vertical));
  assert.notEqual(metrics.classification, 'likely', 'broad structure alone must not reach the strongest band');
  assert.equal(metrics.classification, null);
});

// ---------------------------------------------------------------------------
// Discovery controller: bounds, concurrency, cancellation, failure isolation
// ---------------------------------------------------------------------------

function fakeResponse(bytes, { contentLength = bytes.byteLength, contentType = 'image/png' } = {}) {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        const key = String(name).toLowerCase();
        if (key === 'content-length') return contentLength === null ? null : String(contentLength);
        if (key === 'content-type') return contentType;
        return null;
      }
    },
    body: null,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  };
}

function streamingResponse(chunks, onCancel) {
  let index = 0;
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: chunks[index++] };
          },
          async cancel() { if (onCancel) onCancel(); },
          releaseLock() {}
        };
      }
    }
  };
}

const tinyYield = async () => {};

test('candidate scan is capped at 120 assets and never silently claims completeness', async () => {
  let fetchCount = 0;
  const controller = createVisualDuplicateController({
    fetchImage: async () => { fetchCount += 1; return fakeResponse(new Uint8Array(64)); },
    decodeImage: async () => seededRaster(1),
    yieldControl: tinyYield
  });
  const candidates = Array.from({ length: 130 }, (_, index) => ({ id: `asset-${String(index).padStart(3, '0')}`, imageUrl: `/image/${index}` }));
  const result = await controller.start({ candidates });

  assert.equal(result.scannedCount, 120);
  assert.equal(result.candidateCount, 130);
  assert.equal(result.truncated, true);
  assert.equal(result.bounded, true);
  assert.ok(result.incompleteReasons.includes('candidate-limit'));
  assert.equal(fetchCount, 120);
  assert.equal(result.fingerprintedCount, 120);
});

test('total fetch budget stops the scan before exceeding 96 MiB and flags incompleteness', async () => {
  assert.equal(DEFAULT_LIMITS.maxTotalFetchBytes, 96 * 1024 * 1024);

  let streamingCancelled = false;
  const budget = 2500;
  const controller = createVisualDuplicateController({
    limits: { maxTotalFetchBytes: budget, maxScanAssets: 120, fetchConcurrency: 2, decodeConcurrency: 1 },
    fetchImage: async (_url, { signal }) => {
      if (signal.aborted) throw new Error('aborted');
      return fakeResponse(new Uint8Array(1000));
    },
    decodeImage: async () => seededRaster(2),
    yieldControl: tinyYield
  });
  const result = await controller.start({ candidates: Array.from({ length: 10 }, (_, index) => ({ id: `budget-${index}`, imageUrl: `/image/${index}` })) });
  assert.ok(result.totalBytes <= budget, `fetched ${result.totalBytes} bytes against a ${budget} byte budget`);
  assert.equal(result.budgetExceeded, true);
  assert.ok(result.incompleteReasons.includes('fetch-budget'));
  assert.ok(result.fingerprintedCount < 10);

  // Trusted Content-Length stops the scan before any body byte is read.
  let trustedFetchCount = 0;
  const trusted = await runVisualDuplicateScan({
    candidates: Array.from({ length: 6 }, (_, index) => ({ id: `trusted-${index}`, imageUrl: `/image/${index}` })),
    limits: { maxTotalFetchBytes: 2500, fetchConcurrency: 1, decodeConcurrency: 1 },
    fetchImage: async () => { trustedFetchCount += 1; return fakeResponse(new Uint8Array(1000)); },
    decodeImage: async () => seededRaster(3),
    yieldControl: tinyYield
  });
  assert.equal(trusted.budgetExceeded, true);
  assert.ok(trusted.totalBytes <= 2500);
  assert.equal(trustedFetchCount, 3, 'two reads fit; the third trusted length exceeds the remaining budget');

  // Streamed bodies are abandoned mid-read rather than buffered past the budget.
  const streamed = await runVisualDuplicateScan({
    candidates: Array.from({ length: 4 }, (_, index) => ({ id: `stream-${index}`, imageUrl: `/image/${index}` })),
    limits: { maxTotalFetchBytes: 2500, fetchConcurrency: 1, decodeConcurrency: 1 },
    fetchImage: async () => streamingResponse([new Uint8Array(1000), new Uint8Array(1000), new Uint8Array(1000)], () => { streamingCancelled = true; }),
    decodeImage: async () => seededRaster(4),
    yieldControl: tinyYield
  });
  assert.equal(streamed.budgetExceeded, true);
  assert.equal(streamed.totalBytes, 0, 'a cancelled stream publishes no partial bytes');
  assert.equal(streamingCancelled, true);

  // Concurrent workers must reserve budget synchronously so they can never
  // collectively read past the total fetch budget.
  const concurrent = await runVisualDuplicateScan({
    candidates: Array.from({ length: 12 }, (_, index) => ({ id: `conc-budget-${index}`, imageUrl: `/image/${index}` })),
    limits: { maxTotalFetchBytes: 2500, fetchConcurrency: 4, decodeConcurrency: 2 },
    fetchImage: async () => { await new Promise((resolve) => setTimeout(resolve, 1)); return fakeResponse(new Uint8Array(1000)); },
    decodeImage: async () => seededRaster(13),
    yieldControl: tinyYield
  });
  assert.ok(concurrent.totalBytes <= 2500, `concurrent workers fetched ${concurrent.totalBytes} bytes against a 2500 byte budget`);
  assert.equal(concurrent.budgetExceeded, true);
  assert.deepEqual(concurrent.incompleteReasons.includes('fetch-budget'), true);
});

test('fetch concurrency stays at or below 4 and decode concurrency at or below 2', async () => {
  let activeFetch = 0;
  let activeDecode = 0;
  let maxFetch = 0;
  let maxDecode = 0;
  const controller = createVisualDuplicateController({
    fetchImage: async () => {
      activeFetch += 1;
      maxFetch = Math.max(maxFetch, activeFetch);
      await new Promise((resolve) => setTimeout(resolve, 2));
      activeFetch -= 1;
      return fakeResponse(new Uint8Array(32));
    },
    decodeImage: async () => {
      activeDecode += 1;
      maxDecode = Math.max(maxDecode, activeDecode);
      await new Promise((resolve) => setTimeout(resolve, 3));
      activeDecode -= 1;
      return seededRaster(5);
    },
    yieldControl: tinyYield
  });
  const result = await controller.start({ candidates: Array.from({ length: 24 }, (_, index) => ({ id: `conc-${index}`, imageUrl: `/image/${index}` })) });

  assert.ok(result.maxFetchConcurrency <= 4, `fetch concurrency ${result.maxFetchConcurrency} exceeded 4`);
  assert.ok(result.maxDecodeConcurrency <= 2, `decode concurrency ${result.maxDecodeConcurrency} exceeded 2`);
  assert.equal(result.maxFetchConcurrency, 4, 'the fetch pool should actually reach its bound');
  assert.equal(result.maxDecodeConcurrency, 2, 'the decode semaphore should actually reach its bound');
});

test('cancellation aborts outstanding work and suppresses stale publication', async () => {
  const controller = createVisualDuplicateController({
    fetchImage: async (_url, { signal }) => {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 30);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
      });
      return fakeResponse(new Uint8Array(16));
    },
    decodeImage: async () => seededRaster(6),
    yieldControl: tinyYield
  });

  const running = controller.start({ candidates: Array.from({ length: 8 }, (_, index) => ({ id: `cancel-${index}`, imageUrl: `/image/${index}` })) });
  await new Promise((resolve) => setTimeout(resolve, 5));
  controller.cancel();
  const cancelled = await running;
  assert.equal(cancelled.published, false);
  assert.equal(cancelled.stale, true);
  assert.deepEqual(cancelled.pairs, []);
  assert.equal(cancelled.aborted, true);

  // Restarting supersedes the previous run even when its own signal was not aborted first.
  const first = controller.start({ candidates: Array.from({ length: 8 }, (_, index) => ({ id: `first-${index}`, imageUrl: `/image/${index}` })) });
  const second = await controller.start({ candidates: Array.from({ length: 3 }, (_, index) => ({ id: `second-${index}`, imageUrl: `/image/${index}` })) });
  const firstResult = await first;
  assert.equal(firstResult.published, false);
  assert.equal(firstResult.stale, true);
  assert.equal(second.published, true);
  assert.deepEqual(second.fingerprints.size, 3);
});

test('cancelling during candidate listing aborts the fetch and never starts the scan', async () => {
  let fetchStarted = false;
  let fetchAborted = false;
  let scanFetches = 0;
  const phases = [];
  const controller = createVisualDuplicateController({
    fetchImage: async () => { scanFetches += 1; return fakeResponse(new Uint8Array(32)); },
    decodeImage: async () => seededRaster(20),
    onProgress: (next) => phases.push(next.phase),
    yieldControl: tinyYield
  });

  const running = controller.start({
    scope: 'topic',
    loadCandidates: (signal) => new Promise((_resolve, reject) => {
      fetchStarted = true;
      signal.addEventListener('abort', () => { fetchAborted = true; reject(new DOMException('aborted', 'AbortError')); }, { once: true });
    })
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(fetchStarted, true);

  controller.cancel();
  const result = await running;
  assert.equal(fetchAborted, true, 'cancel must abort the in-flight candidate listing');
  assert.equal(result.published, false);
  assert.equal(result.stale, true);
  assert.equal(result.aborted, true);
  assert.equal(scanFetches, 0, 'a cancelled candidate listing must never start the visual scan');
  assert.deepEqual(phases, ['listing']);
});

test('a candidate listing that resolves after cancellation cannot start or publish the scan', async () => {
  let resolveListing;
  let scanFetches = 0;
  const controller = createVisualDuplicateController({
    fetchImage: async () => { scanFetches += 1; return fakeResponse(new Uint8Array(32)); },
    decodeImage: async () => seededRaster(21),
    yieldControl: tinyYield
  });

  const running = controller.start({
    loadCandidates: () => new Promise((resolve) => { resolveListing = resolve; })
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  controller.cancel();
  // The request finishes anyway; the stale completion must not resurrect the search.
  resolveListing({ candidates: [{ id: 'late', imageUrl: '/image/late' }], totalCount: 1, truncated: false });
  const result = await running;

  assert.equal(result.published, false);
  assert.equal(result.stale, true);
  assert.equal(scanFetches, 0);
  assert.equal(result.candidatePayload, null);
});

test('a superseded search cannot overwrite a newer search progress or results', async () => {
  const events = [];
  let resolveFirst;
  const controller = createVisualDuplicateController({
    fetchImage: async () => fakeResponse(new Uint8Array(32)),
    decodeImage: async () => seededRaster(23),
    onProgress: (next) => events.push(next),
    yieldControl: tinyYield
  });

  const first = controller.start({
    scope: 'first',
    loadCandidates: () => new Promise((resolve) => { resolveFirst = resolve; })
  });
  await new Promise((resolve) => setTimeout(resolve, 5));

  const secondCandidates = Array.from({ length: 3 }, (_, index) => ({ id: `new-${index}`, imageUrl: `/image/${index}` }));
  const second = await controller.start({
    scope: 'second',
    loadCandidates: async () => ({ candidates: secondCandidates, totalCount: 3, truncated: false, scopeLabel: 'Second' })
  });
  resolveFirst({ candidates: [{ id: 'old-0', imageUrl: '/image/old-0' }], totalCount: 1, truncated: false, scopeLabel: 'First' });
  const firstResult = await first;

  assert.equal(firstResult.published, false);
  assert.equal(firstResult.stale, true);
  assert.equal(firstResult.candidatePayload, null);
  assert.equal(second.published, true);
  assert.equal(second.candidatePayload.scopeLabel, 'Second');
  assert.equal(second.fingerprintedCount, 3);
  assert.equal(events.filter((event) => event.total === 1).length, 0, 'superseded work must not publish its progress');
  assert.equal(events.filter((event) => event.phase === 'listing').length, 2);
  assert.ok(events.some((event) => event.phase === 'scan' && event.total === 3), 'the newer search must still publish its own progress');
});

test('the discovery controller takes the server-provided limits instead of client defaults', () => {
  const serverLimits = {
    maxScanAssets: 77,
    maxTotalFetchBytes: 33 * 1024 * 1024,
    maxSingleFetchBytes: MAX_IMAGE_BYTES,
    fetchConcurrency: 3,
    decodeConcurrency: 1
  };
  const controller = createAdminDiscoveryController({ limits: serverLimits }, () => {});
  assert.equal(controller.limits.maxScanAssets, 77);
  assert.equal(controller.limits.maxTotalFetchBytes, 33 * 1024 * 1024);
  assert.equal(controller.limits.maxSingleFetchBytes, MAX_IMAGE_BYTES);
  assert.equal(controller.limits.fetchConcurrency, 3);
  assert.equal(controller.limits.decodeConcurrency, 1);
  assert.equal(controller.limits.yieldEveryPairComparisons, DEFAULT_LIMITS.yieldEveryPairComparisons);
});

test('per-image fetch, decode, and hash failures are isolated and surfaced', async () => {
  const markers = { 'ok-1': 0, 'fetch-fail': 1, 'ok-2': 0, 'decode-fail': 2, 'hash-fail': 3 };
  const result = await runVisualDuplicateScan({
    candidates: [
      { id: 'ok-1', imageUrl: '/image/ok-1' },
      { id: 'fetch-fail', imageUrl: '/image/fetch-fail' },
      { id: 'ok-2', imageUrl: '/image/ok-2' },
      { id: 'decode-fail', imageUrl: '/image/decode-fail' },
      { id: 'hash-fail', imageUrl: '/image/hash-fail' }
    ],
    fetchImage: async (url) => {
      const id = url.split('/').pop();
      if (id === 'fetch-fail') throw new Error('network down');
      return fakeResponse(new Uint8Array([markers[id]]));
    },
    decodeImage: async (bytes) => {
      if (bytes[0] === 2) throw new Error('unsupported image');
      return { ...seededRaster(7), marker: bytes[0], close() {} };
    },
    hashRaster: (raster) => {
      if (raster.marker === 3) throw new Error('hash exploded');
      return hashWorkingRaster(raster);
    },
    yieldControl: tinyYield
  });

  assert.deepEqual(
    result.failures.map((failure) => `${failure.assetId}:${failure.stage}`).sort(),
    ['decode-fail:decode', 'fetch-fail:fetch', 'hash-fail:hash']
  );
  assert.equal(result.fingerprintedCount, 2, 'unaffected images are still fingerprinted');
  assert.deepEqual(result.fingerprints.size, 2);
  assert.equal(result.aborted, false);
  assert.equal(result.incomplete, true);
  assert.ok(result.incompleteReasons.includes('asset-failures'));

  const allDecodeFailures = await runVisualDuplicateScan({
    candidates: [{ id: 'bad-decode', imageUrl: '/image/bad-decode' }, { id: 'good', imageUrl: '/image/good' }],
    fetchImage: async () => fakeResponse(new Uint8Array(32)),
    decodeImage: async () => { throw new Error('unsupported image'); },
    yieldControl: tinyYield
  });
  assert.deepEqual(allDecodeFailures.failures.map((failure) => failure.stage), ['decode', 'decode']);
  assert.equal(allDecodeFailures.fingerprintedCount, 0);
  assert.equal(allDecodeFailures.incomplete, true);
});

test('runVisualDuplicateScan is read-only with respect to its inputs', async () => {
  const candidates = Array.from({ length: 5 }, (_, index) => ({ id: `ro-${index}`, imageUrl: `/image/${index}`, originalFilename: `file-${index}.png` }));
  const snapshot = JSON.parse(JSON.stringify(candidates));
  await runVisualDuplicateScan({
    candidates,
    fetchImage: async () => fakeResponse(new Uint8Array(32)),
    decodeImage: async () => seededRaster(9),
    yieldControl: tinyYield
  });
  assert.deepEqual(candidates, snapshot, 'discovery must not mutate candidate records');
});

test('the scan yields periodically so the Admin UI stays responsive', async () => {
  let yields = 0;
  const result = await runVisualDuplicateScan({
    candidates: Array.from({ length: 6 }, (_, index) => ({ id: `yield-${index}`, imageUrl: `/image/${index}` })),
    limits: { yieldEveryPairComparisons: 2 },
    fetchImage: async () => fakeResponse(new Uint8Array(32)),
    decodeImage: async () => seededRaster(10),
    yieldControl: async () => { yields += 1; }
  });
  assert.equal(result.comparisons, 15, 'six fingerprinted assets produce fifteen unordered pairs');
  assert.ok(yields >= 7, `expected at least one yield per asset plus every two comparisons, saw ${yields}`);
  assert.equal(result.yields, yields);
});

test('decoded working rasters are released promptly, including after a hash failure', async () => {
  const closed = [];
  const result = await runVisualDuplicateScan({
    candidates: Array.from({ length: 4 }, (_, index) => ({ id: `release-${index}`, imageUrl: `/image/${index}` })),
    fetchImage: async (url) => fakeResponse(new Uint8Array([Number(url.split('/').pop())])),
    decodeImage: async (bytes) => ({ ...seededRaster(14), close() { closed.push(`release-${bytes[0]}`); } }),
    yieldControl: tinyYield
  });
  assert.equal(result.fingerprintedCount, 4);
  assert.deepEqual(closed.sort(), ['release-0', 'release-1', 'release-2', 'release-3']);

  const failedClosed = [];
  const failed = await runVisualDuplicateScan({
    candidates: [{ id: 'release-fail', imageUrl: '/image/0' }],
    fetchImage: async () => fakeResponse(new Uint8Array(8)),
    decodeImage: async () => ({ ...seededRaster(15), close() { failedClosed.push('released'); } }),
    hashRaster: () => { throw new Error('hash exploded'); },
    yieldControl: tinyYield
  });
  assert.equal(failed.failures.length, 1);
  assert.equal(failedClosed.length, 1, 'a raster that fails hashing must still be released');
});

// ---------------------------------------------------------------------------
// Session-only Not-duplicate suppression
// ---------------------------------------------------------------------------

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    get size() { return map.size; }
  };
}

test('Not-duplicate suppression is session-only and resettable', () => {
  const storage = memoryStorage();
  const store = createVisualDuplicateDismissals(storage);
  assert.equal(store.has('b', 'a'), false);
  store.dismiss('b', 'a');
  assert.equal(store.has('b', 'a'), true);
  assert.equal(store.has('a', 'b'), true, 'the canonical pair key is order independent');
  assert.equal(store.list().length, 1);
  assert.equal(store.size, 1);

  // A second reader in the same tab session sees the decision.
  const reopened = createVisualDuplicateDismissals(storage);
  assert.equal(reopened.has('a', 'b'), true);

  // A different tab/device session (fresh storage) does not.
  assert.equal(createVisualDuplicateDismissals(memoryStorage()).has('a', 'b'), false);

  store.reset();
  assert.equal(store.has('a', 'b'), false);
  assert.equal(store.size, 0);

  storage.setItem('flashcards.admin.visual-duplicates.dismissed.v1', '{not json');
  assert.equal(createVisualDuplicateDismissals(storage).size, 0, 'malformed storage is tolerated');
  assert.equal(createVisualDuplicateDismissals(null).has('a', 'b'), false, 'SSR storage absence is tolerated');
});

// ---------------------------------------------------------------------------
// Server candidate membership: Topic, recursive System, explicit global
// ---------------------------------------------------------------------------

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  const d1 = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async all() { return { results: sqlite.prepare(sql).all(...params) }; },
            async raw() { return sqlite.prepare(sql).all(...params).map((row) => Object.values(row)); },
            async first() { return sqlite.prepare(sql).get(...params) ?? null; },
            async run() {
              const result = sqlite.prepare(sql).run(...params);
              return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
            }
          };
        }
      };
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
  };
  return { sqlite, d1, db: createDb(d1) };
}

function insertConcept(sqlite, { id, name = id, kind = 'topic', parentId = null, isActive = 1 }) {
  sqlite.prepare('INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, id, kind, parentId, isActive);
}

function insertAsset(sqlite, id, overrides = {}) {
  sqlite.prepare(`
    INSERT INTO assets (
      id, type, storage_key, mime_type, original_filename, alt_text,
      preview_session_id, superseded_by_asset_id, deduplicated_into_asset_id,
      is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    overrides.type ?? 'image',
    overrides.storageKey ?? `teaching-images/${id}.png`,
    overrides.mimeType ?? 'image/png',
    overrides.filename ?? `${id}.png`,
    overrides.altText ?? `${id} alt`,
    overrides.previewSessionId ?? null,
    overrides.supersededByAssetId ?? null,
    overrides.deduplicatedIntoAssetId ?? null,
    overrides.isActive ?? 1,
    1,
    1
  );
}

function insertCase(sqlite, { id, title = id, isActive = 1, previewSessionId = null }) {
  sqlite.prepare('INSERT INTO cases (id, title, question_selection_mode, preview_session_id, is_active) VALUES (?, ?, ?, ?, ?)').run(id, title, 'automatic', previewSessionId, isActive);
}

function insertPrimaryTopic(sqlite, caseId, conceptId) {
  sqlite.prepare("INSERT INTO case_concepts (case_id, concept_id, role) VALUES (?, ?, 'primary')").run(caseId, conceptId);
}

function insertFixed(sqlite, caseId, assetId, order = 0) {
  sqlite.prepare('INSERT INTO case_assets (case_id, asset_id, display_order) VALUES (?, ?, ?)').run(caseId, assetId, order);
}

function insertOptionGroup(sqlite, { groupId, caseId, assetId, order = 0, groupActive = 1, optionActive = 1, removed = 0 }) {
  sqlite.prepare('INSERT INTO stimulus_groups (id, case_id, name, display_order, is_active) VALUES (?, ?, ?, 0, ?)').run(groupId, caseId, groupId, groupActive);
  sqlite.prepare('INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, is_active, removed_from_case) VALUES (?, ?, ?, ?, ?, ?)').run(`${groupId}-option-${order}`, groupId, assetId, order, optionActive, removed);
}

/**
 * Systems are top-level by schema contract; Topics nest beneath them.
 * Root System → Topic A → Topic A Child (depth-2 inheritance).
 * Other System → Topic B. Topic Other is unparented.
 */
function scopedFixture() {
  const { sqlite, db, d1 } = fixture();
  insertConcept(sqlite, { id: 'system-root', name: 'Root System', kind: 'system' });
  insertConcept(sqlite, { id: 'system-other', name: 'Other System', kind: 'system' });
  insertConcept(sqlite, { id: 'topic-a', name: 'Topic A', kind: 'topic', parentId: 'system-root' });
  insertConcept(sqlite, { id: 'topic-a-child', name: 'Topic A Child', kind: 'topic', parentId: 'topic-a' });
  insertConcept(sqlite, { id: 'topic-b', name: 'Topic B', kind: 'topic', parentId: 'system-other' });
  insertConcept(sqlite, { id: 'topic-other', name: 'Topic Other', kind: 'topic' });

  sqlite.prepare("INSERT INTO preview_sessions (id, user_id, status, expires_at) VALUES ('preview-1', 'user-1', 'active', 99999999999999)").run();

  insertCase(sqlite, { id: 'case-a', title: 'Case A' });
  insertPrimaryTopic(sqlite, 'case-a', 'topic-a');
  insertCase(sqlite, { id: 'case-a-child', title: 'Case A Child' });
  insertPrimaryTopic(sqlite, 'case-a-child', 'topic-a-child');
  insertCase(sqlite, { id: 'case-b', title: 'Case B' });
  insertPrimaryTopic(sqlite, 'case-b', 'topic-b');
  insertCase(sqlite, { id: 'case-inactive', title: 'Inactive Case', isActive: 0 });
  insertPrimaryTopic(sqlite, 'case-inactive', 'topic-a');
  insertCase(sqlite, { id: 'case-preview', title: 'Preview Case', previewSessionId: 'preview-1' });
  insertPrimaryTopic(sqlite, 'case-preview', 'topic-a');
  insertCase(sqlite, { id: 'case-removed-option', title: 'Removed Option Case' });
  insertPrimaryTopic(sqlite, 'case-removed-option', 'topic-a');
  insertCase(sqlite, { id: 'case-inactive-option', title: 'Inactive Option Case' });
  insertPrimaryTopic(sqlite, 'case-inactive-option', 'topic-a');

  insertAsset(sqlite, 'asset-replacement');
  insertAsset(sqlite, 'asset-topic-a');
  insertAsset(sqlite, 'asset-topic-a-child');
  insertAsset(sqlite, 'asset-topic-b');
  insertAsset(sqlite, 'asset-topic-a-option');
  insertAsset(sqlite, 'asset-unused');
  insertAsset(sqlite, 'asset-inactive', { isActive: 0 });
  insertAsset(sqlite, 'asset-superseded', { isActive: 0, supersededByAssetId: 'asset-replacement' });
  insertAsset(sqlite, 'asset-tombstoned', { isActive: 0, deduplicatedIntoAssetId: 'asset-replacement' });
  insertAsset(sqlite, 'asset-preview-owned', { previewSessionId: 'preview-1' });
  insertAsset(sqlite, 'asset-removed-option');
  insertAsset(sqlite, 'asset-inactive-option');

  insertFixed(sqlite, 'case-a', 'asset-topic-a', 0);
  insertFixed(sqlite, 'case-a-child', 'asset-topic-a-child', 0);
  insertFixed(sqlite, 'case-b', 'asset-topic-b', 0);
  insertOptionGroup(sqlite, { groupId: 'group-a', caseId: 'case-a', assetId: 'asset-topic-a-option' });
  insertOptionGroup(sqlite, { groupId: 'group-removed', caseId: 'case-removed-option', assetId: 'asset-removed-option', removed: 1 });
  insertOptionGroup(sqlite, { groupId: 'group-inactive', caseId: 'case-inactive-option', assetId: 'asset-inactive-option', optionActive: 0 });

  // Inactive-Case and Preview-Case usages must not widen membership.
  insertFixed(sqlite, 'case-inactive', 'asset-unused', 0);
  insertFixed(sqlite, 'case-preview', 'asset-preview-owned', 0);

  return { sqlite, db, d1 };
}

test('Topic scope uses exactly the current canonical Primary Topic and current learner-relevant usage', async () => {
  const { db } = scopedFixture();
  const topicA = await listVisualDuplicateCandidates(db, { scope: 'topic', topicId: 'topic-a' });
  assert.deepEqual(topicA.candidates.map((candidate) => candidate.id).sort(), ['asset-topic-a', 'asset-topic-a-option']);
  assert.equal(topicA.scopeLabel, 'Topic A (Topic topic-a)');
  assert.equal(topicA.totalCount, 2);
  assert.equal(topicA.truncated, false);
  assert.ok(topicA.candidates.every((candidate) => candidate.imageUrl === `/api/assets/${candidate.id}/image`));

  const topicB = await listVisualDuplicateCandidates(db, { scope: 'topic', topicId: 'topic-b' });
  assert.deepEqual(topicB.candidates.map((candidate) => candidate.id), ['asset-topic-b']);

  const nestedTopic = await listVisualDuplicateCandidates(db, { scope: 'topic', topicId: 'topic-a-child' });
  assert.deepEqual(nestedTopic.candidates.map((candidate) => candidate.id), ['asset-topic-a-child'], 'Topic scope matches the exact Primary Topic, not its ancestors or children');

  const other = await listVisualDuplicateCandidates(db, { scope: 'topic', topicId: 'topic-other' });
  assert.deepEqual(other.candidates, []);

  assert.ok(!topicA.candidates.some((candidate) => ['asset-unused', 'asset-inactive', 'asset-superseded', 'asset-tombstoned', 'asset-preview-owned', 'asset-removed-option', 'asset-inactive-option', 'asset-topic-a-child'].includes(candidate.id)));
});

test('System scope is explicit and follows the full recursive ancestry chain', async () => {
  const { db } = scopedFixture();
  const root = await listVisualDuplicateCandidates(db, { scope: 'system', systemId: 'system-root' });
  assert.deepEqual(
    root.candidates.map((candidate) => candidate.id).sort(),
    ['asset-topic-a', 'asset-topic-a-child', 'asset-topic-a-option'],
    'Root System reaches a depth-2 descendant Topic and excludes the sibling System branch'
  );

  const otherSystem = await listVisualDuplicateCandidates(db, { scope: 'system', systemId: 'system-other' });
  assert.deepEqual(otherSystem.candidates.map((candidate) => candidate.id).sort(), ['asset-topic-b']);
  assert.match(root.scopeLabel, /Root System \(System system-root\)/);
});

test('global scope is explicit, includes unused active library Assets, and never widens automatically', async () => {
  const { db } = scopedFixture();
  const global = await listVisualDuplicateCandidates(db, { scope: 'global' });
  assert.deepEqual(
    global.candidates.map((candidate) => candidate.id).sort(),
    ['asset-inactive-option', 'asset-removed-option', 'asset-replacement', 'asset-topic-a', 'asset-topic-a-child', 'asset-topic-a-option', 'asset-topic-b', 'asset-unused'],
    'global includes unused active Production images but excludes inactive, superseded, tombstoned, and Preview-owned Assets'
  );
  assert.equal(global.scopeLabel, 'Global Production image library');

  // Topic scope must never silently widen to global.
  const topicA = await listVisualDuplicateCandidates(db, { scope: 'topic', topicId: 'topic-a' });
  assert.ok(!topicA.candidates.some((candidate) => candidate.id === 'asset-unused'));

  await assert.rejects(() => listVisualDuplicateCandidates(db, { scope: 'topic' }), AssetVisualDiscoveryInputError);
  await assert.rejects(() => listVisualDuplicateCandidates(db, { scope: 'system' }), AssetVisualDiscoveryInputError);
  await assert.rejects(() => listVisualDuplicateCandidates(db, { scope: 'everything' }), AssetVisualDiscoveryInputError);
  await assert.rejects(() => listVisualDuplicateCandidates(db, { scope: 'topic', topicId: 'system-root' }), AssetVisualDiscoveryInputError);
  await assert.rejects(() => listVisualDuplicateCandidates(db, { scope: 'system', systemId: 'topic-a' }), AssetVisualDiscoveryInputError);
});

test('candidate listing is bounded at 120 and labelled truncated instead of silently cut', async () => {
  const { sqlite, db } = fixture();
  for (let index = 0; index < VISUAL_DISCOVERY_MAX_ASSETS + 1; index += 1) insertAsset(sqlite, `bulk-${String(index).padStart(3, '0')}`);
  const global = await listVisualDuplicateCandidates(db, { scope: 'global' });
  assert.equal(global.totalCount, VISUAL_DISCOVERY_MAX_ASSETS + 1);
  assert.equal(global.candidates.length, VISUAL_DISCOVERY_MAX_ASSETS);
  assert.equal(global.truncated, true);
  assert.equal(global.maxAssets, VISUAL_DISCOVERY_MAX_ASSETS);
});

test('candidate listing is read-only and scope lists expose active taxonomy', async () => {
  const { sqlite, db } = scopedFixture();
  const before = {
    assets: sqlite.prepare('SELECT * FROM assets ORDER BY id').all(),
    caseAssets: sqlite.prepare('SELECT * FROM case_assets ORDER BY case_id, asset_id').all(),
    options: sqlite.prepare('SELECT * FROM stimulus_group_options ORDER BY id').all(),
    maxRowId: sqlite.prepare('SELECT count(*) AS count FROM assets').get().count
  };
  await listVisualDuplicateCandidates(db, { scope: 'topic', topicId: 'topic-a' });
  await listVisualDuplicateCandidates(db, { scope: 'system', systemId: 'system-root' });
  await listVisualDuplicateCandidates(db, { scope: 'global' });
  assert.deepEqual(sqlite.prepare('SELECT * FROM assets ORDER BY id').all(), before.assets, 'discovery must never mutate Assets');
  assert.deepEqual(sqlite.prepare('SELECT * FROM case_assets ORDER BY case_id, asset_id').all(), before.caseAssets);
  assert.deepEqual(sqlite.prepare('SELECT * FROM stimulus_group_options ORDER BY id').all(), before.options);

  const scopes = await listVisualDuplicateScopes(db);
  assert.deepEqual(scopes.topics.map((topic) => topic.id), ['topic-a', 'topic-a-child', 'topic-b', 'topic-other']);
  assert.deepEqual(scopes.systems.map((system) => system.id), ['system-other', 'system-root']);
});

// ---------------------------------------------------------------------------
// Integration with the existing Tranche-1 certification flow
// ---------------------------------------------------------------------------

test('discovery proposes pairs that enter the existing Tranche-1 compare route', async () => {
  assert.equal(buildCompareHref('asset-b', 'asset-a'), '/admin/images/deduplicate?survivor=asset-b&duplicate=asset-a');
  assert.equal(buildCompareHref('a b', 'c/d'), '/admin/images/deduplicate?survivor=a%20b&duplicate=c%2Fd');

  // A full scan produces ordered proposals only; there is no merge call anywhere.
  const result = await runVisualDuplicateScan({
    candidates: [
      { id: 'asset-b', imageUrl: '/image/b' },
      { id: 'asset-a', imageUrl: '/image/a' },
      { id: 'asset-c', imageUrl: '/image/c' }
    ],
    fetchImage: async () => fakeResponse(new Uint8Array(32)),
    decodeImage: async (bytes) => seededRaster(11),
    yieldControl: tinyYield
  });
  assert.ok(result.pairs.length >= 1);
  for (const pair of result.pairs) {
    assert.ok(['likely', 'possible'].includes(pair.classification));
    assert.ok(pair.assetIdA < pair.assetIdB, 'pairs expose a canonical ascending Asset-ID order');
    assert.ok(buildCompareHref(pair.assetIdA, pair.assetIdB).startsWith('/admin/images/deduplicate?'));
  }
});

test('candidate endpoint returns JSON for authorized admins, refuses others, and stays read-only', async () => {
  const { sqlite, d1 } = scopedFixture();
  const platform = { env: { DB: d1 } };
  const route = await import('../src/routes/admin/images/duplicates/candidates/+server.js');
  const pageModule = await import('../src/routes/admin/images/duplicates/+page.server.js');
  const assetCountBefore = sqlite.prepare('SELECT count(*) AS count FROM assets').get().count;

  const forbidden = await route.GET({ locals: { user: null }, platform, url: new URL('http://localhost/admin/images/duplicates/candidates?scope=global') });
  assert.equal(forbidden.status, 403);
  assert.match((await forbidden.json()).error, /Administrator/);

  const noDatabase = await route.GET({ locals: { user: { role: 'admin' } }, platform: { env: {} }, url: new URL('http://localhost/x?scope=global') });
  assert.equal(noDatabase.status, 503);

  const invalid = await route.GET({ locals: { user: { role: 'admin' } }, platform, url: new URL('http://localhost/x?scope=topic') });
  assert.equal(invalid.status, 400);

  const response = await route.GET({ locals: { user: { role: 'admin' } }, platform, url: new URL('http://localhost/x?scope=global') });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.scope, 'global');
  assert.equal(body.maxAssets, VISUAL_DISCOVERY_MAX_ASSETS);
  assert.ok(body.candidates.length > 0);
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const pageData = await pageModule.load({ locals: { user: { role: 'admin' } }, platform });
  assert.equal(pageData.discoveryEnabled, true);
  assert.ok(pageData.scopes.topics.length >= 3);
  assert.equal(pageData.limits.maxScanAssets, VISUAL_DISCOVERY_MAX_ASSETS);
  assert.equal(pageData.limits.maxTotalFetchBytes, 96 * 1024 * 1024);
  assert.equal(pageData.limits.maxSingleFetchBytes, MAX_IMAGE_BYTES);
  assert.equal(pageData.limits.fetchConcurrency, 4);
  assert.equal(pageData.limits.decodeConcurrency, 2);

  const pageForbidden = await pageModule.load({ locals: { user: null }, platform });
  assert.equal(pageForbidden.discoveryEnabled, false);

  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM assets').get().count, assetCountBefore, 'the endpoint must not write');
});
