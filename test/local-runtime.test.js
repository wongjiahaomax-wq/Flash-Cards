import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';

import {
  createLocalDevPlan,
  createLocalPreviewPlan,
  createLocalRuntimeEnv,
  defaultLocalPreviewPort,
  localPreviewOrigin,
  localXdgConfigHome,
  repoRoot,
  resolveLocalPreviewPort,
  viteCli,
  wranglerCli
} from '../scripts/local-runtime-lib.mjs';

test('local runtime state is repository-local and environment construction is non-mutating', () => {
  /** @type {Record<string, string | undefined>} */
  const base = { EXISTING: 'yes', XDG_CONFIG_HOME: 'C:/read-only/global' };
  const env = createLocalRuntimeEnv(base, { BETTER_AUTH_URL: 'http://localhost:8787' });

  assert.equal(localXdgConfigHome, join(repoRoot, '.wrangler', 'xdg-config'));
  assert.equal(env.XDG_CONFIG_HOME, localXdgConfigHome);
  assert.equal(env.BETTER_AUTH_URL, 'http://localhost:8787');
  assert.equal(env.EXISTING, 'yes');
  assert.equal(base.XDG_CONFIG_HOME, 'C:/read-only/global');
  assert.equal(base.BETTER_AUTH_URL, undefined);
  assert.notEqual(env, base);
});

test('local preview uses 8787 by default and supports a validated override', () => {
  assert.equal(resolveLocalPreviewPort({}), defaultLocalPreviewPort);
  assert.equal(localPreviewOrigin(defaultLocalPreviewPort), 'http://localhost:8787');
  assert.equal(resolveLocalPreviewPort({ LOCAL_PREVIEW_PORT: '9123' }), 9123);
  assert.throws(() => resolveLocalPreviewPort({ LOCAL_PREVIEW_PORT: '0' }), /between 1 and 65535/);
  assert.throws(() => resolveLocalPreviewPort({ LOCAL_PREVIEW_PORT: 'abc' }), /between 1 and 65535/);
});

test('local dev uses repository Vite with only child-scoped XDG state', () => {
  /** @type {Record<string, string | undefined>} */
  const base = { XDG_CONFIG_HOME: '/global' };
  const plan = createLocalDevPlan(base);
  assert.equal(plan.command, process.execPath);
  assert.deepEqual(plan.args, [viteCli, 'dev']);
  assert.equal(plan.cwd, repoRoot);
  assert.equal(plan.env.XDG_CONFIG_HOME, localXdgConfigHome);
  assert.equal(base.XDG_CONFIG_HOME, '/global');
});

test('local preview uses repository Wrangler, localhost auth, and local-only migrations', () => {
  /** @type {Record<string, string | undefined>} */
  const base = { LOCAL_PREVIEW_PORT: '9123', XDG_CONFIG_HOME: '/global' };
  const plan = createLocalPreviewPlan(base);

  assert.equal(wranglerCli, join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js'));
  assert.equal(plan.origin, 'http://localhost:9123');
  assert.equal(plan.env.BETTER_AUTH_URL, plan.origin);
  assert.equal(plan.env.XDG_CONFIG_HOME, localXdgConfigHome);
  assert.equal(base.XDG_CONFIG_HOME, '/global');

  assert.equal(plan.migrate.command, process.execPath);
  assert.deepEqual(plan.migrate.args, [wranglerCli, 'd1', 'migrations', 'apply', 'DB', '--local']);
  assert.ok(plan.migrate.args.includes('--local'));
  assert.ok(!plan.migrate.args.includes('--remote'));

  assert.equal(plan.serve.command, process.execPath);
  assert.deepEqual(plan.serve.args, [
    wranglerCli,
    'dev',
    '--local',
    '--port',
    '9123',
    '--var',
    'BETTER_AUTH_URL:http://localhost:9123'
  ]);

  const serialized = JSON.stringify(plan);
  assert.doesNotMatch(serialized, /\bnpx\b|wrangler@\d+\.\d+\.\d+/);
});
