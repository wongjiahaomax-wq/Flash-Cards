const MIN_VISIBLE_CROP_PIXELS = 24;

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clean = value => Math.round(value * 1e12) / 1e12;

export function fullCrop() {
  return { x: 0, y: 0, width: 1, height: 1 };
}

export function normalizeCrop(crop = {}) {
  const width = clamp(finite(crop.width, 1), 0, 1);
  const height = clamp(finite(crop.height, 1), 0, 1);
  const x = clamp(finite(crop.x, 0), 0, 1 - width);
  const y = clamp(finite(crop.y, 0), 0, 1 - height);
  return { x: clean(x), y: clean(y), width: clean(width), height: clean(height) };
}

export function minimumCropSize(renderedWidth, renderedHeight, minPixels = MIN_VISIBLE_CROP_PIXELS) {
  const width = Number(renderedWidth), height = Number(renderedHeight), pixels = Math.max(1, finite(minPixels, MIN_VISIBLE_CROP_PIXELS));
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  return { width: Math.min(1, pixels / width), height: Math.min(1, pixels / height) };
}

function minimums(minSize = {}) {
  return {
    width: clamp(finite(minSize.width, 0), 0, 1),
    height: clamp(finite(minSize.height, 0), 0, 1)
  };
}

export function moveCrop(crop, deltaX, deltaY) {
  const value = normalizeCrop(crop);
  return {
    ...value,
    x: clamp(value.x + finite(deltaX, 0), 0, 1 - value.width),
    y: clamp(value.y + finite(deltaY, 0), 0, 1 - value.height)
  };
}

export function resizeCrop(crop, deltaX, deltaY, mode, minSize = {}) {
  const value = normalizeCrop(crop), minimum = minimums(minSize);
  const dx = finite(deltaX, 0), dy = finite(deltaY, 0);
  const right = value.x + value.width, bottom = value.y + value.height;
  let left = value.x, top = value.y, nextRight = right, nextBottom = bottom;

  if (mode.includes('w')) left = clamp(value.x + dx, 0, right - minimum.width);
  if (mode.includes('e')) nextRight = clamp(right + dx, value.x + minimum.width, 1);
  if (mode.includes('n')) top = clamp(value.y + dy, 0, bottom - minimum.height);
  if (mode.includes('s')) nextBottom = clamp(bottom + dy, value.y + minimum.height, 1);

  return normalizeCrop({ x: left, y: top, width: nextRight - left, height: nextBottom - top });
}

export function cropToPixels(crop, naturalWidth, naturalHeight) {
  const width = Math.floor(Number(naturalWidth)), height = Math.floor(Number(naturalHeight));
  if (!(width > 0) || !(height > 0)) throw new Error('Source image dimensions must be positive.');
  const value = normalizeCrop(crop);
  const x = clamp(Math.floor(value.x * width), 0, width - 1);
  const y = clamp(Math.floor(value.y * height), 0, height - 1);
  const right = clamp(Math.max(x + 1, Math.ceil((value.x + value.width) * width - 1e-9)), x + 1, width);
  const bottom = clamp(Math.max(y + 1, Math.ceil((value.y + value.height) * height - 1e-9)), y + 1, height);
  return { x, y, width: right - x, height: bottom - y };
}

function hasPath(availablePaths, path) {
  if (!availablePaths) return true;
  if (typeof availablePaths.has === 'function') return availablePaths.has(path);
  return Array.isArray(availablePaths) ? availablePaths.includes(path) : false;
}

export function resolveCropSourceCandidates(sourceRefs = [], sourceCoverage = [], availablePaths) {
  const coverage = new Map(sourceCoverage.map(item => [`${item.sourceId}:${item.page}`, item]));
  const result = [], seen = new Set();
  for (const ref of sourceRefs ?? []) for (const page of ref.pages ?? []) {
    const item = coverage.get(`${ref.sourceId}:${page}`), path = item?.previewPath;
    if (!path || !hasPath(availablePaths, path) || seen.has(path)) continue;
    seen.add(path);
    result.push({ sourceId: ref.sourceId, page, previewPath: path });
  }
  return result;
}

export const normalizeCropRect = normalizeCrop;
export const getCropSourceCandidates = resolveCropSourceCandidates;
