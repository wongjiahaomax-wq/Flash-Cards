import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyChangedFiles } from '../scripts/agent-checks-lib.mjs';
import { printCompactAgentChecksReport } from '../scripts/agent-checks.mjs';
import {
  LOCAL_COMPACT_TEST_REPORTER,
  localValidationCommandArgs,
  parseValidationArgs,
} from '../scripts/validate.mjs';

/** @param {() => void} callback */
function captureConsole(callback) {
  /** @type {string[]} */
  const lines = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (...values) => lines.push(values.join(' '));
  console.warn = (...values) => lines.push(values.join(' '));
  try {
    callback();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
  return lines.join('\n');
}

test('local validation compact flag is explicit and rejects unknown arguments', () => {
  assert.deepEqual(parseValidationArgs(['fast']), { mode: 'fast', compact: false });
  assert.deepEqual(parseValidationArgs(['full', '--compact']), { mode: 'full', compact: true });
  assert.throws(() => parseValidationArgs(['fast', '--quiet']), /Unknown validation argument: --quiet/);
});

test('compact local validation changes presentation args without changing canonical checks', () => {
  assert.deepEqual(
    localValidationCommandArgs('test', ['test'], true),
    ['test', '--', `--test-reporter=${LOCAL_COMPACT_TEST_REPORTER}`],
  );
  assert.deepEqual(
    localValidationCommandArgs('testFast', ['run', 'test:fast'], true),
    ['run', 'test:fast', '--', `--test-reporter=${LOCAL_COMPACT_TEST_REPORTER}`],
  );
  assert.deepEqual(
    localValidationCommandArgs('build', ['run', 'build'], true),
    ['run', 'build', '--', '--logLevel', 'warn'],
  );
  assert.deepEqual(
    localValidationCommandArgs('svelte', ['run', 'check'], true),
    ['run', 'check'],
  );
  assert.deepEqual(
    localValidationCommandArgs('build', ['run', 'build'], false),
    ['run', 'build'],
  );
});

test('Admin Svelte changes receive cheap iteration guidance while retaining the same handoff requirements', () => {
  const report = classifyChangedFiles(['src/routes/admin/cases/+page.svelte']);

  assert.deepEqual(report.requiredChecks, ['diff', 'test', 'svelte', 'build']);
  assert.equal(report.iterationGuidance.some((line) => /presentation-only/.test(line) && /Vite HMR/.test(line)), true);
  assert.equal(report.iterationGuidance.some((line) => /component logic/.test(line) && /directly related test/.test(line)), true);
  assert.equal(report.checkpointGuidance.some((line) => /npm run check/.test(line)), true);
  assert.equal(report.checkpointGuidance.some((line) => /validate:fast -- --compact/.test(line)), true);
});

test('changed test files get an exact direct iteration command before broad validation', () => {
  const report = classifyChangedFiles(['tests/example-flow.test.js']);
  assert.equal(report.iterationGuidance.includes(
    'Iteration: run changed test directly: node --test tests/example-flow.test.js',
  ), true);
  assert.deepEqual(report.requiredChecks, ['diff', 'test']);
});

test('documentation-only changes do not gain application validation requirements', () => {
  const report = classifyChangedFiles(['docs/DEVELOPMENT_EXECUTION_WORKFLOW.md']);
  assert.deepEqual(report.requiredChecks, ['diff']);
  assert.equal(report.iterationGuidance.some((line) => /no application test\/build loop/.test(line)), true);
  assert.deepEqual(report.checkpointGuidance, []);
});

test('compact agent-checks output separates iteration, checkpoint, and handoff guidance', () => {
  const report = classifyChangedFiles(['src/routes/admin/cases/+page.svelte']);
  const output = captureConsole(() => printCompactAgentChecksReport(report, 'fixture-base'));

  assert.match(output, /Iteration guidance/);
  assert.match(output, /Checkpoint guidance/);
  assert.match(output, /Handoff: run every command under Required automated checks/);
  assert.match(output, /Required automated checks/);
  assert.match(output, /npm test/);
  assert.match(output, /npm run check/);
  assert.match(output, /npm run build/);
});

test('compact phase guidance does not duplicate specialized required commands', () => {
  const report = classifyChangedFiles(['tools/slide-import-review/scripts/finalize.mjs']);
  const output = captureConsole(() => printCompactAgentChecksReport(report, 'fixture-base'));

  assert.deepEqual(report.specializedRequiredCommands, [
    'npm run slide-review:test',
    'npm run slide-review:build',
  ]);
  for (const command of report.specializedRequiredCommands) {
    assert.equal(output.split(command).length - 1, 1, `${command} should be rendered exactly once`);
  }
});
