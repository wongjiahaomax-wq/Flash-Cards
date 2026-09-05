import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import localTestReporter from '../scripts/local-test-reporter.mjs';
import { ciCommandArgs } from '../scripts/validate-ci.mjs';
import { parseValidationArgs } from '../scripts/validate.mjs';

/** @param {any[]} events */
async function collectReporter(events) {
  async function* source() {
    for (const event of events) yield event;
  }

  let output = '';
  for await (const chunk of localTestReporter(source())) output += chunk;
  return output;
}

function repeatedFailureData() {
  return {
    name: 'repeated failure',
    file: path.join(process.cwd(), 'tests', 'repeated.test.js'),
    line: 9,
    column: 1,
    details: { type: 'test', error: new Error('same failure identity') },
  };
}

test('ordinary CI explicitly keeps the verbose build presentation', () => {
  assert.deepEqual(ciCommandArgs('build', ['run', 'build']), ['run', 'build:verbose']);
});

test('validation rejects contradictory presentation flags in either order', () => {
  assert.throws(
    () => parseValidationArgs(['full', '--compact', '--verbose']),
    /Contradictory validation presentation flags: --compact and --verbose\./,
  );
  assert.throws(
    () => parseValidationArgs(['full', '--verbose', '--compact']),
    /Contradictory validation presentation flags: --compact and --verbose\./,
  );
});

test('local reporter counts omitted unique identities rather than repeated failures', async () => {
  const failures = Array.from({ length: 25 }, () => repeatedFailureData());
  const events = failures.map((data) => ({ type: 'test:fail', data }));
  events.push({
    type: 'test:summary',
    data: {
      counts: { tests: 25, passed: 0, failed: 25, skipped: 0, todo: 0, cancelled: 0 },
      duration_ms: 10,
    },
  });

  const output = await collectReporter(events);
  assert.match(output, /20 additional failures omitted from detailed output\./);
  assert.match(output, /Additional failing identities \(up to 10\):/);
  assert.equal(
    (output.match(/^- tests\/repeated\.test\.js:9:1 — repeated failure$/gm) ?? []).length,
    1,
  );
  assert.doesNotMatch(output, /additional identities not listed\./);
});
