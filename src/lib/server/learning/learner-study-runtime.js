import {
  isLearnerStudyRunDescriptor,
  isLearnerStudyRunOwnedBy
} from '../../learner-study-run-storage.js';
import { isPreviewOnlyAdmin, isPreviewWorker } from '../preview-auth.js';

/** @param {App.Platform['env'] | undefined} env */
export function learnerStudyWriteFenceActive(env) {
  const value = String(env?.LEARNER_RUNTIME_WRITE_FENCE ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'on';
}

/**
 * During the one-time v2 cutover the Production workflow deploys the Worker with
 * LEARNER_RUNTIME_WRITE_FENCE=true. All learner /study entry points share this
 * access owner, so planning/open/resume/reveal/completion cannot race the zero-
 * data gate or migration. Read-only release checks use non-study health routes.
 * @param {App.Locals['user']} user
 * @param {App.Platform['env'] | undefined} env
 */
export function learnerStudyAccessError(user, env) {
  if (isPreviewWorker(env) || isPreviewOnlyAdmin(user)) {
    return { status: 403, message: 'Learner Study is unavailable for Preview-only Admin.' };
  }
  if (!user) return { status: 401, message: 'Authentication required.' };
  if (learnerStudyWriteFenceActive(env)) {
    return { status: 503, message: 'Learner Study is temporarily unavailable during a runtime cutover.' };
  }
  return null;
}

/** @param {App.Platform['env'] | undefined} env */
export function learnerStudyProofSecret(env) {
  const secret = String(env?.BETTER_AUTH_SECRET ?? '');
  if (secret.length < 32) throw new Error('Learner Study proof signing is not configured.');
  return secret;
}

/**
 * Browser run state is convenience state only. Structure and learner ownership
 * must be validated before active-Review lookup or mutation; the active-Review
 * writers then revalidate the signed workload and current server state.
 * @param {unknown} descriptor
 * @param {string} userId
 */
export function validateLearnerStudyRunOwner(descriptor, userId) {
  if (!isLearnerStudyRunDescriptor(descriptor)) {
    return { ok: false, status: 400, message: 'Study run descriptor is invalid or unsupported.' };
  }
  if (!isLearnerStudyRunOwnedBy(descriptor, userId)) {
    return {
      ok: false,
      status: 403,
      message: 'This Study run belongs to another learner. Start a new run for the signed-in account.'
    };
  }
  return { ok: true, descriptor };
}
