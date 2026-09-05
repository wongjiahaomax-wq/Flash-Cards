import {
  planFreeMultiSystemStudyRun,
  planScheduledMultiSystemStudyRun
} from '../db/study-run-planning.js';
import { StudyNavigationInputError } from '../db/study-navigation.ts';
import { StudyRunPlanningError } from './study-run-planner.js';
import {
  MultiSystemStudyScopeError,
  type MultiSystemStudySystemScope
} from './multi-system-study-scope.ts';
import {
  SystemStudySelectionError,
  type SystemStudySelectionRoute
} from './system-study-routes.ts';
import { parseStudyRunDistinctCaseTarget } from '../../study-run-size.js';

export type StudyRunMode = 'scheduled' | 'free';

export type SubmittedStudySystemFormState = {
  systemId: string;
  mode: 'all' | 'routes';
  selectedRoutes: string[];
};

export type PlanSystemStudyFormState = {
  message: string;
  systemId: string;
  selectedRoutes: string[];
  selectedSystems: SubmittedStudySystemFormState[];
  studyMode: string;
  runSize: string;
};

type PlannedDescriptor = (
  | Awaited<ReturnType<typeof planScheduledMultiSystemStudyRun>>
  | Awaited<ReturnType<typeof planFreeMultiSystemStudyRun>>
) & { distinctCaseTarget: 5 | 10 | 20 | null };

export type PlanSystemStudyResult =
  | { ok: true; descriptor: PlannedDescriptor }
  | { ok: false; status: 400; form: PlanSystemStudyFormState };

export class StudyRunFormInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudyRunFormInputError';
  }
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringValues(values: FormDataEntryValue[]) {
  if (values.some((value) => typeof value !== 'string')) {
    throw new StudyRunFormInputError('Study selections must be text values.');
  }
  return values.map((value) => String(value));
}

function parseRouteValue(value: string): SystemStudySelectionRoute | null {
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  const routeType = value.slice(0, separator).trim();
  const routeId = value.slice(separator + 1).trim();
  if ((routeType !== 'topic' && routeType !== 'tag') || !routeId) return null;
  return { routeType, routeId };
}

function rawSubmittedSystems(formData: FormData): SubmittedStudySystemFormState[] {
  const modernValues = formData.getAll('system').filter((value): value is string => typeof value === 'string');
  if (modernValues.length > 0) {
    return modernValues.map((rawSystemId) => {
      const systemId = rawSystemId.trim();
      const narrowed = formData.get(`narrow:${systemId}`) === 'on';
      const selectedRoutes = formData.getAll(`route:${systemId}`)
        .filter((value): value is string => typeof value === 'string');
      return { systemId, mode: narrowed ? 'routes' : 'all', selectedRoutes };
    });
  }

  const systemId = stringValue(formData.get('systemId'));
  if (!systemId) return [];
  return [{
    systemId,
    mode: 'routes',
    selectedRoutes: formData.getAll('route').filter((value): value is string => typeof value === 'string')
  }];
}

export function planSystemStudyFormState(formData: FormData): Omit<PlanSystemStudyFormState, 'message'> {
  const selectedSystems = rawSubmittedSystems(formData);
  const legacySystemId = stringValue(formData.get('systemId'));
  const legacyRoutes = formData.getAll('route').filter((value): value is string => typeof value === 'string');
  const studyMode = stringValue(formData.get('studyMode'));
  const submittedRunSize = stringValue(formData.get('runSize')).toLowerCase();
  return {
    systemId: legacySystemId || selectedSystems[0]?.systemId || '',
    selectedRoutes: legacyRoutes.length > 0 ? legacyRoutes : selectedSystems[0]?.selectedRoutes ?? [],
    selectedSystems,
    studyMode,
    runSize: submittedRunSize || '10'
  };
}

/**
 * Parse only the browser-requested v2 System scope. The returned scope is still
 * untrusted: resolveMultiSystemStudySelection inside the planner/count owner
 * performs the authoritative normalization, taxonomy validation and candidate
 * union/deduplication.
 *
 * The legacy single-System form encoding remains accepted for /fsrs-preview and
 * is translated into one v2 routes-mode System entry.
 */
export function parseMultiSystemStudyScopeFromForm(formData: FormData): MultiSystemStudySystemScope[] {
  const rawModernSystems = formData.getAll('system');
  if (rawModernSystems.length > 0) {
    const submittedSystemIds = stringValues(rawModernSystems);
    return submittedSystemIds.map((rawSystemId) => {
      const systemId = rawSystemId.trim();
      if (!systemId) throw new StudyRunFormInputError('A selected study System is missing its id.');
      if (formData.get(`narrow:${systemId}`) !== 'on') {
        return { systemId, mode: 'all' as const };
      }
      const rawRoutes = stringValues(formData.getAll(`route:${systemId}`));
      if (rawRoutes.length === 0) {
        throw new StudyRunFormInputError(`Select at least one Topic or curated Tag when narrowing System ${systemId}.`);
      }
      const routes: SystemStudySelectionRoute[] = [];
      for (const value of rawRoutes) {
        const route = parseRouteValue(value);
        if (!route) throw new StudyRunFormInputError('Study selections must use Topic or curated Tag values.');
        routes.push(route);
      }
      return { systemId, mode: 'routes' as const, routes };
    });
  }

  const systemId = stringValue(formData.get('systemId'));
  if (!systemId) throw new StudyRunFormInputError('Select at least one study System.');
  const rawRoutes = stringValues(formData.getAll('route'));
  if (rawRoutes.length === 0) {
    throw new StudyRunFormInputError('Select at least one Topic or curated Tag.');
  }
  const routes: SystemStudySelectionRoute[] = [];
  for (const value of rawRoutes) {
    const route = parseRouteValue(value);
    if (!route) throw new StudyRunFormInputError('Study selections must use Topic or curated Tag values.');
    routes.push(route);
  }
  return [{ systemId, mode: 'routes', routes }];
}

function failure(
  message: string,
  state: Omit<PlanSystemStudyFormState, 'message'>
): PlanSystemStudyResult {
  return { ok: false, status: 400, form: { message, ...state } };
}

function isExpectedPlanningError(cause: unknown) {
  return cause instanceof StudyRunFormInputError
    || cause instanceof MultiSystemStudyScopeError
    || cause instanceof SystemStudySelectionError
    || cause instanceof StudyNavigationInputError
    || cause instanceof StudyRunPlanningError;
}

/**
 * Shared learner planning boundary. Modern /study submits one or more Systems;
 * legacy /fsrs-preview single-System forms remain a valid v2 special case.
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
  const state = planSystemStudyFormState(input.formData);
  let distinctCaseTarget: 5 | 10 | 20 | null;
  try {
    distinctCaseTarget = parseStudyRunDistinctCaseTarget(state.runSize);
  } catch (cause) {
    return failure(cause instanceof Error ? cause.message : 'Choose a valid run size.', state);
  }
  state.runSize = distinctCaseTarget == null ? 'all' : String(distinctCaseTarget);

  if (state.studyMode !== 'scheduled' && state.studyMode !== 'free') {
    return failure('Choose Scheduled Study or Free Study.', state);
  }

  try {
    const systems = parseMultiSystemStudyScopeFromForm(input.formData);
    const descriptor = state.studyMode === 'scheduled'
      ? await planScheduledMultiSystemStudyRun({
        db: input.db,
        userId: input.userId,
        systems,
        proofSecret: input.proofSecret ?? '',
        now: input.now,
        rng: input.rng,
        runId: input.runId
      })
      : await planFreeMultiSystemStudyRun({
        db: input.db,
        userId: input.userId,
        systems,
        now: input.now,
        rng: input.rng,
        runId: input.runId
      });
    return { ok: true, descriptor: { ...descriptor, distinctCaseTarget } as PlannedDescriptor };
  } catch (cause) {
    if (isExpectedPlanningError(cause)) {
      return failure(cause instanceof Error ? cause.message : 'Unable to plan this Study run.', state);
    }
    throw cause;
  }
}
