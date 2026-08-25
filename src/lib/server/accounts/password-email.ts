import { createAuth } from '../auth.js';
import type { PasswordEmailPurpose } from './admin-accounts.ts';

/**
 * Request a Better Auth reset token and deliver it synchronously for an
 * authorized Admin workflow. Public forgot-password continues to use the
 * background anti-enumeration path configured by the normal request auth.
 */
export async function requestAdminPasswordEmail(
  env: Parameters<typeof createAuth>[0],
  email: string,
  purpose: PasswordEmailPurpose
): Promise<void> {
  const auth = createAuth(env, {
    passwordEmailPurpose: purpose,
    awaitPasswordEmailDelivery: true
  });

  await auth.api.requestPasswordReset({
    body: { email }
  });
}
