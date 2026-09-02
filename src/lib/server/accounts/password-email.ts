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
  let deliveryResult: 'sent' | 'failed' | null = null;
  const auth = createAuth(env, {
    passwordEmailPurpose: purpose,
    awaitPasswordEmailDelivery: true,
    onPasswordEmailDeliveryResult: (result) => {
      deliveryResult = result;
    }
  });

  await auth.api.requestPasswordReset({
    body: { email }
  });

  // Better Auth 1.6.25 deliberately catches callback failures inside its
  // request-password-reset workflow. Fail closed here using only the safe
  // delivery result captured by createAuth; never surface token/provider data.
  if (deliveryResult !== 'sent') {
    throw new Error('Password email delivery failed.');
  }
}
