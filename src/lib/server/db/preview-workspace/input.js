import { PreviewWorkspaceError } from './errors.js';

/** @param {unknown} value @param {string} label */
export function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new PreviewWorkspaceError(`${label} is required.`, 'INVALID_INPUT');
  return text;
}

/** @param {unknown} value */
export function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

/** @param {unknown} value */
export function optionalHttpUrl(value) {
  const text = optionalText(value);
  if (!text) return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new PreviewWorkspaceError('Source URL must be a valid http(s) URL.', 'INVALID_INPUT');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new PreviewWorkspaceError('Source URL must be a valid http(s) URL.', 'INVALID_INPUT');
  }
  return parsed.toString();
}

/** @param {unknown} value */
export function booleanValue(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

/** @param {Date | number | string | null | undefined} value */
export function timeMs(value) {
  if (value instanceof Date) return value.getTime();
  return Number(value ?? 0);
}
