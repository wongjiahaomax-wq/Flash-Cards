import type { SystemRouteType } from './system-study-routes.ts';

type SystemNavigationEnv = {
  SYSTEM_STUDY_NAVIGATION_ENABLED?: string;
} | null | undefined;

type ReviewRouteSnapshot = {
  studySystemConceptId: string | null;
  navigationRouteType?: SystemRouteType | null;
  navigationRouteId?: string | null;
  routeType: 'topic' | 'tag';
  studyTagId: string | null;
  studyConceptId: string;
};

export class SystemStudyNavigationDisabledError extends Error {
  constructor(message = 'System study navigation is currently disabled. Return to Study to choose a Topic.') {
    super(message);
    this.name = 'SystemStudyNavigationDisabledError';
  }
}

export function systemStudyNavigationEnabled(env: SystemNavigationEnv) {
  return env?.SYSTEM_STUDY_NAVIGATION_ENABLED === 'true';
}

/**
 * Reconstruct the learner-selected System navigation route for Next case.
 *
 * `routeType` / `studyTagId` / `studyConceptId` describe the effective route
 * that produced the current Case and control question provenance. The
 * navigation fields preserve the broader learner selection (for example All,
 * or a parent Topic whose Case resolved through a descendant Study Topic).
 */
export function resolveNextSystemStudyRoute(
  review: ReviewRouteSnapshot,
  systemNavigationEnabled: boolean
): { systemId: string; routeType: SystemRouteType; routeId: string | null } | null {
  if (!review.studySystemConceptId) return null;
  if (!systemNavigationEnabled) throw new SystemStudyNavigationDisabledError();

  const routeType = review.navigationRouteType ?? review.routeType;
  const fallbackRouteId = review.routeType === 'tag' ? review.studyTagId : review.studyConceptId;
  const routeId = review.navigationRouteType ? review.navigationRouteId ?? null : fallbackRouteId;

  if (routeType === 'all') {
    return { systemId: review.studySystemConceptId, routeType, routeId: null };
  }
  if (!routeId) throw new Error('Review System navigation provenance is incomplete.');
  return { systemId: review.studySystemConceptId, routeType, routeId };
}
