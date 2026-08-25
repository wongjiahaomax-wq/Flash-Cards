import {
  sendTransactionalEmail,
  type EmailEnvironment,
  type TransactionalEmailMessage
} from './resend.ts';

export const PASSWORD_RESET_TOKEN_EXPIRES_IN_SECONDS = 60 * 60;

type PasswordResetEmailContent = Omit<TransactionalEmailMessage, 'to'>;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Build the learner-facing reset route from Better Auth's generated reset URL.
 * Only the origin is reused; Better Auth remains the token authority.
 */
export function buildApplicationPasswordResetUrl(betterAuthResetUrl: string, token: string): string {
  const authUrl = new URL(betterAuthResetUrl);
  const resetUrl = new URL('/reset-password', authUrl.origin);
  resetUrl.searchParams.set('token', token);
  return resetUrl.toString();
}

export function renderPasswordResetEmail(resetUrl: string): PasswordResetEmailContent {
  const safeUrl = escapeHtml(resetUrl);

  return {
    subject: 'Reset your Flash-Cards password',
    text: [
      'A password reset was requested for your Flash-Cards account.',
      '',
      `Reset your password: ${resetUrl}`,
      '',
      'This link expires in 1 hour and can be used only once.',
      'If you did not request this reset, you can ignore this email.'
    ].join('\n'),
    html: [
      '<p>A password reset was requested for your Flash-Cards account.</p>',
      `<p><a href="${safeUrl}">Reset your password</a></p>`,
      '<p>This link expires in 1 hour and can be used only once.</p>',
      '<p>If you did not request this reset, you can ignore this email.</p>'
    ].join('')
  };
}

export async function sendPasswordResetEmail(options: {
  env: EmailEnvironment;
  to: string;
  betterAuthResetUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const resetUrl = buildApplicationPasswordResetUrl(options.betterAuthResetUrl, options.token);
  const message = renderPasswordResetEmail(resetUrl);

  await sendTransactionalEmail(
    options.env,
    {
      ...message,
      to: options.to
    },
    options.fetchImpl
  );
}
