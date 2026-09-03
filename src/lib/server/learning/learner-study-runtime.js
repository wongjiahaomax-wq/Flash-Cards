import {
  isLearnerStudyRunDescriptor,
  isLearnerStudyRunOwnedBy
} from '../../learner-study-run-storage.js';
import { isPreviewOnlyAdmin, isPreviewWorker } from '../preview-auth.js';

/** @param {App.Locals['user']} user @param {App.Platform['env'] | undefined} env */
export function learnerStudyAccessError(user, env) {
  if (isPreviewWorker(env) || isPreviewOnlyAdmin(user)) {
    return { status: 403, message: 'Learner Study is unavailable for Preview-only Admin.' };
  }
  if (!user) return { status: 401, message: 'Authentication required.' };
  return null;
}

/** @param {App.Platform['env'] | undefined} env */
export function learnerStudyProofSecret(env) {
  const secret = String(env?.BETTER_AUTH_SECRET ?? '');
  if (secret.length < 32) {
    throw new Error('Learner Study proof signing is not configured.');
  }
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
    return {
      ok: false,
      status: 400,
      message: 'Study run descriptor is invalid or unsupported.'
    };
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
