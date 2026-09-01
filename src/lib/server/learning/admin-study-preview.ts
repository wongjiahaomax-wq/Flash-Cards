import { systemStudyNavigationEnabled } from './system-review-navigation.ts';
import { isProductionAdmin } from '../preview-auth.js';

/**
 * Production Admin may continue a selection-based System Review while the
 * learner rollout flag is off. The bypass is tied to role + persisted Review
 * provenance, never to a public query parameter or client-provided marker.
 *
 * @param {{
 *   user: { role?: unknown } | null | undefined,
 *   env: { SYSTEM_STUDY_NAVIGATION_ENABLED?: string } | null | undefined,
 *   studySelectionId: string | null | undefined
 * }} input
 */
export function canUseAdminStudySelectionPreview({ user, env, studySelectionId }) {
  return Boolean(studySelectionId)
    && isProductionAdmin(user)
    && !systemStudyNavigationEnabled(env);
}
