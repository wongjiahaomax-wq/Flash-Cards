import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isPreviewAdmin,
  isPreviewWorker,
  isProductionAdmin,
  requirePreviewAdmin
} from '../src/lib/server/preview-auth.js';

test('preview_admin is distinct from production admin', () => {
  const previewUser = { id: 'preview-user', role: 'preview_admin' };
  const productionAdmin = { id: 'admin-user', role: 'admin' };
  const learner = { id: 'learner-user', role: 'user' };

  assert.equal(isPreviewAdmin(previewUser), true);
  assert.equal(isProductionAdmin(previewUser), false);
  assert.equal(isProductionAdmin(productionAdmin), true);
  assert.equal(isPreviewAdmin(productionAdmin), false);
  assert.equal(isPreviewAdmin(learner), false);
});

test('preview authority requires both dedicated role and Preview Worker runtime', () => {
  const previewUser = { id: 'preview-user', role: 'preview_admin' };
  assert.equal(isPreviewWorker({ PREVIEW_MODE: 'true' }), true);
  assert.equal(isPreviewWorker({}), false);
  assert.equal(requirePreviewAdmin({ user: previewUser, env: { PREVIEW_MODE: 'true' } }), 'preview-user');
  assert.throws(() => requirePreviewAdmin({ user: previewUser, env: {} }), /Preview Admin access/);
  assert.throws(() => requirePreviewAdmin({ user: { id: 'learner', role: 'user' }, env: { PREVIEW_MODE: 'true' } }), /Preview Admin access/);
  assert.throws(() => requirePreviewAdmin({ user: { id: 'admin', role: 'admin' }, env: { PREVIEW_MODE: 'true' } }), /Preview Admin access/);
});
