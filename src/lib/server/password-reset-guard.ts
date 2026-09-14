const PASSWORD_RESET_RATE_LIMIT_WINDOW_MS = 60_000;
const PASSWORD_RESET_RATE_LIMIT_MAX_REQUESTS = 5;
const MAX_TRACKED_CLIENTS = 10_000;
export const PASSWORD_RESET_RATE_LIMIT_MESSAGE = 'Too many password reset requests. Please try again later.';

type RateLimitEntry = {
  count: number;
  expiresAt: number;
};

const entries = new Map<string, RateLimitEntry>();

/** @param {string} pathname */
export function isPasswordRecoveryPath(pathname: string): boolean {
  const normalizedPathname = normalizePathname(pathname);
  return (
    normalizedPathname === '/forgot-password' ||
    normalizedPathname.startsWith('/forgot-password/') ||
    normalizedPathname === '/reset-password' ||
    normalizedPathname.startsWith('/reset-password/') ||
    normalizedPathname === '/api/auth/request-password-reset' ||
    normalizedPathname === '/api/auth/reset-password' ||
    normalizedPathname.startsWith('/api/auth/reset-password/')
  );
}

/** @param {string} pathname */
export function isApplicationPasswordResetRequestPath(pathname: string): boolean {
  const normalizedPathname = normalizePathname(pathname);
  return normalizedPathname === '/forgot-password';
}

/** @param {string} pathname */
export function isDirectPasswordResetRequestPath(pathname: string): boolean {
  return normalizePathname(pathname) === '/api/auth/request-password-reset';
}

/** @param {string} pathname */
function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

/** @param {Request} request */
export function passwordResetClientKey(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',', 1)[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown-client'
  );
}

/** @param {Request} request @param {number} [now] */
export function consumePasswordResetRequest(request: Request, now = Date.now()): { allowed: boolean; retryAfter: number } {
  const key = passwordResetClientKey(request);
  const current = entries.get(key);

  if (!current || now >= current.expiresAt) {
    entries.set(key, { count: 1, expiresAt: now + PASSWORD_RESET_RATE_LIMIT_WINDOW_MS });
    pruneEntries(now);
    return { allowed: true, retryAfter: 0 };
  }

  if (current.count >= PASSWORD_RESET_RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((current.expiresAt - now) / 1000))
    };
  }

  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}

/** @param {number} [now] */
function pruneEntries(now = Date.now()): void {
  for (const [key, entry] of entries) {
    if (now >= entry.expiresAt) entries.delete(key);
  }

  if (entries.size <= MAX_TRACKED_CLIENTS) return;
  const overflow = entries.size - MAX_TRACKED_CLIENTS;
  let removed = 0;
  for (const key of entries.keys()) {
    entries.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

export function clearPasswordResetRateLimitForTests(): void {
  entries.clear();
}

/** @param {number} retryAfter */
export function passwordResetRateLimitResponse(retryAfter: number): Response {
  return new Response(PASSWORD_RESET_RATE_LIMIT_MESSAGE, {
    status: 429,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'retry-after': String(retryAfter),
      'cache-control': 'no-store'
    }
  });
}
