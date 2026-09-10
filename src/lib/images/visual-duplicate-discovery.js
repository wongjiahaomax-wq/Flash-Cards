// Bounded, cancellable, read-only visual duplicate discovery controller.
//
// The controller coordinates candidate fetching, bounded working-raster decoding,
// deterministic hashing, and pairwise scoring. It performs no mutation, holds only
// compact fingerprints after hashing, and releases decoded rasters promptly.
// Adapters (fetch/decode/hash/yield) are injected so the same code runs in the
// Admin browser bundle and in Node-based executable tests.

import { compareFingerprints, hashWorkingRaster, rankDiscoveredPairs, workingRasterSize } from './visual-duplicate-matcher.js';

/** @typedef {{ id: string, imageUrl: string, originalFilename?: string | null, altText?: string | null, mimeType?: string | null }} DiscoveryCandidate */
/** @typedef {{ assetId: string, stage: 'fetch' | 'decode' | 'hash', message: string }} DiscoveryFailure */

export const MAX_SCAN_ASSETS = 120;
export const MAX_TOTAL_FETCH_BYTES = 96 * 1024 * 1024;
export const FETCH_CONCURRENCY = 4;
export const DECODE_CONCURRENCY = 2;
export const YIELD_EVERY_PAIR_COMPARISONS = 100;

export const DEFAULT_LIMITS = Object.freeze({
  maxScanAssets: MAX_SCAN_ASSETS,
  maxTotalFetchBytes: MAX_TOTAL_FETCH_BYTES,
  maxSingleFetchBytes: 5 * 1024 * 1024,
  fetchConcurrency: FETCH_CONCURRENCY,
  decodeConcurrency: DECODE_CONCURRENCY,
  yieldEveryPairComparisons: YIELD_EVERY_PAIR_COMPARISONS,
  maxWorkingDimension: 768,
  maxWorkingPixels: 768 * 768
});

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? 'Unknown error');
}

/**
 * Reads a fetch response into memory without ever exceeding the remaining byte
 * budget. Trusted Content-Length is honoured before any body bytes are read, and
 * streamed bodies are abandoned mid-read when they would cross the budget.
 * @param {any} response @param {number} remaining
 * @returns {Promise<{ bytes?: Uint8Array, trustedLength: number | null, budgetStop?: boolean }>}
 */
export async function readBoundedBytes(response, remaining) {
  const headerValue = response?.headers?.get?.('content-length');
  const trustedLength = headerValue === null || headerValue === undefined || headerValue === '' ? null : Number(headerValue);
  const trusted = trustedLength !== null && Number.isFinite(trustedLength) && trustedLength >= 0 ? trustedLength : null;
  if (trusted !== null && trusted > remaining) return { trustedLength: trusted, budgetStop: true };

  const body = response?.body;
  if (!body || typeof body.getReader !== 'function') {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > remaining) return { trustedLength: trusted, budgetStop: true };
    return { bytes: buffer, trustedLength: trusted };
  }

  const reader = body.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      if (size + chunk.byteLength > remaining) {
        await reader.cancel();
        return { trustedLength: trusted, budgetStop: true };
      }
      chunks.push(chunk);
      size += chunk.byteLength;
    }
  } finally {
    if (typeof reader.releaseLock === 'function') reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, trustedLength: trusted };
}

/** @param {any} response */
export function responseContentType(response) {
  return response?.headers?.get?.('content-type') ?? null;
}

/** @param {any} raster */
function releaseRaster(raster) {
  if (!raster) return;
  if (typeof raster.close === 'function') {
    try { raster.close(); } catch { /* release is best-effort */ }
  } else if (raster.data && typeof raster.data.fill === 'function') {
    raster.data.fill(0);
  }
}

/** @param {number} size */
function createSemaphore(size) {
  let available = Math.max(1, size);
  /** @type {Array<(value?: any) => void>} */
  const waiters = [];
  return {
    async acquire() {
      if (available > 0) {
        available -= 1;
        return;
      }
      await new Promise((resolve) => { waiters.push(resolve); });
      available -= 1;
    },
    release() {
      available += 1;
      const next = waiters.shift();
      if (next) next();
    }
  };
}

function defaultYieldControl() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * @typedef {object} ScanOptions
 * @property {DiscoveryCandidate[]} candidates
 * @property {(url: string, options: { signal: AbortSignal }) => Promise<any>} fetchImage
 * @property {(bytes: Uint8Array, contentType: string | null, options: { signal: AbortSignal }) => Promise<any>} decodeImage
 * @property {Partial<typeof DEFAULT_LIMITS>} [limits]
 * @property {any} [scope]
 * @property {AbortSignal} [signal]
 * @property {(progress: any) => void} [onProgress]
 * @property {() => Promise<void>} [yieldControl]
 * @property {(raster: any) => bigint[]} [hashRaster]
 */

/**
 * Runs one bounded discovery scan. Read-only and mutation-free by construction:
 * the only side effects are network reads, decode work, and progress callbacks.
 * @param {ScanOptions} options
 */
export async function runVisualDuplicateScan(options) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits ?? {}) };
  const signal = options.signal ?? new AbortController().signal;
  const onProgress = options.onProgress ?? (() => {});
  const yieldControl = options.yieldControl ?? defaultYieldControl;
  const hashRaster = options.hashRaster ?? hashWorkingRaster;
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  const scanCandidates = candidates.slice(0, Math.max(0, limits.maxScanAssets));
  const truncated = candidates.length > limits.maxScanAssets;

  /** @type {Map<string, bigint[]>} */
  const fingerprints = new Map();
  /** @type {DiscoveryFailure[]} */
  const failures = [];
  let totalBytes = 0;
  let reservedBytes = 0;
  let budgetExceeded = false;
  let aborted = false;
  let processed = 0;
  let activeFetches = 0;
  let activeDecodes = 0;
  let maxFetchConcurrency = 0;
  let maxDecodeConcurrency = 0;
  let comparisons = 0;
  let yields = 0;

  const decodeSemaphore = createSemaphore(limits.decodeConcurrency);

  /** @param {DiscoveryCandidate} candidate @param {'fetch' | 'decode' | 'hash'} stage @param {unknown} error */
  function recordFailure(candidate, stage, error) {
    failures.push({ assetId: candidate.id, stage, message: errorMessage(error) });
  }

  /** @param {DiscoveryCandidate} candidate */
  async function processCandidate(candidate) {
    if (signal.aborted) {
      aborted = true;
      return;
    }
    if (budgetExceeded) return;

    let response;
    activeFetches += 1;
    maxFetchConcurrency = Math.max(maxFetchConcurrency, activeFetches);
    try {
      response = await options.fetchImage(candidate.imageUrl, { signal });
    } catch (error) {
      recordFailure(candidate, 'fetch', error);
      return;
    } finally {
      activeFetches -= 1;
    }

    if (signal.aborted) {
      aborted = true;
      return;
    }
    if (!response || response.ok === false) {
      recordFailure(candidate, 'fetch', `Image request failed with status ${response?.status ?? 'unknown'}.`);
      return;
    }

    const declaredLength = response?.headers?.get?.('content-length');
    const trustedLength = declaredLength === null || declaredLength === undefined || declaredLength === '' ? null : Number(declaredLength);
    if (trustedLength !== null && Number.isFinite(trustedLength) && trustedLength > limits.maxSingleFetchBytes) {
      recordFailure(candidate, 'fetch', 'Image exceeds the validated teaching-image maximum size.');
      return;
    }

    // Reserve budget bytes synchronously before any await so concurrent workers
    // can never collectively read past the total fetch budget.
    const available = limits.maxTotalFetchBytes - totalBytes - reservedBytes;
    let reservation;
    if (trustedLength !== null && Number.isFinite(trustedLength)) {
      if (trustedLength > available) {
        budgetExceeded = true;
        return;
      }
      reservation = trustedLength;
    } else {
      if (available <= 0) {
        budgetExceeded = true;
        return;
      }
      reservation = Math.min(available, limits.maxSingleFetchBytes);
    }
    reservedBytes += reservation;

    let read;
    try {
      read = await readBoundedBytes(response, reservation);
      if (read.budgetStop) {
        budgetExceeded = true;
        return;
      }
      const bytes = read.bytes ?? new Uint8Array(0);
      if (bytes.byteLength > limits.maxSingleFetchBytes) {
        recordFailure(candidate, 'fetch', 'Image exceeds the validated teaching-image maximum size.');
        return;
      }
      totalBytes += bytes.byteLength;
      await decodeCandidate(candidate, bytes, response);
    } catch (error) {
      recordFailure(candidate, 'fetch', error);
    } finally {
      reservedBytes -= reservation;
    }
  }

  /**
   * Decodes and hashes one image while holding a decode/processing slot, so at
   * most two working rasters exist at once and each is released immediately.
   * @param {DiscoveryCandidate} candidate @param {Uint8Array} bytes @param {any} response
   */
  async function decodeCandidate(candidate, bytes, response) {
    await decodeSemaphore.acquire();
    activeDecodes += 1;
    maxDecodeConcurrency = Math.max(maxDecodeConcurrency, activeDecodes);
    let raster = null;
    try {
      if (signal.aborted) {
        aborted = true;
        return;
      }
      try {
        raster = await options.decodeImage(bytes, responseContentType(response), { signal });
      } catch (error) {
        recordFailure(candidate, 'decode', error);
        return;
      }
      if (signal.aborted) {
        aborted = true;
        return;
      }
      try {
        fingerprints.set(candidate.id, hashRaster(raster));
      } catch (error) {
        recordFailure(candidate, 'hash', error);
      }
    } finally {
      releaseRaster(raster);
      activeDecodes -= 1;
      decodeSemaphore.release();
    }
  }

  const workerCount = Math.max(1, Math.min(limits.fetchConcurrency, scanCandidates.length || 1));
  let cursor = 0;

  async function worker() {
    for (;;) {
      if (signal.aborted) {
        aborted = true;
        return;
      }
      if (budgetExceeded) return;
      const index = cursor;
      cursor += 1;
      if (index >= scanCandidates.length) return;
      await processCandidate(scanCandidates[index]);
      processed += 1;
      if (options.onProgress) {
        onProgress({
          phase: 'scan',
          processed,
          total: scanCandidates.length,
          fingerprinted: fingerprints.size,
          failures: failures.length,
          totalBytes,
          budgetExceeded,
          aborted
        });
      }
      await yieldControl();
      yields += 1;
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  /** @type {Array<{ assetIdA: string, assetIdB: string, classification: 'likely' | 'possible', bestDistance: number, support: number, supportA: number, supportB: number, top3DistanceSum: number }>} */
  const discovered = [];
  const fingerprintedIds = [...fingerprints.keys()].sort();
  compareLoop: for (let i = 0; i < fingerprintedIds.length; i += 1) {
    for (let j = i + 1; j < fingerprintedIds.length; j += 1) {
      if (signal.aborted) {
        aborted = true;
        break compareLoop;
      }
      const assetIdA = fingerprintedIds[i];
      const assetIdB = fingerprintedIds[j];
      const hashesA = /** @type {bigint[]} */ (fingerprints.get(assetIdA));
      const hashesB = /** @type {bigint[]} */ (fingerprints.get(assetIdB));
      const metrics = compareFingerprints(hashesA, hashesB);
      if (metrics.classification) {
        discovered.push({
          assetIdA,
          assetIdB,
          classification: metrics.classification,
          bestDistance: metrics.bestDistance,
          support: metrics.support,
          supportA: metrics.supportA,
          supportB: metrics.supportB,
          top3DistanceSum: metrics.top3DistanceSum
        });
      }
      comparisons += 1;
      if (comparisons % limits.yieldEveryPairComparisons === 0) {
        await yieldControl();
        yields += 1;
        if (options.onProgress) {
          onProgress({ phase: 'compare', comparisons, discovered: discovered.length, fingerprinted: fingerprints.size, totalBytes, budgetExceeded, aborted });
        }
      }
    }
  }

  const incompleteReasons = [];
  if (truncated) incompleteReasons.push('candidate-limit');
  if (budgetExceeded) incompleteReasons.push('fetch-budget');
  if (failures.length) incompleteReasons.push('asset-failures');
  if (aborted) incompleteReasons.push('cancelled');

  return {
    pairs: rankDiscoveredPairs(discovered),
    fingerprints,
    failures,
    scope: options.scope ?? null,
    candidateCount: candidates.length,
    scannedCount: scanCandidates.length,
    fingerprintedCount: fingerprints.size,
    totalBytes,
    comparisons,
    yields,
    truncated,
    bounded: truncated,
    budgetExceeded,
    aborted,
    incomplete: incompleteReasons.length > 0,
    incompleteReasons,
    maxFetchConcurrency,
    maxDecodeConcurrency
  };
}

/** @param {any} candidatePayload */
function emptyScanResult(candidatePayload) {
  const truncated = Boolean(candidatePayload?.truncated);
  return {
    pairs: [],
    fingerprints: new Map(),
    failures: [],
    scope: null,
    candidateCount: candidatePayload?.totalCount ?? 0,
    scannedCount: 0,
    fingerprintedCount: 0,
    totalBytes: 0,
    comparisons: 0,
    yields: 0,
    truncated,
    bounded: truncated,
    budgetExceeded: false,
    aborted: false,
    incomplete: truncated,
    incompleteReasons: truncated ? ['candidate-limit'] : [],
    maxFetchConcurrency: 0,
    maxDecodeConcurrency: 0
  };
}

/**
 * Stateful controller that owns exactly one search lifecycle at a time: the
 * candidate-listing load, the bounded scan, progress publication, and the final
 * result all share one generation token and one AbortController. Starting a new
 * search or cancelling aborts the outstanding candidate fetch and scan work, and
 * a superseded run can neither publish progress nor publish results.
 * @param {{
 *   fetchImage: ScanOptions['fetchImage'],
 *   decodeImage: ScanOptions['decodeImage'],
 *   limits?: Partial<typeof DEFAULT_LIMITS>,
 *   onProgress?: (progress: any) => void,
 *   yieldControl?: () => Promise<void>,
 *   hashRaster?: (raster: any) => bigint[]
 * }} adapters
 */
export function createVisualDuplicateController(adapters) {
  const limits = { ...DEFAULT_LIMITS, ...(adapters.limits ?? {}) };
  let generation = 0;
  /** @type {AbortController | null} */
  let abortController = null;
  let running = false;

  function cancel() {
    if (running) generation += 1;
    abortController?.abort();
    abortController = null;
    running = false;
  }

  /**
   * @param {{ candidates?: DiscoveryCandidate[], loadCandidates?: (signal: AbortSignal) => Promise<any>, scope?: any }} input
   */
  async function start(input) {
    abortController?.abort();
    const runGeneration = (generation += 1);
    const controller = new AbortController();
    abortController = controller;
    running = true;
    const isCurrent = () => runGeneration === generation && !controller.signal.aborted;
    /** @param {any} next */
    const publishProgress = (next) => {
      if (isCurrent()) adapters.onProgress?.(next);
    };
    const staleResult = () => ({
      ...emptyScanResult(null),
      candidatePayload: null,
      stale: true,
      published: false,
      aborted: true
    });
    try {
      /** @type {any} */
      let candidatePayload = null;
      /** @type {DiscoveryCandidate[]} */
      let candidates = [];
      if (typeof input.loadCandidates === 'function') {
        publishProgress({ phase: 'listing' });
        try {
          candidatePayload = await input.loadCandidates(controller.signal);
        } catch (error) {
          if (!isCurrent()) return staleResult();
          throw error;
        }
        if (!isCurrent()) return staleResult();
        candidates = Array.isArray(candidatePayload?.candidates) ? candidatePayload.candidates : [];
      } else {
        candidates = Array.isArray(input.candidates) ? input.candidates : [];
      }

      if (!candidates.length) {
        if (!isCurrent()) return staleResult();
        return { ...emptyScanResult(candidatePayload), candidatePayload, scope: input.scope ?? null, stale: false, published: true };
      }

      const result = await runVisualDuplicateScan({
        candidates,
        scope: input.scope ?? null,
        limits,
        fetchImage: adapters.fetchImage,
        decodeImage: adapters.decodeImage,
        hashRaster: adapters.hashRaster,
        onProgress: publishProgress,
        yieldControl: adapters.yieldControl,
        signal: controller.signal
      });
      if (!isCurrent()) {
        return { ...result, pairs: [], fingerprints: new Map(), candidatePayload, stale: true, published: false };
      }
      return { ...result, candidatePayload, stale: false, published: true };
    } finally {
      if (runGeneration === generation) {
        running = false;
        abortController = null;
      }
    }
  }

  return {
    start,
    cancel,
    limits,
    get running() { return running; },
    get generation() { return generation; }
  };
}

export { workingRasterSize };
