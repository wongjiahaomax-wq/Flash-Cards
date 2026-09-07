import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutosaveCoordinator } from '../src/autosave.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('autosave drains an edit that arrives while the first write is in flight', async () => {
  let revision = 1;
  let dirty = true;
  let releaseFirst;
  const firstWrite = new Promise(resolve => { releaseFirst = resolve; });
  const writes = [];
  let rearmed = 0;
  const coordinator = createAutosaveCoordinator({
    hasPending: () => dirty,
    write: async () => {
      const target = revision;
      writes.push(target);
      if (target === 1) await firstWrite;
      if (target === revision) dirty = false;
    },
    schedule: () => { rearmed += 1; }
  });

  const first = coordinator.flush();
  await tick();
  revision = 2;
  dirty = true;
  const second = coordinator.flush();
  releaseFirst();
  await Promise.all([first, second]);

  assert.deepEqual(writes, [1, 2]);
  assert.equal(dirty, false);
  assert.equal(rearmed, 1);
});
