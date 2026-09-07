import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationGuard } from '../src/operation-guard.js';

test('async operation completion cannot download or update status after the bundle generation changes', async () => {
  const context = { generation: 1, bundle: { id: 'old' } };
  const busy = [];
  const guard = createOperationGuard(() => context, active => busy.push(active?.label ?? null));
  const token = guard.begin('finalize', 'Creating Import ZIP…');
  let downloads = 0;
  let statuses = 0;

  assert.ok(token);
  assert.equal(guard.isCurrent(token), true);
  const completion = Promise.resolve().then(() => {
    if (!guard.isCurrent(token)) return;
    downloads += 1;
    statuses += 1;
  });
  context.generation += 1;
  context.bundle = { id: 'new' };
  await completion;

  assert.equal(guard.isCurrent(token), false);
  assert.equal(downloads, 0);
  assert.equal(statuses, 0);
  assert.equal(guard.finish(token), false);
  assert.equal(guard.active, null);
  assert.deepEqual(busy, ['Creating Import ZIP…', null]);
});

test('only one backup or finalization operation can run at a time', () => {
  const context = { generation: 1, bundle: { id: 'bundle' } };
  const guard = createOperationGuard(() => context);
  const first = guard.begin('backup', 'Backing up…');

  assert.ok(first);
  assert.equal(guard.begin('finalize', 'Creating Import ZIP…'), null);
  assert.equal(guard.finish(first), true);
  assert.ok(guard.begin('finalize', 'Creating Import ZIP…'));
});
