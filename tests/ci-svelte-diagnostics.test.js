import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSvelteMachineOutput } from '../scripts/ci-svelte-diagnostics.mjs';
import {
  ciCommandArgs,
  formatSvelteDiagnosticRecord,
  formatSvelteFailureSummary,
  githubSvelteDiagnosticAnnotation,
} from '../scripts/validate-ci.mjs';

const START = '1590680325583 START "/workspace/flash-cards"';
const COMPLETED = '1590680326807 COMPLETED 20 FILES 1 ERRORS 1 WARNINGS 2 FILES_WITH_PROBLEMS';

function machineRecord(timestamp, payload) {
  return `${timestamp} ${JSON.stringify(payload)}`;
}

test('pinned svelte-check machine-verbose records normalize zero-based coordinates to one-based positions', () => {
  const output = [
    START,
    machineRecord(1590680326283, {
      type: 'ERROR',
      filename: 'src/routes/+page.svelte',
      start: { line: 0, character: 0 },
      end: { line: 0, character: 5 },
      message: "Cannot find module 'blubb' or its corresponding type declarations.",
      code: 2307,
      source: 'js',
    }),
    machineRecord(1590680326284, {
      type: 'WARNING',
      filename: 'src/lib/Card.svelte',
      start: { line: 7, character: 12 },
      end: { line: 7, character: 27 },
      message: 'Component has unused export property.',
      code: 'unused-export-let',
      source: 'svelte',
    }),
    COMPLETED,
  ].join('\n');

  const parsed = parseSvelteMachineOutput(output);
  assert.equal(parsed.protocolStarted, true);
  assert.equal(parsed.workspace, '/workspace/flash-cards');
  assert.deepEqual(parsed.completion, {
    files: 20,
    errors: 1,
    warnings: 1,
    filesWithProblems: 2,
  });
  assert.deepEqual(parsed.diagnostics[0], {
    severity: 'error',
    file: 'src/routes/+page.svelte',
    line: 1,
    column: 1,
    endLine: 1,
    endColumn: 6,
    message: "Cannot find module 'blubb' or its corresponding type declarations.",
    code: 2307,
    source: 'js',
  });
  assert.equal(parsed.diagnostics[1].line, 8);
  assert.equal(parsed.diagnostics[1].column, 13);
  assert.equal(parsed.diagnostics[1].code, 'unused-export-let');
});

test('machine parser preserves multiline and delimiter-heavy messages and normalizes path separators', () => {
  const parsed = parseSvelteMachineOutput([
    START,
    machineRecord(1, {
      type: 'ERROR',
      filename: 'src\\routes\\admin\\example.svelte',
      start: { line: 141, character: 17 },
      end: { line: 142, character: 2 },
      message: 'first line | 100%\nsecond line',
      code: 'css-unknownproperty',
      source: 'css',
    }),
    '2 COMPLETED 1 FILES 1 ERRORS 0 WARNINGS 1 FILES_WITH_PROBLEMS',
  ].join('\n'));

  assert.equal(parsed.diagnostics[0].file, 'src/routes/admin/example.svelte');
  assert.equal(parsed.diagnostics[0].line, 142);
  assert.equal(parsed.diagnostics[0].column, 18);
  assert.equal(parsed.diagnostics[0].endLine, 143);
  assert.equal(parsed.diagnostics[0].endColumn, 3);
  assert.equal(parsed.diagnostics[0].message, 'first line | 100%\nsecond line');
  assert.equal(parsed.diagnostics[0].source, 'css');
});

test('machine parser handles multiple files, lifecycle failure, malformed diagnostics, and valid non-diagnostic JSON safely', () => {
  const parsed = parseSvelteMachineOutput([
    'svelte-kit sync prelude',
    START,
    machineRecord(2, {
      type: 'ERROR',
      filename: 'src/a.svelte',
      start: { line: 1, character: 2 },
      end: { line: 1, character: 3 },
      message: 'one',
      source: 'svelte',
    }),
    '3 {"type":"ERROR","filename":"src/b.svelte",',
    machineRecord(4, { type: 'INFO', message: 'not a diagnostic' }),
    machineRecord(5, {
      type: 'WARNING',
      filename: 'src/b.svelte',
      start: { line: 4, character: 5 },
      end: { line: 4, character: 6 },
      message: 'two',
      source: 'css',
    }),
    '6 FAILURE "Connection closed"',
  ].join('\n'));

  assert.equal(parsed.diagnostics.length, 2);
  assert.equal(parsed.malformedDiagnosticRecords, 1);
  assert.equal(parsed.failure, 'Connection closed');
  assert.equal(parsed.completion, null);
});

test('CI requests machine-verbose output only for the existing logical svelte command', () => {
  assert.deepEqual(ciCommandArgs('svelte', ['run', 'check']), [
    'run',
    'check',
    '--',
    '--output',
    'machine-verbose',
  ]);
  assert.deepEqual(ciCommandArgs('build', ['run', 'build']), ['run', 'build']);
});

test('connector and GitHub records share normalized positions and escape unsafe values', () => {
  const diagnostic = {
    severity: 'error',
    file: 'src/routes/a,b:100%.svelte',
    line: 1,
    column: 1,
    endLine: 1,
    endColumn: 9,
    source: 'js',
    code: 'TS|2322%',
    message: 'bad | value 100%\r\nnext line',
  };

  assert.equal(
    formatSvelteDiagnosticRecord(diagnostic),
    'CI_ERROR|check=svelte|file=src/routes/a,b:100%25.svelte|line=1|column=1|endLine=1|endColumn=9|severity=error|source=js|code=TS%7C2322%25|message=bad %7C value 100%25%0D%0Anext line',
  );

  const annotation = githubSvelteDiagnosticAnnotation(diagnostic);
  assert.match(annotation, /^::error file=src\/routes\/a%2Cb%3A100%25\.svelte,line=1,col=1,title=Svelte check js TS\|2322%25::/);
  assert.equal(annotation.includes('\n'), false);
});

test('detailed Svelte failure summary owns real diagnostics without adding a generic CI_ERROR', () => {
  const parsed = parseSvelteMachineOutput([
    START,
    machineRecord(2, {
      type: 'ERROR',
      filename: 'src/a.svelte',
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
      message: 'real error',
      code: 2322,
      source: 'js',
    }),
    machineRecord(3, {
      type: 'WARNING',
      filename: 'src/a.svelte',
      start: { line: 2, character: 3 },
      end: { line: 2, character: 4 },
      message: 'warning only',
      code: 'unused-export-let',
      source: 'svelte',
    }),
    '4 COMPLETED 1 FILES 1 ERRORS 1 WARNINGS 1 FILES_WITH_PROBLEMS',
  ].join('\n'));

  const summary = formatSvelteFailureSummary(parsed, 1);
  assert.equal((summary.match(/^CI_ERROR\|/gm) ?? []).length, 1);
  assert.match(summary, /^CI_ERROR\|check=svelte\|file=src\/a\.svelte\|line=1\|column=1\|/m);
  assert.match(summary, /^CI_REPRO\|check=svelte\|command=npm run check$/m);
  assert.match(summary, /^CI_STATUS\|check=svelte\|status=failed\|exit=1\|errors=1\|warnings=1$/m);
  assert.equal(summary.includes('warning only'), false);
});

test('warning-only protocol data remains non-failing presentation data', () => {
  const parsed = parseSvelteMachineOutput([
    START,
    machineRecord(2, {
      type: 'WARNING',
      filename: 'src/a.svelte',
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
      message: 'warning',
      code: 'unused-export-let',
      source: 'svelte',
    }),
    '3 COMPLETED 1 FILES 0 ERRORS 1 WARNINGS 1 FILES_WITH_PROBLEMS',
  ].join('\n'));

  assert.equal(parsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
  assert.equal(formatSvelteFailureSummary(parsed, 0), null);
});

test('nonzero runs with no parsed error remain eligible for generic stage fallback', () => {
  for (const output of [
    'svelte-kit sync failed before machine diagnostics',
    [START, '2 {"type":"ERROR","filename":'].join('\n'),
    [START, '2 FAILURE "Connection closed"'].join('\n'),
  ]) {
    const parsed = parseSvelteMachineOutput(output);
    assert.equal(formatSvelteFailureSummary(parsed, 1), null);
  }
});
