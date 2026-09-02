import type {
  EmailEnvironment,
  TransactionalEmailMessage,
  TransactionalEmailSender
} from './transactional.ts';

export const PASSWORD_RESET_TOKEN_EXPIRES_IN_SECONDS = 60 * 60;
export type PasswordEmailPurpose = 'reset' | 'account-setup';

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
 *
 * The reset token is stored in the URL fragment so it is never transmitted in
 * the initial HTTP request URL to the application/Cloudflare platform.
 */
export function buildApplicationPasswordResetUrl(betterAuthResetUrl: string, token: string): string {
  const authUrl = new URL(betterAuthResetUrl);
  const resetUrl = new URL('/reset-password', authUrl.origin);
  resetUrl.hash = new URLSearchParams({ token }).toString();
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

export function renderSetPasswordEmail(resetUrl: string): PasswordResetEmailContent {
  const safeUrl = escapeHtml(resetUrl);

  return {
    subject: 'Set your Flash-Cards password',
    text: [
      'A Flash-Cards account was created for this email address.',
      '',
      `Set your password: ${resetUrl}`,
      '',
      'This secure link expires in 1 hour and can be used only once.',
      'No temporary password has been created for you to use or share.'
    ].join('\n'),
    html: [
      '<p>A Flash-Cards account was created for this email address.</p>',
      `<p><a href="${safeUrl}">Set your password</a></p>`,
      '<p>This secure link expires in 1 hour and can be used only once.</p>',
      '<p>No temporary password has been created for you to use or share.</p>'
    ].join('')
  };
}

export async function sendPasswordResetEmail(options: {
  env: EmailEnvironment;
  to: string;
  betterAuthResetUrl: string;
  token: string;
  purpose?: PasswordEmailPurpose;
  sendEmail: TransactionalEmailSender;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const resetUrl = buildApplicationPasswordResetUrl(options.betterAuthResetUrl, options.token);
  const message =
    options.purpose === 'account-setup'
      ? renderSetPasswordEmail(resetUrl)
      : renderPasswordResetEmail(resetUrl);

  await options.sendEmail(
    options.env,
    {
      ...message,
      to: options.to
    },
    options.fetchImpl
  );
}
