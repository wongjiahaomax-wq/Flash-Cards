import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { branchStatus, nodeMajorStatus, overallDoctorStatus, parseNodeMajor, wranglerVersionStatus } from '../scripts/agent-doctor-lib.mjs';
import { classifyChangedFiles } from '../scripts/agent-checks-lib.mjs';
import { parseAgentChecksArgs } from '../scripts/agent-checks.mjs';
import { CI_TEST_MAX_BUFFER_BYTES, ciValidationCommands, escapeGithubCommandData, extractNodeTestDiagnostic, parseCiArgs } from '../scripts/validate-ci.mjs';
import { resolveInvocation, runValidation, VALIDATION_MODES } from '../scripts/validate.mjs';
import { VALIDATION_MODE_CHECK_IDS } from '../scripts/validation-contract.mjs';
import { localDiffCheck, resolveDiffBase } from '../scripts/validation-git.mjs';

/** @param {string} cwd @param {string[]} args @param {{ allowFailure?: boolean }} [options] */
function runGit(cwd, args, options = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (!options.allowFailure) {
    assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr || result.error?.message || ''}`);
  }
  return result;
}

function makeGitRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-cards-validation-'));
  runGit(root, ['init', '-b', 'main']);
  runGit(root, ['config', 'user.name', 'Validation Test']);
  runGit(root, ['config', 'user.email', 'validation@example.invalid']);
  fs.writeFileSync(path.join(root, 'base.txt'), 'base\n');
  fs.writeFileSync(path.join(root, 'changed.txt'), 'clean\n');
  runGit(root, ['add', 'base.txt', 'changed.txt']);
  runGit(root, ['commit', '-m', 'base']);
  const base = String(runGit(root, ['rev-parse', 'HEAD']).stdout ?? '').trim();
  runGit(root, ['update-ref', 'refs/remotes/origin/main', base]);
  return { root, base };
}

/** @param {string} root @param {string} file @param {string} content @param {string} message */
function commitFile(root, file, content, message) {
  fs.writeFileSync(path.join(root, file), content);
  runGit(root, ['add', file]);
  runGit(root, ['commit', '-m', message]);
  return String(runGit(root, ['rev-parse', 'HEAD']).stdout ?? '').trim();
}

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
  assert.deepEqual(VALIDATION_MODE_CHECK_IDS.fast, ['diff', 'testFast', 'svelte']);
  assert.deepEqual(VALIDATION_MODE_CHECK_IDS.full, ['diff', 'db', 'test', 'svelte', 'build', 'authSmoke']);
  assert.deepEqual(VALIDATION_MODES.fast, [
    ['git', ['diff', '--check']], ['npm', ['run', 'test:fast']], ['npm', ['run', 'check']],
  ]);
  assert.deepEqual(VALIDATION_MODES.full.at(-1), ['node', ['scripts/local-auth-smoke.mjs']]);
});

test('CI validation selects fast/full from the shared contract while overriding only diff semantics', () => {
  for (const mode of ['fast', 'full']) {
    const commands = ciValidationCommands({
      mode,
      diffBase: 'HEAD^1',
      diffHead: 'HEAD',
    });
    assert.deepEqual(commands.map(({ id }) => id), VALIDATION_MODE_CHECK_IDS[mode]);
    assert.deepEqual(commands[0], {
      id: 'diff',
      label: 'Check diff whitespace',
      command: 'git',
      args: ['diff', '--check', 'HEAD^1', 'HEAD'],
    });
  }

  assert.deepEqual(
    ciValidationCommands({ diffBase: 'HEAD^1', diffHead: 'HEAD' }).map(({ id }) => id),
    VALIDATION_MODE_CHECK_IDS.full,
  );
});

test('PR CI delegates ordinary checks to the shared CI runner with PR-state mode selection and concurrency', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^  pull_request:\n    types: \[opened, synchronize, reopened, ready_for_review\]$/m);
  assert.equal(workflow.includes('group: ${{ github.workflow }}-pr-${{ github.event.pull_request.number }}'), true);
  assert.equal(workflow.includes('cancel-in-progress: true'), true);
  assert.match(workflow, /^  check:$/m);
  assert.equal(workflow.includes("VALIDATION_MODE: ${{ github.event.pull_request.draft && 'fast' || 'full' }}"), true);
  assert.equal(workflow.includes('run: node scripts/validate-ci.mjs --mode "$VALIDATION_MODE" --diff-base HEAD^1 --diff-head HEAD'), true);
  assert.match(workflow, /run: npm ci/);
  for (const duplicate of [
    'npm run db:check',
    'npm test',
    'npm run check',
    'npm run build',
    'node scripts/local-auth-smoke.mjs',
  ]) {
    assert.equal(workflow.includes(duplicate), false, `${duplicate} should come from the shared validation contract`);
  }
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
  const status = runValidation('fast', () => ({ status: ++calls === 2 ? 7 : 0 }), {
    diffArgs: ['diff', '--check', 'TEST_BASE'],
  });
  assert.equal(status, 7);
  assert.equal(calls, 2);
});

test('CI Node-test diagnostics preserve useful GitHub annotations without the default small output buffer', () => {
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
  assert.equal(CI_TEST_MAX_BUFFER_BYTES >= 64 * 1024 * 1024, true);
});

test('CI argument parsing preserves diff overrides, defaults omitted mode to full, and rejects invalid modes', () => {
  assert.deepEqual(parseCiArgs(['--diff-base', 'HEAD^1', '--diff-head', 'HEAD']), {
    mode: 'full',
    diffBase: 'HEAD^1',
    diffHead: 'HEAD',
  });
  assert.deepEqual(parseCiArgs(['--mode', 'fast', '--diff-base', 'BASE', '--diff-head', 'TIP']), {
    mode: 'fast',
    diffBase: 'BASE',
    diffHead: 'TIP',
  });
  assert.throws(() => parseCiArgs(['--mode', 'slow']), /Unknown CI validation mode: slow/);
  assert.throws(() => parseCiArgs(['--mode', 'everything']), /Unknown CI validation mode: everything/);
  assert.throws(() => parseCiArgs(['--mode', '']), /CI validation mode must be non-empty/);
});

test('agent:checks CLI accepts a base override or explicit file fixture list', () => {
  assert.deepEqual(parseAgentChecksArgs(['--base', 'release']), { base: 'release', files: null });
  assert.deepEqual(parseAgentChecksArgs(['--files', 'src/a.js,docs/b.md']), {
    base: null,
    files: ['src/a.js', 'docs/b.md'],
  });
});

test('diff base prefers current origin/main when local main is stale', () => {
  const { root, base } = makeGitRepository();
  try {
    commitFile(root, 'b.txt', 'b\n', 'B');
    const currentMain = commitFile(root, 'c.txt', 'c\n', 'C');
    runGit(root, ['update-ref', 'refs/remotes/origin/main', currentMain]);
    runGit(root, ['switch', '-c', 'agent/example']);
    commitFile(root, 'd.txt', 'd\n', 'D');
    runGit(root, ['branch', '-f', 'main', base]);

    const resolved = resolveDiffBase(root);
    assert.equal(resolved.baseRef, 'origin/main');
    assert.equal(resolved.mergeBase, currentMain);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('local validation diff covers committed, staged, and unstaged tracked whitespace errors', async (t) => {
  for (const scenario of ['committed', 'staged', 'unstaged']) {
    await t.test(scenario, () => {
      const { root, base } = makeGitRepository();
      try {
        runGit(root, ['switch', '-c', `agent/${scenario}`]);
        fs.writeFileSync(path.join(root, 'changed.txt'), 'trailing whitespace  \n');
        if (scenario === 'staged' || scenario === 'committed') runGit(root, ['add', 'changed.txt']);
        if (scenario === 'committed') runGit(root, ['commit', '-m', 'bad whitespace']);

        const diff = localDiffCheck(root);
        assert.equal(diff.baseRef, 'origin/main');
        assert.equal(diff.mergeBase, base);
        assert.deepEqual(diff.args, ['diff', '--check', base]);
        assert.notEqual(runGit(root, diff.args, { allowFailure: true }).status, 0);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test('local validation runner injects the resolved merge-base diff check', () => {
  const { root, base } = makeGitRepository();
  try {
    runGit(root, ['switch', '-c', 'agent/local-validation']);
    /** @type {{ command: string, args: string[] }[]} */
    const calls = [];
    const status = runValidation('fast', (command, args) => {
      calls.push({ command, args });
      return { status: 0 };
    }, { root });
    assert.equal(status, 0);
    assert.deepEqual(calls[0], { command: 'git', args: ['diff', '--check', base] });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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

test('local replica helper stays automated-light and marks credential-dependent verification', () => {
  const report = classifyChangedFiles(['scripts/local-replica-lib.mjs']);
  assert.equal(report.areas.includes('Local production-like replica tooling'), true);
  assert.deepEqual(report.requiredCommands, ['git diff --check', 'npm test']);
  assert.equal(report.requiredCommands.includes('npm run runtime:smoke'), false);
  const recommendation = report.recommendations.join('\n');
  assert.match(recommendation, /Credential-dependent/);
  assert.match(recommendation, /do not access production automatically/i);
});

test('slide-review changes require both specialized test and build contracts', () => {
  const report = classifyChangedFiles(['tools/slide-import-review/scripts/finalize.mjs']);
  assert.deepEqual(report.requiredCommands, [
    'git diff --check',
    'npm run slide-review:test',
    'npm run slide-review:build',
  ]);
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
