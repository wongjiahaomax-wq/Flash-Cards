import { StudyRunPlanningError } from './study-run-planner.js';

// Browser-local Scheduled run descriptors intentionally have a finite support
// envelope. Route count is bounded independently of unique Case count because
// overlapping normalized Topic/Tag routes can add scope metadata without adding
// unique captured work.
export const MAX_SCHEDULED_STUDY_ROUTES = 512;

/** @param {number} routeCount */
export function assertScheduledStudyRouteCount(routeCount) {
  if (!Number.isInteger(routeCount) || routeCount < 0) {
    throw new StudyRunPlanningError('invalid-input', 'Scheduled Study route count must be a non-negative integer.');
  }
  if (routeCount > MAX_SCHEDULED_STUDY_ROUTES) {
    throw new StudyRunPlanningError(
      'selection-too-large',
      `Scheduled Study supports at most ${MAX_SCHEDULED_STUDY_ROUTES.toLocaleString('en-US')} normalized Topic/Tag routes. Narrow the selection before starting the run.`
    );
  }
}
