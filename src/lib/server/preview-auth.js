/** @param {unknown} role */
export function parseRoles(role) {
  return String(role ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/** @param {{ role?: unknown } | null | undefined} user */
export function isProductionAdmin(user) {
  return parseRoles(user?.role).includes('admin');
}

/** @param {{ role?: unknown } | null | undefined} user */
export function isPreviewAdmin(user) {
  return parseRoles(user?.role).includes('preview_admin');
}

/** @param {Record<string, unknown> | null | undefined} env */
export function isPreviewWorker(env) {
  return String(env?.PREVIEW_MODE ?? '').toLowerCase() === 'true';
}

/**
 * Preview authority is deliberately the intersection of a dedicated role and
 * the dedicated Worker runtime. A preview_admin account is not a production Admin.
 *
 * @param {{ user?: { id?: string, role?: unknown } | null, env?: Record<string, unknown> | null }} input
 */
export function requirePreviewAdmin({ user, env }) {
  if (!isPreviewWorker(env) || !user?.id || !isPreviewAdmin(user)) {
    throw new Error('Preview Admin access is required.');
  }
  return user.id;
}
