import assert from 'node:assert/strict';
import test from 'node:test';

import { removeRuntimeSmokeDirectory } from '../scripts/wrangler-runtime-smoke-lib.mjs';

/** @param {string} code */
function codedError(code) {
  return Object.assign(new Error(code), { code });
}

test('runtime smoke cleanup retries transient Windows EBUSY and EPERM failures', async () => {
  for (const code of ['EBUSY', 'EPERM']) {
    let attempts = 0;
    /** @type {number[]} */
    const delays = [];
    await removeRuntimeSmokeDirectory('ignored', {
      platform: 'win32',
      remove: async () => {
        attempts += 1;
        if (attempts < 3) throw codedError(code);
      },
      sleep: async (ms) => { delays.push(ms); },
      maxAttempts: 5,
      baseDelayMs: 10
    });
    assert.equal(attempts, 3);
    assert.deepEqual(delays, [10, 20]);
  }
});

test('runtime smoke cleanup does not hide non-transient errors', async () => {
  let attempts = 0;
  await assert.rejects(
    removeRuntimeSmokeDirectory('ignored', {
      platform: 'win32',
      remove: async () => { attempts += 1; throw codedError('EACCES'); },
      sleep: async () => {}
    }),
    { code: 'EACCES' }
  );
  assert.equal(attempts, 1);
});

test('runtime smoke cleanup remains bounded when Windows lock does not clear', async () => {
  let attempts = 0;
  await assert.rejects(
    removeRuntimeSmokeDirectory('ignored', {
      platform: 'win32',
      remove: async () => { attempts += 1; throw codedError('EBUSY'); },
      sleep: async () => {},
      maxAttempts: 3
    }),
    { code: 'EBUSY' }
  );
  assert.equal(attempts, 3);
});
