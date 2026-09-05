import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyChangedFiles } from '../scripts/agent-checks-lib.mjs';
import { printCompactAgentChecksReport } from '../scripts/agent-checks.mjs';
import {
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

test('local validation is compact by default, supports explicit verbose output, and rejects unknown arguments', () => {
  assert.deepEqual(parseValidationArgs(['fast']), { mode: 'fast', verbose: false });
  assert.deepEqual(parseValidationArgs(['full', '--verbose']), { mode: 'full', verbose: true });
  assert.deepEqual(parseValidationArgs(['fast', '--compact']), { mode: 'fast', verbose: false });
  assert.throws(() => parseValidationArgs(['fast', '--quiet']), /Unknown validation argument: --quiet/);
});

test('verbose local validation changes presentation commands without changing canonical checks', () => {
  assert.deepEqual(localValidationCommandArgs('test', ['test'], false), ['test']);
  assert.deepEqual(localValidationCommandArgs('test', ['test'], true), ['run', 'test:verbose']);
  assert.deepEqual(localValidationCommandArgs('testFast', ['run', 'test:fast'], true), ['run', 'test:fast:verbose']);
  assert.deepEqual(localValidationCommandArgs('svelte', ['run', 'check'], true), ['run', 'check:verbose']);
  assert.deepEqual(localValidationCommandArgs('build', ['run', 'build'], true), ['run', 'build:verbose']);
  assert.deepEqual(localValidationCommandArgs('slideReviewTest', ['run', 'slide-review:test'], true), ['run', 'slide-review:test:verbose']);
  assert.deepEqual(
    localValidationCommandArgs('ecgAssetRenameOperatorTest', ['test', '--', 'test/example.test.js'], true),
    ['run', 'test:verbose', '--', 'test/example.test.js'],
  );
});

test('Admin Svelte changes receive cheap specific guidance while retaining the same handoff requirements', () => {
  const report = classifyChangedFiles(['src/routes/admin/cases/+page.svelte']);
  assert.deepEqual(report.requiredChecks, ['diff', 'test', 'svelte', 'build']);
  assert.equal(report.iterationGuidance.some((line) => /presentation-only/.test(line) && /Vite HMR/.test(line)), true);
  assert.equal(report.iterationGuidance.some((line) => /component logic/.test(line) && /directly related test/.test(line)), true);
  assert.equal(report.iterationGuidance.some((line) => /broad handoff suite/.test(line)), false);
  assert.equal(report.checkpointGuidance.some((line) => /npm run check/.test(line)), true);
  assert.equal(report.checkpointGuidance.some((line) => /after a coherent batch/.test(line)), false);
});

test('DB and schema changes keep their specific compact checkpoint guidance', () => {
  const database = classifyChangedFiles(['src/lib/server/db/cases.js']);
  assert.deepEqual(database.requiredChecks, ['diff', 'db', 'test', 'svelte', 'build']);
  assert.equal(database.iterationGuidance.some((line) => /DB\/read-model behavioral test/.test(line)), true);
  assert.equal(database.checkpointGuidance.some((line) => /npm run validate:fast/.test(line)), true);
  assert.equal(database.checkpointGuidance.some((line) => /--compact/.test(line)), false);

  const schema = classifyChangedFiles(['src/lib/server/db/schema.js']);
  assert.deepEqual(schema.requiredChecks, ['diff', 'db', 'test', 'svelte', 'build']);
  assert.equal(schema.iterationGuidance.some((line) => /schema\/migration edit/.test(line)), true);
  assert.equal(schema.checkpointGuidance.some((line) => /npm run validate:fast/.test(line)), true);
});

test('mixed specific and generic application changes retain guidance for both owners', () => {
  const report = classifyChangedFiles(['src/routes/admin/cases/+page.svelte', 'src/lib/client/example.js']);
  assert.deepEqual(report.requiredChecks, ['diff', 'test', 'svelte', 'build']);
  assert.equal(report.iterationGuidance.some((line) => /presentation-only/.test(line) && /Vite HMR/.test(line)), true);
  assert.equal(report.iterationGuidance.some((line) => /broad handoff suite/.test(line)), true);
  assert.equal(report.checkpointGuidance.some((line) => /npm run check/.test(line)), true);
  assert.equal(report.checkpointGuidance.some((line) => /after a coherent batch/.test(line)), true);
  assert.equal(report.areas.includes('Admin / Svelte routes'), true);
  assert.equal(report.areas.includes('Application code'), true);
});

test('static assets keep checkpoint validation bounded to their actual build risk', () => {
  const report = classifyChangedFiles(['static/favicon.svg']);
  assert.deepEqual(report.requiredChecks, ['diff', 'build']);
  assert.equal(report.checkpointGuidance.some((line) => /npm run build/.test(line)), true);
  assert.equal(report.checkpointGuidance.some((line) => /validate:(?:fast|full)/.test(line)), false);
});

test('changed maintained tests get exact compact direct iteration commands from canonical maintained-test ownership', () => {
  const ordinary = classifyChangedFiles(['tests/example-flow.test.js']);
  assert.equal(ordinary.iterationGuidance.includes('Iteration: run changed test directly: npm test -- tests/example-flow.test.js'), true);
  assert.deepEqual(ordinary.requiredChecks, ['diff', 'test']);

  const tooling = classifyChangedFiles(['tools/slide-import-review/tests/core.test.js']);
  assert.equal(tooling.iterationGuidance.includes('Iteration: run changed test directly: npm test -- tools/slide-import-review/tests/core.test.js'), true);

  const unsupportedTypeScript = classifyChangedFiles(['tests/example-flow.test.ts']);
  assert.equal(unsupportedTypeScript.iterationGuidance.some((line) => line.includes('npm test -- tests/example-flow.test.ts')), false);
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

test('compact specialized output includes specialized checks in the handoff instruction without duplicating commands', () => {
  const report = classifyChangedFiles(['tools/slide-import-review/scripts/finalize.mjs']);
  const output = captureConsole(() => printCompactAgentChecksReport(report, 'fixture-base'));
  assert.deepEqual(report.specializedRequiredCommands, ['npm run slide-review:test', 'npm run slide-review:build']);
  assert.match(output, /Handoff: run every command under Required automated checks and Specialized required checks before final handoff\/review\./);
  for (const command of report.specializedRequiredCommands) {
    assert.equal(output.split(command).length - 1, 1, `${command} should be rendered exactly once`);
  }
});
