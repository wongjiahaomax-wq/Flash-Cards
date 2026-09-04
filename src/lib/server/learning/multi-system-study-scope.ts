import {
  normalizeSystemStudySelectionRoutes,
  resolveSystemStudyCandidates,
  resolveSystemStudySelectionCandidates,
  type SystemNavigationInput,
  type SystemStudyCandidate,
  type SystemStudySelectionRoute
} from './system-study-routes.ts';
import { systemAncestorId } from './taxonomy-graph.ts';

export const MULTI_SYSTEM_SCOPE_VERSION = 2;
export const MAX_MULTI_SYSTEM_RAW_SYSTEMS = 64;
export const MAX_MULTI_SYSTEM_RAW_ROUTES = 512;
export const MAX_MULTI_SYSTEM_IDENTIFIER_LENGTH = 128;

export type MultiSystemStudySystemScope =
  | { systemId: string; mode: 'all' }
  | { systemId: string; mode: 'routes'; routes: SystemStudySelectionRoute[] };

export type MultiSystemStudyRunScope = {
  systems: MultiSystemStudySystemScope[];
};

export type MultiSystemStudyContribution = {
  systemId: string;
  mode: 'all' | 'routes';
  routeType: 'topic' | 'tag';
  routeId: string;
  nativePrimaryTopic: boolean;
};

export type MultiSystemStudyCandidate = SystemStudyCandidate & {
  attributionSystemId: string;
  contributingSystemIds: string[];
  contributions: MultiSystemStudyContribution[];
};

export type MultiSystemStudyScopeErrorCode =
  | 'invalid-scope'
  | 'too-many-systems'
  | 'too-many-routes'
  | 'invalid-identifier'
  | 'duplicate-system'
  | 'invalid-system'
  | 'invalid-mode';

export class MultiSystemStudyScopeError extends Error {
  readonly code: MultiSystemStudyScopeErrorCode;

  constructor(code: MultiSystemStudyScopeErrorCode, message: string) {
    super(message);
    this.name = 'MultiSystemStudyScopeError';
    this.code = code;
  }
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

function identifier(value: unknown, label: string) {
  if (typeof value !== 'string') {
    throw new MultiSystemStudyScopeError('invalid-identifier', `${label} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_MULTI_SYSTEM_IDENTIFIER_LENGTH) {
    throw new MultiSystemStudyScopeError(
      'invalid-identifier',
      `${label} must contain 1-${MAX_MULTI_SYSTEM_IDENTIFIER_LENGTH} characters.`
    );
  }
  return normalized;
}

/**
 * Cheap, taxonomy-independent validation. This deliberately runs before loading
 * the navigation snapshot so duplicate/oversized raw input cannot trigger
 * expensive taxonomy traversal or candidate resolution.
 */
export function assertRawMultiSystemStudyScopeInput(input: unknown): asserts input is readonly unknown[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new MultiSystemStudyScopeError('invalid-scope', 'Select at least one study System.');
  }
  if (input.length > MAX_MULTI_SYSTEM_RAW_SYSTEMS) {
    throw new MultiSystemStudyScopeError(
      'too-many-systems',
      `Study scope supports at most ${MAX_MULTI_SYSTEM_RAW_SYSTEMS} System entries.`
    );
  }

  const systems = new Set<string>();
  let routeCount = 0;
  for (const rawEntry of input) {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      throw new MultiSystemStudyScopeError('invalid-scope', 'Each System scope must be an object.');
    }
    const entry = rawEntry as Record<string, unknown>;
    const systemId = identifier(entry.systemId, 'System ID');
    if (systems.has(systemId)) {
      throw new MultiSystemStudyScopeError(
        'duplicate-system',
        `System ${systemId} was submitted more than once; ambiguous duplicate System entries are not accepted.`
      );
    }
    systems.add(systemId);

    if (entry.mode === 'all') {
      if (!exactKeys(entry, ['systemId', 'mode'])) {
        throw new MultiSystemStudyScopeError(
          'invalid-scope',
          'Whole-System scope must contain exactly systemId and mode; routes are not valid with mode=all.'
        );
      }
      continue;
    }
    if (entry.mode !== 'routes') {
      throw new MultiSystemStudyScopeError('invalid-mode', 'System scope mode must be all or routes.');
    }
    if (!exactKeys(entry, ['systemId', 'mode', 'routes']) || !Array.isArray(entry.routes) || entry.routes.length === 0) {
      throw new MultiSystemStudyScopeError(
        'invalid-scope',
        'Routes mode requires a non-empty routes array and no contradictory scope fields.'
      );
    }
    routeCount += entry.routes.length;
    if (routeCount > MAX_MULTI_SYSTEM_RAW_ROUTES) {
      throw new MultiSystemStudyScopeError(
        'too-many-routes',
        `Study scope supports at most ${MAX_MULTI_SYSTEM_RAW_ROUTES} raw Topic/Tag routes.`
      );
    }
    for (const rawRoute of entry.routes) {
      if (!rawRoute || typeof rawRoute !== 'object' || Array.isArray(rawRoute)) {
        throw new MultiSystemStudyScopeError('invalid-scope', 'Each study route must be an object.');
      }
      const route = rawRoute as Record<string, unknown>;
      if (!exactKeys(route, ['routeType', 'routeId'])) {
        throw new MultiSystemStudyScopeError('invalid-scope', 'Study routes contain unsupported or contradictory fields.');
      }
      if (route.routeType !== 'topic' && route.routeType !== 'tag') {
        throw new MultiSystemStudyScopeError('invalid-scope', 'Study routes must be Topic or curated Tag routes.');
      }
      identifier(route.routeId, 'Route ID');
    }
  }
}

function activeSystemExists(systemId: string, input: SystemNavigationInput) {
  return input.concepts.some(
    (concept) => concept.id === systemId && concept.kind === 'system' && concept.isActive !== false
  );
}

export function normalizeMultiSystemStudyRunScope(
  input: SystemNavigationInput & { systems: readonly unknown[] }
): MultiSystemStudyRunScope {
  assertRawMultiSystemStudyScopeInput(input.systems);

  const systems = input.systems.map((rawEntry) => {
    const entry = rawEntry as Record<string, unknown>;
    const systemId = identifier(entry.systemId, 'System ID');
    if (!activeSystemExists(systemId, input)) {
      throw new MultiSystemStudyScopeError('invalid-system', `System ${systemId} is missing or inactive.`);
    }
    if (entry.mode === 'all') {
      return { systemId, mode: 'all' as const };
    }
    const routes = normalizeSystemStudySelectionRoutes({
      ...input,
      systemId,
      routes: entry.routes as { routeType: string; routeId: string }[]
    });
    return { systemId, mode: 'routes' as const, routes };
  });

  systems.sort((left, right) => left.systemId.localeCompare(right.systemId));
  return { systems };
}

function contributionFor(
  system: MultiSystemStudySystemScope,
  candidate: SystemStudyCandidate,
  nodes: SystemNavigationInput['concepts']
): MultiSystemStudyContribution {
  const routeId = candidate.routeType === 'topic'
    ? candidate.studyConceptId
    : String(candidate.studyTagId ?? '');
  return {
    systemId: system.systemId,
    mode: system.mode,
    routeType: candidate.routeType,
    routeId,
    nativePrimaryTopic:
      candidate.routeType === 'topic'
      && systemAncestorId(candidate.primaryConceptId, nodes) === system.systemId
  };
}

function compareContributions(left: MultiSystemStudyContribution, right: MultiSystemStudyContribution) {
  if (left.nativePrimaryTopic !== right.nativePrimaryTopic) return left.nativePrimaryTopic ? -1 : 1;
  return left.systemId.localeCompare(right.systemId)
    || (left.routeType === right.routeType ? 0 : left.routeType === 'topic' ? -1 : 1)
    || left.routeId.localeCompare(right.routeId);
}

export function resolveMultiSystemStudySelectionCandidates(
  input: SystemNavigationInput & { runScope: MultiSystemStudyRunScope }
): MultiSystemStudyCandidate[] {
  const contributionsByCase = new Map<string, Array<{ candidate: SystemStudyCandidate; contribution: MultiSystemStudyContribution }>>();

  for (const system of input.runScope.systems) {
    const candidates = system.mode === 'all'
      ? resolveSystemStudyCandidates({ ...input, systemId: system.systemId, routeType: 'all' })
      : resolveSystemStudySelectionCandidates({ ...input, systemId: system.systemId, routes: system.routes });

    for (const candidate of candidates) {
      const rows = contributionsByCase.get(candidate.id) ?? [];
      rows.push({ candidate, contribution: contributionFor(system, candidate, input.concepts) });
      contributionsByCase.set(candidate.id, rows);
    }
  }

  const result: MultiSystemStudyCandidate[] = [];
  for (const rows of contributionsByCase.values()) {
    rows.sort((left, right) => compareContributions(left.contribution, right.contribution));
    const chosen = rows[0];
    if (!chosen) continue;
    const contributions = rows.map((row) => row.contribution);
    const contributingSystemIds = [...new Set(contributions.map((item) => item.systemId))].sort();
    result.push({
      ...chosen.candidate,
      studySystemConceptId: chosen.contribution.systemId,
      attributionSystemId: chosen.contribution.systemId,
      contributingSystemIds,
      contributions
    });
  }
  return result.sort((left, right) => left.id.localeCompare(right.id));
}

export function totalNormalizedMultiSystemRouteCount(runScope: MultiSystemStudyRunScope) {
  return runScope.systems.reduce(
    (count, system) => count + (system.mode === 'routes' ? system.routes.length : 0),
    0
  );
}
