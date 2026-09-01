import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  FSRS_LIBRARY_VERSION,
  FSRS_SCHEDULER_REVISION
} from '../src/lib/server/learning/fsrs-scheduler.js';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

test('ts-fsrs dependency pin cannot drift from persisted scheduler metadata', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')
  );

  assert.equal(packageJson.dependencies?.['ts-fsrs'], FSRS_LIBRARY_VERSION);
  assert.equal(FSRS_LIBRARY_VERSION, '5.4.2');
  assert.equal(FSRS_SCHEDULER_REVISION, 1);
});
