import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  MAX_SCHEDULED_STUDY_ROUTES,
  assertScheduledStudyRouteCount
} from '../src/lib/server/learning/study-run-envelope.js';
import { StudyRunPlanningError } from '../src/lib/server/learning/study-run-planner.js';

test('Scheduled route limit accepts MAX_ROUTES and rejects MAX_ROUTES + 1', () => {
  assert.doesNotThrow(() => assertScheduledStudyRouteCount(MAX_SCHEDULED_STUDY_ROUTES));
  assert.throws(
    () => assertScheduledStudyRouteCount(MAX_SCHEDULED_STUDY_ROUTES + 1),
    (error) =>
      error instanceof StudyRunPlanningError
      && error.code === 'selection-too-large'
      && error.message.includes(String(MAX_SCHEDULED_STUDY_ROUTES))
  );
});

test('Scheduled route envelope is checked on normalized routes before learner bootstrap', () => {
  const source = readFileSync(
    new URL('../src/lib/server/db/study-run-planning.js', import.meta.url),
    'utf8'
  );
  const routeGuard = source.indexOf('assertScheduledStudyRouteCount(selection.routes.length);');
  const bootstrap = source.indexOf('ensureLearnerFsrsProfile(input.db, input.userId)');

  assert.ok(routeGuard >= 0, 'expected normalized-route guard in Scheduled planning');
  assert.ok(bootstrap >= 0, 'expected learner profile bootstrap in Scheduled planning');
  assert.ok(routeGuard < bootstrap, 'normalized-route guard must run before learner bootstrap');
});
