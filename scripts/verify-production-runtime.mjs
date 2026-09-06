const SHA_PATTERN = /^[0-9a-f]{40}$/;

/**
 * @param {unknown} value
 * @param {string} expectedSha
 * @param {boolean} expectedFence
 */
export function evaluateRuntimeStatus(value, expectedSha, expectedFence) {
  const actual = {
    learnerRuntimeCutoverVersion: value && typeof value === 'object' ? value.learnerRuntimeCutoverVersion : undefined,
    learnerRuntimeScopeVersion: value && typeof value === 'object' ? value.learnerRuntimeScopeVersion : undefined,
    learnerRuntimeWriteFence: value && typeof value === 'object' ? value.learnerRuntimeWriteFence : undefined,
    learnerRuntimeBuildSha: value && typeof value === 'object' ? value.learnerRuntimeBuildSha : undefined,
    learnerRuntimeWorkerVersion: value && typeof value === 'object' ? value.learnerRuntimeWorkerVersion : undefined
  };

  return {
    ok: actual.learnerRuntimeCutoverVersion === 2
      && actual.learnerRuntimeScopeVersion === 2
      && actual.learnerRuntimeWriteFence === expectedFence
      && actual.learnerRuntimeBuildSha === expectedSha,
    actual
  };
}

/** @param {string[]} argv */
function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value == null) {
      throw new Error(`Invalid argument sequence near ${key ?? '<end>'}`);
    }
    values.set(key, value);
  }

  const baseUrl = values.get('--base-url');
  const expectedSha = values.get('--expected-sha')?.toLowerCase();
  const expectedFenceRaw = values.get('--expected-fence');
  const attempts = Number(values.get('--attempts') ?? '60');
  const delayMs = Number(values.get('--delay-ms') ?? '2000');

  if (!baseUrl) throw new Error('--base-url is required');
  if (!expectedSha || !SHA_PATTERN.test(expectedSha)) throw new Error('--expected-sha must be a 40-hex commit SHA');
  if (!['true', 'false'].includes(expectedFenceRaw ?? '')) throw new Error('--expected-fence must be true or false');
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 120) throw new Error('--attempts must be an integer from 1 to 120');
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 10000) throw new Error('--delay-ms must be an integer from 0 to 10000');

  return {
    baseUrl,
    expectedSha,
    expectedFence: expectedFenceRaw === 'true',
    attempts,
    delayMs
  };
}

/** @param {number} milliseconds */
function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * @param {{ baseUrl: string, expectedSha: string, expectedFence: boolean, attempts: number, delayMs: number }} options
 */
export async function verifyProductionRuntime(options) {
  const endpoint = new URL('/api/runtime-cutover-status', options.baseUrl);
  let lastObservation = 'no response received';

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      const url = new URL(endpoint);
      url.searchParams.set('deployment-verification', `${Date.now()}-${attempt}`);
      const response = await fetch(url, {
        redirect: 'error',
        headers: {
          'cache-control': 'no-cache',
          pragma: 'no-cache'
        },
        signal: AbortSignal.timeout(10_000)
      });
      const text = await response.text();

      if (!response.ok) {
        lastObservation = `HTTP ${response.status}`;
      } else {
        let value;
        try {
          value = JSON.parse(text);
        } catch {
          lastObservation = `HTTP 200 with invalid JSON: ${JSON.stringify(text.slice(0, 200))}`;
          value = undefined;
        }

        if (value !== undefined) {
          const result = evaluateRuntimeStatus(value, options.expectedSha, options.expectedFence);
          if (result.ok) {
            console.log(`Verified Production runtime on attempt ${attempt}/${options.attempts}: ${JSON.stringify(result.actual)}`);
            return result.actual;
          }
          lastObservation = `runtime mismatch: ${JSON.stringify(result.actual)}`;
        }
      }
    } catch (error) {
      lastObservation = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }

    console.log(`Production runtime has not converged yet (attempt ${attempt}/${options.attempts}): ${lastObservation}`);
    if (attempt < options.attempts && options.delayMs > 0) {
      await sleep(options.delayMs);
    }
  }

  const expected = {
    learnerRuntimeCutoverVersion: 2,
    learnerRuntimeScopeVersion: 2,
    learnerRuntimeWriteFence: options.expectedFence,
    learnerRuntimeBuildSha: options.expectedSha
  };
  throw new Error(`Production runtime did not converge after ${options.attempts} attempts. Expected ${JSON.stringify(expected)}; last observation: ${lastObservation}`);
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    await verifyProductionRuntime(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::error::${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname) {
  await main();
}
