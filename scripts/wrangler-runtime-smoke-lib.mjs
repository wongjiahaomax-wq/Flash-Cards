import { rm } from 'node:fs/promises';

const transientWindowsCleanupCodes = new Set(['EBUSY', 'EPERM']);

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

export async function removeRuntimeSmokeDirectory(path, {
  remove = (target) => rm(target, { recursive: true, force: true }),
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
      const retryable = platform === 'win32' && transientWindowsCleanupCodes.has(error?.code);
      if (!retryable || attempt === maxAttempts) throw error;
      await sleep(baseDelayMs * attempt);
    }
  }
}
