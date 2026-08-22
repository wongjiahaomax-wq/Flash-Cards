import { rm } from 'node:fs/promises';

const transientWindowsCleanupCodes = new Set(['EBUSY', 'EPERM']);

/** @param {number} ms */
function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

/** @param {string} target */
function removeDirectory(target) {
  return rm(target, { recursive: true, force: true });
}

/**
 * @typedef {{
 *   remove?: (target: string) => Promise<void>,
 *   sleep?: (ms: number) => Promise<void>,
 *   platform?: string,
 *   maxAttempts?: number,
 *   baseDelayMs?: number
 * }} CleanupOptions
 */

/**
 * @param {string} path
 * @param {CleanupOptions} [options]
 */
export async function removeRuntimeSmokeDirectory(path, {
  remove = removeDirectory,
  sleep = delay,
  platform = process.platform,
  maxAttempts = 5,
  baseDelayMs = 50
} = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await remove(path);
      return;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : '';
      const retryable = platform === 'win32' && transientWindowsCleanupCodes.has(code);
      if (!retryable || attempt === maxAttempts) throw error;
      await sleep(baseDelayMs * attempt);
    }
  }
}
