// Browser-only adapters for visual duplicate discovery.
//
// Everything here is lazily referenced inside functions so the module can be
// imported (but not executed) in a Node test process. Decoding produces a bounded
// working raster and releases the ImageBitmap, canvas, and pixel buffer promptly.

import { workingRasterSize } from './visual-duplicate-matcher.js';
import { createVisualDuplicateController } from './visual-duplicate-discovery.js';

/**
 * Builds the Tranche-1 comparison URL. Discovery never merges anything itself:
 * this link enters the existing server-owned certification flow with an explicit
 * survivor and duplicate.
 * @param {string} survivorAssetId @param {string} duplicateAssetId
 */
export function buildCompareHref(survivorAssetId, duplicateAssetId) {
  return `/admin/images/deduplicate?survivor=${encodeURIComponent(survivorAssetId)}&duplicate=${encodeURIComponent(duplicateAssetId)}`;
}

/** @param {string} url @param {{ signal: AbortSignal }} options */
export async function fetchImageResponse(url, { signal }) {
  return fetch(url, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { accept: 'image/*' },
    signal
  });
}

/** @param {Blob} blob @param {() => void} release */
function withObjectUrlFallback(blob, release) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, release });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('The image could not be decoded in this browser.'));
    };
    image.src = objectUrl;
  });
}

/**
 * Decodes image bytes into a bounded working RGBA raster.
 * @param {Uint8Array} bytes @param {string | null} contentType @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ data: Uint8ClampedArray, width: number, height: number, close: () => void }>}
 */
export async function decodeImageToWorkingRaster(bytes, contentType, options = {}) {
  if (options.signal?.aborted) throw new DOMException('Discovery was cancelled.', 'AbortError');
  const blob = new Blob([/** @type {BlobPart} */ (bytes)], { type: contentType || 'image/png' });

  /** @type {any} */
  let source;
  /** @type {() => void} */
  let release;
  if (typeof createImageBitmap === 'function') {
    source = await createImageBitmap(blob);
    release = () => { if (typeof source.close === 'function') source.close(); };
  } else {
    const fallback = await withObjectUrlFallback(blob, () => {});
    source = fallback.source;
    release = fallback.release;
  }

  try {
    if (options.signal?.aborted) throw new DOMException('Discovery was cancelled.', 'AbortError');
    const target = workingRasterSize(source.width ?? 0, source.height ?? 0);
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(target.width, target.height) : document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const context = /** @type {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null} */ (canvas.getContext('2d', { willReadFrequently: true }));
    if (!context) throw new Error('This browser cannot decode images for duplicate discovery.');
    context.drawImage(source, 0, 0, target.width, target.height);
    const imageData = context.getImageData(0, 0, target.width, target.height);
    canvas.width = 0;
    canvas.height = 0;
    return {
      data: imageData.data,
      width: target.width,
      height: target.height,
      close() { imageData.data.fill(0); }
    };
  } finally {
    release();
  }
}

function browserYield() {
  if (typeof scheduler !== 'undefined' && typeof scheduler.yield === 'function') return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * @param {{ onProgress?: (progress: any) => void, limits?: Record<string, number> }} [options]
 */
export function createBrowserVisualDuplicateController(options = {}) {
  return createVisualDuplicateController({
    fetchImage: fetchImageResponse,
    decodeImage: decodeImageToWorkingRaster,
    onProgress: options.onProgress,
    limits: options.limits,
    yieldControl: browserYield
  });
}

/**
 * Build the Admin discovery page's controller from the server-owned page data, so
 * the scan bounds and the authoritative teaching-image size ceiling come from the
 * route load instead of coincidentally matching client-side defaults.
 * @param {{ limits?: any } | null | undefined} pageData
 * @param {(progress: any) => void} [onProgress]
 */
export function createAdminDiscoveryController(pageData, onProgress) {
  return createBrowserVisualDuplicateController({ limits: pageData?.limits, onProgress });
}
