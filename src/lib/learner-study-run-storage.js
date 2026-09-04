import {
  isFsrsPreviewRunDescriptor,
  isFsrsPreviewRunOwnedBy
} from './fsrs-preview-run-storage.js';

/** @typedef {{getItem:(key:string)=>string|null,setItem:(key:string,value:string)=>void,removeItem:(key:string)=>void}} LearnerRunStorage */
/** @typedef {import('./fsrs-preview-run-storage.js').FsrsPreviewRunDescriptor} LearnerStudyRunDescriptor */

export const LEARNER_STUDY_RUN_STORAGE_KEY = 'flash-cards:learner-study-run:v2';
export const LEGACY_LEARNER_STUDY_RUN_STORAGE_KEY = 'flash-cards:learner-study-run:v1';

/** @param {unknown} descriptor @returns {descriptor is LearnerStudyRunDescriptor} */
export function isLearnerStudyRunDescriptor(descriptor) {
  return isFsrsPreviewRunDescriptor(descriptor);
}
/** @param {unknown} descriptor @param {string} userId @returns {descriptor is LearnerStudyRunDescriptor} */
export function isLearnerStudyRunOwnedBy(descriptor, userId) {
  return isFsrsPreviewRunOwnedBy(descriptor, userId);
}

/** @param {LearnerRunStorage} storage */
function retireLegacyState(storage) {
  storage.removeItem(LEGACY_LEARNER_STUDY_RUN_STORAGE_KEY);
}

/** @param {LearnerRunStorage} storage @returns {LearnerStudyRunDescriptor|null} */
export function readLearnerStudyRun(storage) {
  // The one-time fenced zero-data cutover explicitly retires v1 browser state.
  retireLegacyState(storage);
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
/** @param {LearnerRunStorage} storage @param {string} userId @returns {LearnerStudyRunDescriptor|null} */
export function readLearnerStudyRunForUser(storage, userId) {
  const descriptor = readLearnerStudyRun(storage);
  if (!descriptor) return null;
  if (isLearnerStudyRunOwnedBy(descriptor, userId)) return descriptor;
  storage.removeItem(LEARNER_STUDY_RUN_STORAGE_KEY);
  return null;
}
/** @param {LearnerRunStorage} storage @param {unknown} descriptor @returns {LearnerStudyRunDescriptor} */
export function writeLearnerStudyRun(storage, descriptor) {
  if (!isLearnerStudyRunDescriptor(descriptor)) throw new TypeError('Learner Study run descriptor is invalid.');
  retireLegacyState(storage);
  storage.setItem(LEARNER_STUDY_RUN_STORAGE_KEY, JSON.stringify(descriptor));
  return descriptor;
}
/** @param {LearnerRunStorage} storage */
export function clearLearnerStudyRun(storage) {
  storage.removeItem(LEARNER_STUDY_RUN_STORAGE_KEY);
  retireLegacyState(storage);
}
