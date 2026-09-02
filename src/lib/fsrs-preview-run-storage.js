/** @typedef {{getItem:(key:string)=>string|null,setItem:(key:string,value:string)=>void,removeItem:(key:string)=>void}} PreviewRunStorage */

export const FSRS_PREVIEW_RUN_STORAGE_KEY = 'flash-cards:fsrs-preview-run:v1';

/** @param {unknown} value */
function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/** @param {unknown} value */
function nullableString(value) {
  return value == null || nonEmptyString(value);
}

/** @param {unknown} value */
function nonNegativeInteger(value) {
  return Number.isInteger(value) && Number(value) >= 0;
}

/** @param {unknown} value */
function positiveInteger(value) {
  return Number.isInteger(value) && Number(value) >= 1;
}

/** @param {any} route */
function validRoute(route) {
  return Boolean(route)
    && (route.routeType === 'topic' || route.routeType === 'tag')
    && nonEmptyString(route.routeId);
}

/** @param {any} scope */
function validScope(scope) {
  return Boolean(scope)
    && nonEmptyString(scope.systemId)
    && Array.isArray(scope.routes)
    && scope.routes.length > 0
    && scope.routes.every(validRoute);
}

/** @param {any} descriptor */
function validCommonDescriptor(descriptor) {
  return Boolean(descriptor)
    && descriptor.version === 1
    && nonEmptyString(descriptor.userId)
    && nonEmptyString(descriptor.runId)
    && Number.isFinite(descriptor.runStartedAt)
    && validScope(descriptor.selectedScope)
    && nullableString(descriptor.currentReviewId);
}

/** @param {any} boundary */
function validSchedulerBoundary(boundary) {
  return Boolean(boundary)
    && nonNegativeInteger(boundary.generation)
    && nonNegativeInteger(boundary.reviewSequenceEpoch)
    && nonNegativeInteger(boundary.parameterRevision)
    && nonNegativeInteger(boundary.schedulerRevision)
    && nonEmptyString(boundary.schedulerLibraryVersion);
}

/** @param {any} entry */
function validDueEntry(entry) {
  return Boolean(entry)
    && nonEmptyString(entry.caseId)
    && positiveInteger(entry.stateRevision)
    && Number.isFinite(entry.dueAt)
    && nonNegativeInteger(entry.proofIndex);
}

/** @param {any} entry */
function validNewEntry(entry) {
  return Boolean(entry)
    && nonEmptyString(entry.caseId)
    && nonNegativeInteger(entry.proofIndex);
}

/** @param {any} entry */
function validRepeatEntry(entry) {
  return Boolean(entry)
    && nonEmptyString(entry.caseId)
    && positiveInteger(entry.stateRevision)
    && Number.isFinite(entry.dueAt)
    && nonEmptyString(entry.workProof);
}

/** @param {any} work */
function validCurrentWork(work) {
  if (!work || !['due', 'new', 'repeat'].includes(work.queueClass) || !nonEmptyString(work.caseId)) return false;
  if (work.queueClass === 'new') return work.stateRevision == null && work.dueAt == null;
  return positiveInteger(work.stateRevision) && Number.isFinite(work.dueAt);
}

/** @param {any} descriptor */
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
    || descriptor.membershipProofs.version !== 1
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
  ) {
    return false;
  }

  if (descriptor.currentReviewId == null) return descriptor.currentWork == null;
  return validCurrentWork(descriptor.currentWork);
}

/** @param {any} descriptor */
function validFreeDescriptor(descriptor) {
  if (
    !validCommonDescriptor(descriptor)
    || descriptor.kind !== 'free'
    || !Array.isArray(descriptor.bag)
    || !descriptor.bag.every(nonEmptyString)
    || !nonNegativeInteger(descriptor.position)
    || descriptor.position > descriptor.bag.length
  ) {
    return false;
  }
  return descriptor.currentReviewId == null || descriptor.position < descriptor.bag.length;
}

/** @param {unknown} descriptor */
export function isFsrsPreviewRunDescriptor(descriptor) {
  return validScheduledDescriptor(descriptor) || validFreeDescriptor(descriptor);
}

/** @param {unknown} descriptor @param {unknown} userId */
export function isFsrsPreviewRunOwnedBy(descriptor, userId) {
  return isFsrsPreviewRunDescriptor(descriptor)
    && nonEmptyString(userId)
    && descriptor.userId === userId;
}

/** @param {PreviewRunStorage} storage */
export function readFsrsPreviewRun(storage) {
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

/** @param {PreviewRunStorage} storage @param {string} userId */
export function readFsrsPreviewRunForUser(storage, userId) {
  const descriptor = readFsrsPreviewRun(storage);
  if (!descriptor) return null;
  if (isFsrsPreviewRunOwnedBy(descriptor, userId)) return descriptor;
  storage.removeItem(FSRS_PREVIEW_RUN_STORAGE_KEY);
  return null;
}

/** @param {PreviewRunStorage} storage @param {any} descriptor */
export function writeFsrsPreviewRun(storage, descriptor) {
  if (!isFsrsPreviewRunDescriptor(descriptor)) {
    throw new TypeError('FSRS preview run descriptor is invalid.');
  }
  storage.setItem(FSRS_PREVIEW_RUN_STORAGE_KEY, JSON.stringify(descriptor));
  return descriptor;
}

/** @param {PreviewRunStorage} storage */
export function clearFsrsPreviewRun(storage) {
  storage.removeItem(FSRS_PREVIEW_RUN_STORAGE_KEY);
}
