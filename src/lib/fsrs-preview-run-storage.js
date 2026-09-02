/** @typedef {{getItem:(key:string)=>string|null,setItem:(key:string,value:string)=>void,removeItem:(key:string)=>void}} PreviewRunStorage */

export const FSRS_PREVIEW_RUN_STORAGE_KEY = 'flash-cards:fsrs-preview-run:v1';

/** @param {PreviewRunStorage} storage */
export function readFsrsPreviewRun(storage) {
  const raw = storage.getItem(FSRS_PREVIEW_RUN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const descriptor = JSON.parse(raw);
    return descriptor?.version === 1 && (descriptor.kind === 'scheduled' || descriptor.kind === 'free')
      ? descriptor
      : null;
  } catch {
    return null;
  }
}

/** @param {PreviewRunStorage} storage @param {any} descriptor */
export function writeFsrsPreviewRun(storage, descriptor) {
  if (!descriptor || descriptor.version !== 1 || !['scheduled', 'free'].includes(descriptor.kind)) {
    throw new TypeError('FSRS preview run descriptor is invalid.');
  }
  storage.setItem(FSRS_PREVIEW_RUN_STORAGE_KEY, JSON.stringify(descriptor));
  return descriptor;
}

/** @param {PreviewRunStorage} storage */
export function clearFsrsPreviewRun(storage) {
  storage.removeItem(FSRS_PREVIEW_RUN_STORAGE_KEY);
}
