import {
  isFsrsPreviewRunDescriptor,
  isFsrsPreviewRunOwnedBy
} from './fsrs-preview-run-storage.js';

/** @typedef {{getItem:(key:string)=>string|null,setItem:(key:string,value:string)=>void,removeItem:(key:string)=>void}} LearnerRunStorage */

export const LEARNER_STUDY_RUN_STORAGE_KEY = 'flash-cards:learner-study-run:v1';

/** @param {unknown} descriptor */
export function isLearnerStudyRunDescriptor(descriptor) {
  return isFsrsPreviewRunDescriptor(descriptor);
}

/** @param {unknown} descriptor @param {unknown} userId */
export function isLearnerStudyRunOwnedBy(descriptor, userId) {
  return isFsrsPreviewRunOwnedBy(descriptor, userId);
}

/** @param {LearnerRunStorage} storage */
export function readLearnerStudyRun(storage) {
  const raw = storage.getItem(LEARNER_STUDY_RUN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const descriptor = JSON.parse(raw);
    if (isLearnerStudyRunDescriptor(descriptor)) return descriptor;
  } catch {
    // Browser run state is disposable convenience state; server persistence owns progress.
  }
  storage.removeItem(LEARNER_STUDY_RUN_STORAGE_KEY);
  return null;
}

/** @param {LearnerRunStorage} storage @param {string} userId */
export function readLearnerStudyRunForUser(storage, userId) {
  const descriptor = readLearnerStudyRun(storage);
  if (!descriptor) return null;
  if (isLearnerStudyRunOwnedBy(descriptor, userId)) return descriptor;
  storage.removeItem(LEARNER_STUDY_RUN_STORAGE_KEY);
  return null;
}

/** @param {LearnerRunStorage} storage @param {any} descriptor */
export function writeLearnerStudyRun(storage, descriptor) {
  if (!isLearnerStudyRunDescriptor(descriptor)) {
    throw new TypeError('Learner Study run descriptor is invalid.');
  }
  storage.setItem(LEARNER_STUDY_RUN_STORAGE_KEY, JSON.stringify(descriptor));
  return descriptor;
}

/** @param {LearnerRunStorage} storage */
export function clearLearnerStudyRun(storage) {
  storage.removeItem(LEARNER_STUDY_RUN_STORAGE_KEY);
}
