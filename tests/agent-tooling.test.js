import test from 'node:test';
import assert from 'node:assert/strict';
import { branchStatus, nodeMajorStatus, overallDoctorStatus, parseNodeMajor, wranglerVersionStatus } from '../scripts/agent-doctor-lib.mjs';
import { classifyChangedFiles } from '../scripts/agent-checks-lib.mjs';
import { parseAgentChecksArgs } from '../scripts/agent-checks.mjs';
import { escapeGithubCommandData, extractNodeTestDiagnostic, parseCiArgs } from '../scripts/validate-ci.mjs';
import { resolveInvocation, runValidation, VALIDATION_MODES } from '../scripts/validate.mjs';
import { VALIDATION_MODE_CHECK_IDS, validationCommandsForMode } from '../scripts/validation-contract.mjs';

test('Node major parsing and compatibility are deterministic', () => {
  assert.equal(parseNodeMajor('v22.18.0'), 22);
  assert.equal(nodeMajorStatus('v22.18.0', 22).ok, true);
  assert.equal(nodeMajorStatus('v24.0.0', 22).ok, false);
  assert.equal(nodeMajorStatus('invalid', null).ok, false);
});

test('Wrangler comparison requires exact repository version', () => {
  assert.equal(wranglerVersionStatus('4.125.0', '4.125.0').ok, true);
  assert.equal(wranglerVersionStatus('4.125.0', '4.124.0').ok, false);
});

test('branch state distinguishes feature, main, detached, and unreadable Git state', () => {
  assert.deepEqual(branchStatus('agent/example'), {
    branch: 'agent/example',
    level: 'ok',
    message: null,
  });

  const main = branchStatus('main');
  assert.equal(main.level, 'warning');
  assert.match(main.message ?? '', /feature branch/);

  const detached = branchStatus('');
  assert.equal(detached.level, 'warning');
  assert.match(detached.message ?? '', /detached/);

  const unreadable = branchStatus(null, false);
  assert.equal(unreadable.level, 'error');
  assert.match(unreadable.message ?? '', /could not be read/);

  assert.equal(overallDoctorStatus([{ level: 'warning' }]), 'warning');
  assert.equal(overallDoctorStatus([{ level: 'error' }]), 'error');
});

test('validation modes preserve the intended contracts from one shared authority', () => {
  assert.deepEqual(VALIDATION_MODE_CHECK_IDS.fast, ['diff', 'test', 'svelte']);
  assert.deepEqual(VALIDATION_MODE_CHECK_IDS.full, ['diff', 'db', 'test', 'svelte', 'build', 'authSmoke']);
  assert.deepEqual(VALIDATION_MODES.fast, [
    ['git', ['diff', '--check']], ['npm', ['test']], ['npm', ['run', 'check']],
  ]);
  assert.deepEqual(VALIDATION_MODES.full.at(-1), ['node', ['scripts/local-auth-smoke.mjs']]);
});

test('CI validation overrides only diff semantics while sharing the full check sequence', () => {
  const commands = validationCommandsForMode('full', {
    diffArgs: ['diff', '--check', 'HEAD^1', 'HEAD'],
  });
  assert.deepEqual(commands.map(({ id }) => id), VALIDATION_MODE_CHECK_IDS.full);
  assert.deepEqual(commands[0], {
    id: 'diff',
    label: 'Check diff whitespace',
    command: 'git',
    args: ['diff', '--check', 'HEAD^1', 'HEAD'],
  });
  assert.deepEqual(commands.at(-1).args, ['scripts/local-auth-smoke.mjs']);
});

test('npm and Node invocations use deterministic Node entrypoints where available', () => {
  assert.deepEqual(resolveInvocation('npm', ['test'], { npm_execpath: '/npm/npm-cli.js' }), {
    executable: process.execPath,
    args: ['/npm/npm-cli.js', 'test'],
  });
  assert.deepEqual(resolveInvocation('node', ['script.mjs'], {}), {
    executable: process.execPath,
    args: ['script.mjs'],
  });
  assert.deepEqual(resolveInvocation('git', ['diff'], {}), {
    executable: 'git',
    args: ['diff'],
  });
});

test('validation stops and propagates the first failing exit code', () => {
  let calls = 0;
  const status = runValidation('fast', () => ({ status: ++calls === 2 ? 7 : 0 }));
  assert.equal(status, 7);
  assert.equal(calls, 2);
});

test('CI Node-test diagnostics preserve useful GitHub annotations', () => {
  const output = [
    'TAP version 13',
    'not ok 2 - classifier',
    '  error: expected true',
    '  code: ERR_ASSERTION',
    'unrelated summary',
  ].join('\n');
  assert.equal(extractNodeTestDiagnostic(output), [
    'not ok 2 - classifier',
    '  error: expected true',
    '  code: ERR_ASSERTION',
  ].join('\n'));
  assert.equal(escapeGithubCommandData('a%b\nc'), 'a%25b%0Ac');
  assert.deepEqual(parseCiArgs(['--diff-base', 'HEAD^1', '--diff-head', 'HEAD']), {
    diffBase: 'HEAD^1',
    diffHead: 'HEAD',
  });
});

test('agent:checks CLI accepts a base override or explicit file fixture list', () => {
  assert.deepEqual(parseAgentChecksArgs(['--base', 'release']), { base: 'release', files: null });
  assert.deepEqual(parseAgentChecksArgs(['--files', 'src/a.js,docs/b.md']), {
    base: null,
    files: ['src/a.js', 'docs/b.md'],
  });
});

test('Admin/Svelte changes require application checks but not runtime smoke', () => {
  const report = classifyChangedFiles(['src/routes/admin/cases/[id]/+page.server.js']);
  assert.deepEqual(report.areas, ['Admin / Svelte routes']);
  assert.equal(report.requiredChecks.includes('test'), true);
  assert.equal(report.requiredChecks.includes('svelte'), true);
  assert.equal(report.requiredChecks.includes('build'), true);
  assert.equal(report.requiredChecks.includes('runtimeSmoke'), false);
});

test('DB query changes require DB/application validation without becoming schema changes', () => {
  const report = classifyChangedFiles(['src/lib/server/db/cases.js']);
  assert.equal(report.areas.includes('Database read/write logic'), true);
  assert.equal(report.areas.includes('Database schema / migrations'), false);
  assert.equal(report.requiredChecks.includes('db'), true);
  assert.equal(report.requiredChecks.includes('runtimeSmoke'), false);
});

test('schema and migration changes are classified separately and require db:check', () => {
  const report = classifyChangedFiles(['src/lib/server/db/schema.js', 'drizzle/0012_example.sql']);
  assert.equal(report.areas.includes('Database schema / migrations'), true);
  assert.equal(report.areas.includes('Database read/write logic'), false);
  assert.equal(report.requiredCommands.includes('npm run db:check'), true);
});

test('runtime/toolchain changes require repository runtime smoke', () => {
  const report = classifyChangedFiles(['wrangler.jsonc', 'package.json', 'package-lock.json']);
  assert.equal(report.areas.includes('Wrangler / runtime / toolchain'), true);
  assert.equal(report.requiredCommands.includes('npm run runtime:smoke'), true);
});

test('slide-review changes require only their specialized suite plus whitespace by default', () => {
  const report = classifyChangedFiles(['tools/slide-import-review/scripts/finalize.mjs']);
  assert.deepEqual(report.requiredCommands, ['git diff --check', 'npm run slide-review:test']);
  assert.equal(report.requiredCommands.includes('npm run runtime:smoke'), false);
});

test('documentation-only changes stay lightweight', () => {
  const report = classifyChangedFiles(['docs/DEVELOPMENT_EXECUTION_WORKFLOW.md', 'AGENTS.md']);
  assert.deepEqual(report.requiredCommands, ['git diff --check']);
});

test('GitHub workflow changes are explicit without pretending Actions can be run locally', () => {
  const report = classifyChangedFiles(['.github/workflows/ci.yml']);
  assert.equal(report.areas.includes('GitHub workflows / automation'), true);
  assert.deepEqual(report.requiredCommands, ['git diff --check']);
  assert.match(report.recommendations.join('\n'), /GitHub Actions/);
});

test('multiple subsystems combine checks without duplicates', () => {
  const report = classifyChangedFiles([
    'src/routes/admin/cases/+page.svelte',
    'src/lib/server/db/cases.js',
    'wrangler.jsonc',
  ]);
  assert.equal(report.requiredChecks.length, new Set(report.requiredChecks).size);
  assert.equal(report.requiredChecks.includes('db'), true);
  assert.equal(report.requiredChecks.includes('runtimeSmoke'), true);
});

test('unknown important source/tooling changes fail safe to full ordinary validation', () => {
  const report = classifyChangedFiles(['scripts/new-agent-helper.mjs']);
  assert.deepEqual(report.areas, ['Unclassified code/tooling (fail-safe)']);
  for (const checkId of VALIDATION_MODE_CHECK_IDS.full) {
    assert.equal(report.requiredChecks.includes(checkId), true);
  }
  assert.deepEqual(report.unclassifiedImportant, ['scripts/new-agent-helper.mjs']);
});
