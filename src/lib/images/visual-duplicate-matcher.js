// Dependency-free deterministic visual-duplicate matcher.
//
// This module is intentionally free of browser, Node, or server imports so it can
// run unchanged in the Admin browser bundle and in Node-based executable tests.
// It never mutates an Asset, never performs I/O, and never persists fingerprints.
// See docs/ADMIN_IMAGE_DEDUPLICATION_PLAN.md sections 21-23 for the authority.

/** Longest working-raster side, in pixels. */
export const MAX_WORKING_DIMENSION = 768;
/** Maximum working-raster pixel count. */
export const MAX_WORKING_PIXELS = 768 * 768;
/** Each selected region is resampled to 9x8 before hashing. */
export const REGION_SAMPLE_WIDTH = 9;
export const REGION_SAMPLE_HEIGHT = 8;
/** 9x8 samples produce 8 horizontal comparisons per row over 8 rows = 64 bits. */
export const HASH_BITS = 64;
/** Exactly 38 deterministic region hashes are produced per image. */
export const REGION_COUNT = 38;
/** Distances at or below this count toward the support metric. */
export const SUPPORT_DISTANCE = 8;
/** "Likely duplicate" thresholds. */
export const LIKELY_MAX_BEST_DISTANCE = 6;
export const LIKELY_MIN_SUPPORT = 3;
export const LIKELY_MAX_TOP3_DISTANCE_SUM = 24;
/** "Possible duplicate" thresholds (used only when the pair is not Likely). */
export const POSSIBLE_MAX_BEST_DISTANCE = 10;
export const POSSIBLE_MIN_SUPPORT = 2;
export const POSSIBLE_MAX_TOP3_DISTANCE_SUM = 36;

/**
 * Normalized (widthFraction, heightFraction) region shapes from the plan.
 * @type {ReadonlyArray<readonly [number, number]>}
 */
export const REGION_SHAPES = Object.freeze([
  [1.0, 1.0],
  [0.8, 0.8],
  [0.6, 0.6],
  [0.4, 0.4],
  [0.8, 1.0],
  [0.6, 1.0],
  [1.0, 0.8],
  [1.0, 0.6],
  [0.8, 0.6],
  [0.6, 0.8]
]);

/**
 * @typedef {{ widthFraction: number, heightFraction: number, x: number, y: number, label: string }} RegionRect
 */

/** @type {ReadonlyArray<readonly [string, number, number]>} */
const BOTH_CROPPED_ORIGINS = Object.freeze([
  ['top-left', 0, 0],
  ['top-right', 1, 0],
  ['bottom-left', 0, 1],
  ['bottom-right', 1, 1],
  ['centre', 0.5, 0.5]
]);
/** @type {ReadonlyArray<readonly [string, number]>} */
const WIDTH_ONLY_ORIGINS = Object.freeze([
  ['left', 0],
  ['centre', 0.5],
  ['right', 1]
]);
/** @type {ReadonlyArray<readonly [string, number]>} */
const HEIGHT_ONLY_ORIGINS = Object.freeze([
  ['top', 0],
  ['centre', 0.5],
  ['bottom', 1]
]);

/** @param {number} widthFraction @param {number} heightFraction @param {number} x @param {number} y @param {string} originLabel */
function region(widthFraction, heightFraction, x, y, originLabel) {
  return Object.freeze({
    widthFraction,
    heightFraction,
    x,
    y,
    label: `${widthFraction.toFixed(1)}x${heightFraction.toFixed(1)}@${originLabel}`
  });
}

/**
 * Builds the exact deterministic 38-region layout. The order is stable and is
 * also the row-major order used when comparing two fingerprints.
 * @returns {RegionRect[]}
 */
export function regionRects() {
  /** @type {RegionRect[]} */
  const rects = [region(1.0, 1.0, 0, 0, 'full')];

  const bothCropped = REGION_SHAPES.filter(([w, h]) => w < 1 && h < 1);
  for (const [w, h] of bothCropped) {
    for (const [originLabel, ax, ay] of BOTH_CROPPED_ORIGINS) {
      rects.push(region(w, h, (1 - w) * ax, (1 - h) * ay, originLabel));
    }
  }

  const widthOnly = REGION_SHAPES.filter(([w, h]) => w < 1 && h === 1);
  for (const [w, h] of widthOnly) {
    for (const [originLabel, ax] of WIDTH_ONLY_ORIGINS) {
      rects.push(region(w, h, (1 - w) * ax, 0, originLabel));
    }
  }

  const heightOnly = REGION_SHAPES.filter(([w, h]) => w === 1 && h < 1);
  for (const [w, h] of heightOnly) {
    for (const [originLabel, ay] of HEIGHT_ONLY_ORIGINS) {
      rects.push(region(w, h, 0, (1 - h) * ay, originLabel));
    }
  }

  return rects;
}

/**
 * Bounded working-raster size that preserves aspect ratio: longest side <= 768
 * and total pixels <= 768^2.
 * @param {number} width
 * @param {number} height
 * @returns {{ width: number, height: number, scale: number }}
 */
export function workingRasterSize(width, height) {
  const sourceWidth = Math.max(1, Math.floor(Number(width) || 0) || 1);
  const sourceHeight = Math.max(1, Math.floor(Number(height) || 0) || 1);
  const scale = Math.min(1, MAX_WORKING_DIMENSION / sourceWidth, MAX_WORKING_DIMENSION / sourceHeight, Math.sqrt(MAX_WORKING_PIXELS / (sourceWidth * sourceHeight)));
  let targetWidth = Math.max(1, Math.floor(sourceWidth * scale));
  let targetHeight = Math.max(1, Math.floor(sourceHeight * scale));
  while (targetWidth * targetHeight > MAX_WORKING_PIXELS) {
    if (targetWidth >= targetHeight && targetWidth > 1) targetWidth -= 1;
    else if (targetHeight > 1) targetHeight -= 1;
    else break;
  }
  return { width: targetWidth, height: targetHeight, scale };
}

/**
 * Deterministic alpha compositing against opaque white followed by luminance
 * grayscale. Formula from the plan:
 *   Cwhite = round((C * a + 255 * (255 - a)) / 255)
 *   gray   = round(0.299*R + 0.587*G + 0.114*B)
 * @param {number} r @param {number} g @param {number} b @param {number} a
 * @returns {{ r: number, g: number, b: number, gray: number }}
 */
export function compositeGray(r, g, b, a) {
  const alpha = clampByte(a);
  const red = compositeChannel(clampByte(r), alpha);
  const green = compositeChannel(clampByte(g), alpha);
  const blue = compositeChannel(clampByte(b), alpha);
  return { r: red, g: green, b: blue, gray: Math.round(0.299 * red + 0.587 * green + 0.114 * blue) };
}

/** @param {number} channel @param {number} alpha */
function compositeChannel(channel, alpha) {
  return Math.round((channel * alpha + 255 * (255 - alpha)) / 255);
}

/** @param {number} value */
function clampByte(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return 0;
  return Math.min(255, Math.max(0, number));
}

/**
 * Resamples one normalized region of an RGBA raster directly to 9x8, composites
 * alpha against white, and converts to grayscale bytes.
 * @param {ArrayLike<number>} data @param {number} width @param {number} height @param {RegionRect} rect
 * @returns {number[]} 72 grayscale values in row-major 9x8 order
 */
function regionGray9x8(data, width, height, rect) {
  const sourceX = rect.x * width;
  const sourceY = rect.y * height;
  const sourceWidth = rect.widthFraction * width;
  const sourceHeight = rect.heightFraction * height;
  /** @type {number[]} */
  const gray = new Array(REGION_SAMPLE_WIDTH * REGION_SAMPLE_HEIGHT);

  for (let oy = 0; oy < REGION_SAMPLE_HEIGHT; oy += 1) {
    const top = sourceY + (oy * sourceHeight) / REGION_SAMPLE_HEIGHT;
    const bottom = sourceY + ((oy + 1) * sourceHeight) / REGION_SAMPLE_HEIGHT;
    for (let ox = 0; ox < REGION_SAMPLE_WIDTH; ox += 1) {
      const left = sourceX + (ox * sourceWidth) / REGION_SAMPLE_WIDTH;
      const right = sourceX + ((ox + 1) * sourceWidth) / REGION_SAMPLE_WIDTH;
      let weightTotal = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      const yStart = Math.max(0, Math.floor(top));
      const yEnd = Math.min(height - 1, Math.ceil(bottom) - 1);
      const xStart = Math.max(0, Math.floor(left));
      const xEnd = Math.min(width - 1, Math.ceil(right) - 1);
      for (let py = yStart; py <= yEnd; py += 1) {
        const wy = Math.min(bottom, py + 1) - Math.max(top, py);
        if (wy <= 0) continue;
        for (let px = xStart; px <= xEnd; px += 1) {
          const wx = Math.min(right, px + 1) - Math.max(left, px);
          if (wx <= 0) continue;
          const weight = wx * wy;
          const offset = (py * width + px) * 4;
          weightTotal += weight;
          r += data[offset] * weight;
          g += data[offset + 1] * weight;
          b += data[offset + 2] * weight;
          a += data[offset + 3] * weight;
        }
      }
      if (weightTotal <= 0) {
        const px = Math.min(width - 1, Math.max(0, Math.floor((left + right) / 2)));
        const py = Math.min(height - 1, Math.max(0, Math.floor((top + bottom) / 2)));
        const offset = (py * width + px) * 4;
        gray[oy * REGION_SAMPLE_WIDTH + ox] = compositeGray(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]).gray;
        continue;
      }
      gray[oy * REGION_SAMPLE_WIDTH + ox] = compositeGray(r / weightTotal, g / weightTotal, b / weightTotal, a / weightTotal).gray;
    }
  }

  return gray;
}

/**
 * Row-major 64-bit dHash of 9x8 grayscale samples: bit = 1 when left > right.
 * The most significant bit is the first (top-left) comparison.
 * @param {number[]} gray
 * @returns {bigint}
 */
export function differenceHash64(gray) {
  let hash = 0n;
  let bit = HASH_BITS - 1;
  for (let row = 0; row < REGION_SAMPLE_HEIGHT; row += 1) {
    for (let column = 0; column < REGION_SAMPLE_WIDTH - 1; column += 1) {
      const left = gray[row * REGION_SAMPLE_WIDTH + column];
      const right = gray[row * REGION_SAMPLE_WIDTH + column + 1];
      if (left > right) hash |= 1n << BigInt(bit);
      bit -= 1;
    }
  }
  return hash;
}

/**
 * Computes exactly 38 deterministic region hashes for a working RGBA raster.
 * @param {{ data: ArrayLike<number>, width: number, height: number }} raster
 * @returns {bigint[]}
 */
export function hashWorkingRaster({ data, width, height }) {
  const rasterWidth = Math.floor(Number(width));
  const rasterHeight = Math.floor(Number(height));
  if (!Number.isFinite(rasterWidth) || !Number.isFinite(rasterHeight) || rasterWidth <= 0 || rasterHeight <= 0) {
    throw new TypeError('A working raster requires positive integer dimensions.');
  }
  if (!data || data.length < rasterWidth * rasterHeight * 4) {
    throw new TypeError('The working raster RGBA buffer is smaller than its declared dimensions.');
  }
  return regionRects().map((rect) => differenceHash64(regionGray9x8(data, rasterWidth, rasterHeight, rect)));
}

/**
 * Exact 64-bit Hamming distance using BigInt values (never Number hash storage),
 * so results stay exact above 2^53.
 * @param {bigint} a @param {bigint} b
 * @returns {number}
 */
export function hammingDistance(a, b) {
  if (typeof a !== 'bigint' || typeof b !== 'bigint') throw new TypeError('Region hashes must be 64-bit BigInt values.');
  return popcount64(a ^ b);
}

/** 16-bit popcount lookup table for exact, allocation-free Hamming distances. */
const POPCOUNT_TABLE = (() => {
  const table = new Uint8Array(65536);
  for (let index = 1; index < 65536; index += 1) table[index] = table[index >> 1] + (index & 1);
  return table;
})();

/** @param {bigint} value */
export function popcount64(value) {
  const magnitude = value < 0n ? -value : value;
  const low = Number(magnitude & 0xffffffffn);
  const high = Number(magnitude >> 32n);
  return (
    POPCOUNT_TABLE[low & 0xffff]
    + POPCOUNT_TABLE[(low >>> 16) & 0xffff]
    + POPCOUNT_TABLE[high & 0xffff]
    + POPCOUNT_TABLE[(high >>> 16) & 0xffff]
  );
}

/**
 * Cached 16-bit lane views of a fingerprint array. Fingerprints are produced once
 * and reused for many pair comparisons, so converting each hash once keeps the
 * worst-case 120-Asset scan responsive without changing the BigInt representation.
 * @type {WeakMap<bigint[], Uint16Array>}
 */
const laneCache = new WeakMap();

/** @param {bigint[]} hashes */
function lanesOf(hashes) {
  const cached = laneCache.get(hashes);
  if (cached) return cached;
  const lanes = new Uint16Array(hashes.length * 4);
  for (let index = 0; index < hashes.length; index += 1) {
    const hash = hashes[index];
    if (typeof hash !== 'bigint') throw new TypeError('Region hashes must be 64-bit BigInt values.');
    const magnitude = hash < 0n ? -hash : hash;
    const low = Number(magnitude & 0xffffffffn);
    const high = Number(magnitude >> 32n);
    lanes[index * 4] = low & 0xffff;
    lanes[index * 4 + 1] = (low >>> 16) & 0xffff;
    lanes[index * 4 + 2] = high & 0xffff;
    lanes[index * 4 + 3] = (high >>> 16) & 0xffff;
  }
  laneCache.set(hashes, lanes);
  return lanes;
}

/** @param {Uint16Array} lanesA @param {number} indexA @param {Uint16Array} lanesB @param {number} indexB */
function laneDistance(lanesA, indexA, lanesB, indexB) {
  const a = indexA * 4;
  const b = indexB * 4;
  return (
    POPCOUNT_TABLE[lanesA[a] ^ lanesB[b]]
    + POPCOUNT_TABLE[lanesA[a + 1] ^ lanesB[b + 1]]
    + POPCOUNT_TABLE[lanesA[a + 2] ^ lanesB[b + 2]]
    + POPCOUNT_TABLE[lanesA[a + 3] ^ lanesB[b + 3]]
  );
}

/**
 * For each hash in `from`, the smallest Hamming distance to any hash in `to`.
 * @param {bigint[]} from @param {bigint[]} to
 * @returns {number[]}
 */
export function nearestDistances(from, to) {
  const lanesFrom = lanesOf(from);
  const lanesTo = lanesOf(to);
  const distances = new Array(from.length);
  for (let index = 0; index < from.length; index += 1) {
    let best = HASH_BITS;
    for (let other = 0; other < to.length; other += 1) best = Math.min(best, laneDistance(lanesFrom, index, lanesTo, other));
    distances[index] = best;
  }
  return distances;
}

/**
 * @typedef {{ bestDistance: number, support: number, supportA: number, supportB: number, top3DistanceSum: number, classification: 'likely' | 'possible' | null }} PairMetrics
 */

/**
 * Deterministic classification from the two nearest-distance profiles.
 * @param {number[]} nearestA @param {number[]} nearestB
 * @returns {PairMetrics}
 */
export function derivePairMetrics(nearestA, nearestB) {
  const combined = [...nearestA, ...nearestB];
  let bestDistance = HASH_BITS;
  for (const distance of combined) bestDistance = Math.min(bestDistance, distance);
  const supportA = nearestA.filter((distance) => distance <= SUPPORT_DISTANCE).length;
  const supportB = nearestB.filter((distance) => distance <= SUPPORT_DISTANCE).length;
  const support = Math.min(supportA, supportB);
  const top3DistanceSum = [...combined].sort((left, right) => left - right).slice(0, 3).reduce((sum, distance) => sum + distance, 0);
  return { bestDistance, support, supportA, supportB, top3DistanceSum, classification: classifyPair(bestDistance, support, top3DistanceSum) };
}

/** @param {number} bestDistance @param {number} support @param {number} top3DistanceSum */
export function classifyPair(bestDistance, support, top3DistanceSum) {
  if (bestDistance <= LIKELY_MAX_BEST_DISTANCE && support >= LIKELY_MIN_SUPPORT && top3DistanceSum <= LIKELY_MAX_TOP3_DISTANCE_SUM) return 'likely';
  if (bestDistance <= POSSIBLE_MAX_BEST_DISTANCE && support >= POSSIBLE_MIN_SUPPORT && top3DistanceSum <= POSSIBLE_MAX_TOP3_DISTANCE_SUM) return 'possible';
  return null;
}

/**
 * Compares two 38-hash fingerprints.
 * @param {bigint[]} hashesA @param {bigint[]} hashesB
 * @returns {PairMetrics}
 */
export function compareFingerprints(hashesA, hashesB) {
  if (!Array.isArray(hashesA) || !Array.isArray(hashesB) || hashesA.length !== REGION_COUNT || hashesB.length !== REGION_COUNT) {
    throw new TypeError(`Visual fingerprints must contain exactly ${REGION_COUNT} region hashes.`);
  }
  return derivePairMetrics(nearestDistances(hashesA, hashesB), nearestDistances(hashesB, hashesA));
}

/** @param {string} a @param {string} b */
export function compareAssetIds(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Canonical, locale-independent pair key with the smaller Asset ID first.
 * @param {string} assetIdA @param {string} assetIdB
 */
export function canonicalPairKey(assetIdA, assetIdB) {
  return compareAssetIds(assetIdA, assetIdB) <= 0 ? `${assetIdA}\u0000${assetIdB}` : `${assetIdB}\u0000${assetIdA}`;
}

/** @param {string} assetIdA @param {string} assetIdB @param {string} otherA @param {string} otherB */
function compareCanonicalPairs(assetIdA, assetIdB, otherA, otherB) {
  const [minA, maxA] = compareAssetIds(assetIdA, assetIdB) <= 0 ? [assetIdA, assetIdB] : [assetIdB, assetIdA];
  const [minB, maxB] = compareAssetIds(otherA, otherB) <= 0 ? [otherA, otherB] : [otherB, otherA];
  return compareAssetIds(minA, minB) || compareAssetIds(maxA, maxB);
}

const CLASSIFICATION_RANK = { likely: 0, possible: 1 };

/**
 * Stable ranking: Likely before Possible, then bestDistance asc, top3DistanceSum
 * asc, support desc, and canonical sorted Asset-ID pair asc.
 * @template {{ assetIdA: string, assetIdB: string, classification: 'likely' | 'possible', bestDistance: number, top3DistanceSum: number, support: number }} T
 * @param {T[]} pairs
 * @returns {T[]}
 */
export function rankDiscoveredPairs(pairs) {
  return [...pairs].sort((left, right) =>
    (CLASSIFICATION_RANK[left.classification] ?? 2) - (CLASSIFICATION_RANK[right.classification] ?? 2)
    || left.bestDistance - right.bestDistance
    || left.top3DistanceSum - right.top3DistanceSum
    || right.support - left.support
    || compareCanonicalPairs(left.assetIdA, left.assetIdB, right.assetIdA, right.assetIdB)
  );
}
