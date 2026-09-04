import { isStudyRunDistinctCaseTarget } from './study-run-size.js';

/** @typedef {{getItem:(key:string)=>string|null,setItem:(key:string,value:string)=>void,removeItem:(key:string)=>void}} PreviewRunStorage */

export const FSRS_PREVIEW_RUN_STORAGE_KEY = 'flash-cards:fsrs-preview-run:v2';
export const LEGACY_FSRS_PREVIEW_RUN_STORAGE_KEY = 'flash-cards:fsrs-preview-run:v1';

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}
function nullableString(value) {
  return value == null || nonEmptyString(value);
}
function nonNegativeInteger(value) {
  return Number.isInteger(value) && Number(value) >= 0;
}
function positiveInteger(value) {
  return Number.isInteger(value) && Number(value) >= 1;
}
function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}
function validRoute(route) {
  return exactKeys(route, ['routeType', 'routeId'])
    && (route.routeType === 'topic' || route.routeType === 'tag')
    && nonEmptyString(route.routeId);
}
function validSystemScope(system) {
  if (!system || typeof system !== 'object' || Array.isArray(system) || !nonEmptyString(system.systemId)) return false;
  if (system.mode === 'all') return exactKeys(system, ['systemId', 'mode']);
  return system.mode === 'routes'
    && exactKeys(system, ['systemId', 'mode', 'routes'])
    && Array.isArray(system.routes)
    && system.routes.length > 0
    && system.routes.every(validRoute);
}
function validScope(scope) {
  if (!exactKeys(scope, ['systems']) || !Array.isArray(scope.systems) || scope.systems.length === 0) return false;
  const seen = new Set();
  let prior = null;
  for (const system of scope.systems) {
    if (!validSystemScope(system) || seen.has(system.systemId)) return false;
    if (prior != null && prior.localeCompare(system.systemId) >= 0) return false;
    seen.add(system.systemId);
    prior = system.systemId;
  }
  return true;
}
function validCommonDescriptor(descriptor) {
  return Boolean(descriptor)
    && descriptor.version === 2
    && nonEmptyString(descriptor.userId)
    && nonEmptyString(descriptor.runId)
    && Number.isFinite(descriptor.runStartedAt)
    && validScope(descriptor.selectedScope)
    && nullableString(descriptor.currentReviewId)
    && isStudyRunDistinctCaseTarget(descriptor.distinctCaseTarget);
}
function validSchedulerBoundary(boundary) {
  return Boolean(boundary)
    && nonNegativeInteger(boundary.generation)
    && nonNegativeInteger(boundary.reviewSequenceEpoch)
    && nonNegativeInteger(boundary.parameterRevision)
    && nonNegativeInteger(boundary.schedulerRevision)
    && nonEmptyString(boundary.schedulerLibraryVersion);
}
function validDueEntry(entry) {
  return Boolean(entry)
    && nonEmptyString(entry.caseId)
    && positiveInteger(entry.stateRevision)
    && Number.isFinite(entry.dueAt)
    && nonNegativeInteger(entry.proofIndex);
}
function validNewEntry(entry) {
  return Boolean(entry) && nonEmptyString(entry.caseId) && nonNegativeInteger(entry.proofIndex);
}
function validRepeatEntry(entry) {
  return Boolean(entry)
    && nonEmptyString(entry.caseId)
    && positiveInteger(entry.stateRevision)
    && Number.isFinite(entry.dueAt)
    && nonEmptyString(entry.workProof);
}
function validCurrentWork(work) {
  if (!work || !['due', 'new', 'repeat'].includes(work.queueClass) || !nonEmptyString(work.caseId)) return false;
  if (work.queueClass === 'new') return work.stateRevision == null && work.dueAt == null;
  return positiveInteger(work.stateRevision) && Number.isFinite(work.dueAt);
}
function validScheduledDescriptor(descriptor) {
  if (
    !validCommonDescriptor(descriptor)
    || descriptor.kind !== 'scheduled'
    || !nonEmptyString(descriptor.scopeFingerprint)
    || !nonEmptyString(descriptor.runBoundaryToken)
    || !validSchedulerBoundary(descriptor.schedulerBoundary)
    || !['due_first', 'new_first'].includes(descriptor.scheduledOrder)
    || !Array.isArray(descriptor.capturedDue)
    || !descriptor.capturedDue.every(validDueEntry)
    || !Array.isArray(descriptor.capturedNew)
    || !descriptor.capturedNew.every(validNewEntry)
    || !Array.isArray(descriptor.repeatEntries)
    || !descriptor.repeatEntries.every(validRepeatEntry)
    || !Array.isArray(descriptor.completedCaseIds)
    || !descriptor.completedCaseIds.every(nonEmptyString)
    || !descriptor.membershipProofs
    || descriptor.membershipProofs.version !== 2
    || !positiveInteger(descriptor.membershipProofs.chunkSize)
    || !Array.isArray(descriptor.membershipProofs.due)
    || !descriptor.membershipProofs.due.every(nonEmptyString)
    || !Array.isArray(descriptor.membershipProofs.new)
    || !descriptor.membershipProofs.new.every(nonEmptyString)
    || !nonNegativeInteger(descriptor.duePosition)
    || !nonNegativeInteger(descriptor.newPosition)
    || descriptor.duePosition > descriptor.capturedDue.length
    || descriptor.newPosition > descriptor.capturedNew.length
    || !nonNegativeInteger(descriptor.consecutiveNewCompleted)
  ) return false;
  if (descriptor.currentReviewId == null) return descriptor.currentWork == null;
  return validCurrentWork(descriptor.currentWork);
}
function validFreeDescriptor(descriptor) {
  if (
    !validCommonDescriptor(descriptor)
    || descriptor.kind !== 'free'
    || !Array.isArray(descriptor.bag)
    || !descriptor.bag.every(nonEmptyString)
    || !nonNegativeInteger(descriptor.position)
    || descriptor.position > descriptor.bag.length
  ) return false;
  return descriptor.currentReviewId == null || descriptor.position < descriptor.bag.length;
}

export function isFsrsPreviewRunDescriptor(descriptor) {
  return validScheduledDescriptor(descriptor) || validFreeDescriptor(descriptor);
}
export function isFsrsPreviewRunOwnedBy(descriptor, userId) {
  return isFsrsPreviewRunDescriptor(descriptor) && nonEmptyString(userId) && descriptor.userId === userId;
}

function retireLegacyState(storage) {
  storage.removeItem(LEGACY_FSRS_PREVIEW_RUN_STORAGE_KEY);
}

export function readFsrsPreviewRun(storage) {
  // v1 state is intentionally disposable under the clean v2 cutover contract.
  retireLegacyState(storage);
  const raw = storage.getItem(FSRS_PREVIEW_RUN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const descriptor = JSON.parse(raw);
    if (isFsrsPreviewRunDescriptor(descriptor)) return descriptor;
  } catch {
    // Malformed local preview state is disposable browser state.
  }
  storage.removeItem(FSRS_PREVIEW_RUN_STORAGE_KEY);
  return null;
}
export function readFsrsPreviewRunForUser(storage, userId) {
  const descriptor = readFsrsPreviewRun(storage);
  if (!descriptor) return null;
  if (isFsrsPreviewRunOwnedBy(descriptor, userId)) return descriptor;
  storage.removeItem(FSRS_PREVIEW_RUN_STORAGE_KEY);
  return null;
}
export function writeFsrsPreviewRun(storage, descriptor) {
  if (!isFsrsPreviewRunDescriptor(descriptor)) throw new TypeError('FSRS preview run descriptor is invalid.');
  retireLegacyState(storage);
  storage.setItem(FSRS_PREVIEW_RUN_STORAGE_KEY, JSON.stringify(descriptor));
  return descriptor;
}
export function clearFsrsPreviewRun(storage) {
  storage.removeItem(FSRS_PREVIEW_RUN_STORAGE_KEY);
  retireLegacyState(storage);
}
