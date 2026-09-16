export const BETA_EMAIL_SUFFIX = '@beta.invalid';

// Keep the synthetic email local part usable without imposing a product-level
// length or character-set policy on beta usernames.
const BETA_USERNAME_PATTERN = /^[^\s@]+$/;

/** @param {unknown} value */
export function isValidBetaUsername(value) {
  return typeof value === 'string' && BETA_USERNAME_PATTERN.test(value.trim().toLowerCase());
}

/** @param {unknown} value */
export function normalizeBetaUsername(value) {
  const username = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!BETA_USERNAME_PATTERN.test(username)) {
    throw new Error('Enter a beta username without spaces or @.');
  }
  return username;
}

/** @param {unknown} value */
export function betaUsernameToEmail(value) {
  return `${normalizeBetaUsername(value)}${BETA_EMAIL_SUFFIX}`;
}

/** @param {unknown} value */
export function isBetaEmail(value) {
  if (typeof value !== 'string') return false;
  const email = value.trim().toLowerCase();
  const localPart = email.slice(0, -BETA_EMAIL_SUFFIX.length);
  return email.endsWith(BETA_EMAIL_SUFFIX) && localPart.length > 0 && !localPart.includes('@');
}

/** @param {unknown} value */
export function betaUsernameFromEmail(value) {
  if (!isBetaEmail(value)) return null;
  const email = String(value).trim().toLowerCase();
  const username = email.slice(0, -BETA_EMAIL_SUFFIX.length);
  return isValidBetaUsername(username) ? username : null;
}

/** @param {unknown} value */
export function loginIdentifierToEmail(value) {
  const identifier = typeof value === 'string' ? value.trim() : '';
  if (!identifier) throw new Error('Enter an email address or beta username.');
  return identifier.includes('@') ? identifier.toLowerCase() : betaUsernameToEmail(identifier);
}
