import {
  planFreeSystemStudyRun,
  planScheduledSystemStudyRun
} from '../db/study-run-planning.js';
import { StudyNavigationInputError } from '../db/study-navigation.ts';
import { StudyRunPlanningError } from './study-run-planner.js';
import {
  SystemStudySelectionError,
  type SystemStudySelectionRoute
} from './system-study-routes.ts';
import { parseStudyRunDistinctCaseTarget } from '../../study-run-size.js';

export type StudyRunMode = 'scheduled' | 'free';

export type PlanSystemStudyFormState = {
  message: string;
  systemId: string;
  selectedRoutes: string[];
  studyMode: string;
  runSize: string;
};

type PlannedDescriptor = (
  | Awaited<ReturnType<typeof planScheduledSystemStudyRun>>
  | Awaited<ReturnType<typeof planFreeSystemStudyRun>>
) & { distinctCaseTarget: 5 | 10 | 20 | null };

export type PlanSystemStudyResult =
  | { ok: true; descriptor: PlannedDescriptor }
  | { ok: false; status: 400; form: PlanSystemStudyFormState };

function parseRouteValue(value: string): SystemStudySelectionRoute | null {
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  const routeType = value.slice(0, separator).trim();
  const routeId = value.slice(separator + 1).trim();
  if ((routeType !== 'topic' && routeType !== 'tag') || !routeId) return null;
  return { routeType, routeId };
}

function failure(
  message: string,
  state: Omit<PlanSystemStudyFormState, 'message'>
): PlanSystemStudyResult {
  return { ok: false, status: 400, form: { message, ...state } };
}

/**
 * Shared future route boundary for PR B descriptors. PR B deliberately does not
 * connect this owner to the normal learner Review runtime; the later active-
 * Review/cutover sequence owns that rollout.
 */
export async function planSystemStudyRunFromForm(input: {
  db: import('../db/index.js').LearningDb;
  userId: string;
  formData: FormData;
  proofSecret?: string;
  now?: Date | number | string;
  rng?: () => number;
  runId?: string;
}): Promise<PlanSystemStudyResult> {
  const systemValue = input.formData.get('systemId');
  const studyModeValue = input.formData.get('studyMode');
  const runSizeValue = input.formData.get('runSize');
  const submittedRouteValues = input.formData.getAll('route');
  const systemId = typeof systemValue === 'string' ? systemValue.trim() : '';
  const studyMode = typeof studyModeValue === 'string' ? studyModeValue.trim() : '';
  const submittedRunSize = typeof runSizeValue === 'string' ? runSizeValue.trim().toLowerCase() : '';
  const selectedRoutes = submittedRouteValues.filter((value): value is string => typeof value === 'string');
  let distinctCaseTarget: 5 | 10 | 20 | null;
  try {
    distinctCaseTarget = parseStudyRunDistinctCaseTarget(submittedRunSize);
  } catch (cause) {
    const runSize = submittedRunSize || '10';
    return failure(cause instanceof Error ? cause.message : 'Choose a valid run size.', {
      systemId,
      selectedRoutes,
      studyMode,
      runSize
    });
  }
  const runSize = distinctCaseTarget == null ? 'all' : String(distinctCaseTarget);
  const state = { systemId, selectedRoutes, studyMode, runSize };

  if (!systemId) return failure('A study System is required.', state);
  if (studyMode !== 'scheduled' && studyMode !== 'free') {
    return failure('Choose Scheduled Study or Free Study.', state);
  }
  if (selectedRoutes.length !== submittedRouteValues.length) {
    return failure('Study selections must use Topic or curated Tag values.', state);
  }
  if (selectedRoutes.length === 0) {
    return failure('Select at least one Topic or curated Tag.', state);
  }

  const routes: SystemStudySelectionRoute[] = [];
  for (const value of selectedRoutes) {
    const route = parseRouteValue(value);
    if (!route) return failure('Study selections must use Topic or curated Tag values.', state);
    routes.push(route);
  }

  try {
    const descriptor = studyMode === 'scheduled'
      ? await planScheduledSystemStudyRun({
        db: input.db,
        userId: input.userId,
        systemId,
        routes,
        proofSecret: input.proofSecret ?? '',
        now: input.now,
        rng: input.rng,
        runId: input.runId
      })
      : await planFreeSystemStudyRun({
        db: input.db,
        userId: input.userId,
        systemId,
        routes,
        now: input.now,
        rng: input.rng,
        runId: input.runId
      });
    return { ok: true, descriptor: { ...descriptor, distinctCaseTarget } as PlannedDescriptor };
  } catch (cause) {
    if (
      cause instanceof SystemStudySelectionError
      || cause instanceof StudyNavigationInputError
      || cause instanceof StudyRunPlanningError
    ) {
      return failure(cause.message, state);
    }
    throw cause;
  }
}
