export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const SUPPORTED_IMAGE_TYPES = /** @type {const} */ (['image/jpeg', 'image/png']);

/** @param {string} filename */
function typeFromFilename(filename) {
  const extension = filename.toLowerCase().split('.').pop();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  return '';
}

/**
 * @param {File} file
 * @param {number} [timestamp]
 * @returns {{ file: File } | { error: string }}
 */
export function normalizeTeachingImageFile(file, timestamp = Date.now()) {
  const type = file.type || typeFromFilename(file.name);
  if (!SUPPORTED_IMAGE_TYPES.includes(/** @type {'image/jpeg' | 'image/png'} */ (type))) {
    return { error: 'Choose a JPEG or PNG image.' };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { error: 'That image is larger than the 5 MiB limit.' };
  }

  const extension = type === 'image/jpeg' ? 'jpg' : 'png';
  const filename = file.name?.trim() || `pasted-image-${timestamp}.${extension}`;
  if (file.name === filename && file.type === type) return { file };

  return {
    file: new File([file], filename, {
      type,
      lastModified: file.lastModified || timestamp
    })
  };
}

/** @param {DataTransfer | null} clipboardData */
export function findClipboardImageFile(clipboardData) {
  if (!clipboardData) return null;

  for (const item of Array.from(clipboardData.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) return file;
  }

  return Array.from(clipboardData.files ?? []).find((file) => file.type.startsWith('image/')) ?? null;
}
