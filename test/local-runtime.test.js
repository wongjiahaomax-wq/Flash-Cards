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
import {
  classifyLocalServerCommand,
  descendantPids,
  parsePosixProcessList,
  parseWindowsProcessList
} from '../scripts/local-stop.mjs';

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

test('local stop recognizes only this repository Vite and Wrangler dev entrypoints', () => {
  assert.equal(classifyLocalServerCommand(`node "${viteCli}" dev`), 'dev');
  assert.equal(classifyLocalServerCommand(`node "${wranglerCli}" dev --local --port 8787`), 'preview');
  assert.equal(classifyLocalServerCommand(`node "${viteCli}" build`), null);
  assert.equal(classifyLocalServerCommand('node scripts/local-dev.mjs'), null);
  assert.equal(classifyLocalServerCommand('node /another/project/node_modules/vite/bin/vite.js dev'), null);

  const windowsVite = viteCli.replaceAll('/', '\\').toUpperCase();
  assert.equal(classifyLocalServerCommand(`node "${windowsVite}" dev`, 'win32'), 'dev');
});

test('local stop process-list parsers preserve pid, parent pid, and command line', () => {
  assert.deepEqual(
    parsePosixProcessList(`  10   1 node ${viteCli} dev\n  11  10 workerd\n`),
    [
      { pid: 10, ppid: 1, commandLine: `node ${viteCli} dev` },
      { pid: 11, ppid: 10, commandLine: 'workerd' }
    ]
  );

  assert.deepEqual(
    parseWindowsProcessList(JSON.stringify([
      { ProcessId: 20, ParentProcessId: 2, CommandLine: `node ${wranglerCli} dev --local` },
      { ProcessId: 21, ParentProcessId: 20, CommandLine: 'workerd.exe' }
    ])),
    [
      { pid: 20, ppid: 2, commandLine: `node ${wranglerCli} dev --local` },
      { pid: 21, ppid: 20, commandLine: 'workerd.exe' }
    ]
  );
});

test('local stop discovers descendants without targeting unrelated processes', () => {
  const processes = [
    { pid: 10, ppid: 1, commandLine: 'server' },
    { pid: 11, ppid: 10, commandLine: 'child' },
    { pid: 12, ppid: 11, commandLine: 'grandchild' },
    { pid: 20, ppid: 1, commandLine: 'unrelated' }
  ];
  assert.deepEqual(descendantPids(10, processes), [11, 12]);
});
