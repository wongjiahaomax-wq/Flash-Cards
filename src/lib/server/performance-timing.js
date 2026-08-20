/**
 * @typedef {{ operation: string, durationMs: number, outcome: 'ok' | 'error' }} ServerReadTiming
 */

/** @param {ServerReadTiming} timing */
export function logServerReadTiming(timing) {
  console.info('[server-read-timing]', timing);
}

/**
 * Measure one async read while preserving its return value and thrown error.
 * Observer failures are deliberately ignored so instrumentation cannot change request semantics.
 *
 * @template T
 * @param {string} operation
 * @param {() => Promise<T>} read
 * @param {(timing: ServerReadTiming) => void} [observer]
 * @returns {Promise<T>}
 */
export async function withServerReadTiming(operation, read, observer = logServerReadTiming) {
  const startedAt = performance.now();
  try {
    const value = await read();
    try {
      observer({ operation, durationMs: Math.max(0, performance.now() - startedAt), outcome: 'ok' });
    } catch {}
    return value;
  } catch (error) {
    try {
      observer({ operation, durationMs: Math.max(0, performance.now() - startedAt), outcome: 'error' });
    } catch {}
    throw error;
  }
}

/** @param {string} operation @param {number} durationMs */
export function serverTimingValue(operation, durationMs) {
  const safeOperation = String(operation).replace(/[^A-Za-z0-9_.-]/g, '-');
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  return `${safeOperation};dur=${safeDuration.toFixed(1)}`;
}
