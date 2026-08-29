import { StimulusGroupInputError } from './stimulus-family-error.js';

/** @param {unknown} value @param {string} label */
export function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new StimulusGroupInputError(`${label} is required.`);
  return text;
}

/** @param {unknown} value */
export function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

/** @param {unknown} value */
export function activeValue(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

/** @param {unknown} value @param {unknown} minimum */
export function coverage(value, minimum) {
  const mode = String(value || 'none');
  if (!['none', 'minimum', 'all'].includes(mode)) {
    throw new StimulusGroupInputError('Specific-question coverage must be none, minimum, or all.');
  }
  if (mode !== 'minimum') return { mode, minimum: null };
  const count = Number(minimum);
  if (!Number.isInteger(count) || count < 1) {
    throw new StimulusGroupInputError('Minimum specific questions must be a positive integer.');
  }
  return { mode, minimum: count };
}
