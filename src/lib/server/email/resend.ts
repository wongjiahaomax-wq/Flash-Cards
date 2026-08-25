export type TransactionalEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailEnvironment = {
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
};

export class EmailDeliveryError extends Error {
  status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'EmailDeliveryError';
    this.status = status;
  }
}

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Deliver one transactional email through Resend.
 *
 * Provider credentials remain entirely server-side. Error messages intentionally
 * omit provider response bodies, recipient addresses and message contents so
 * authentication tokens cannot accidentally be copied into application logs.
 */
export async function sendTransactionalEmail(
  env: EmailEnvironment,
  message: TransactionalEmailMessage,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.AUTH_EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    throw new EmailDeliveryError('Transactional email is not configured.');
  }

  const response = await fetchImpl(RESEND_EMAILS_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {})
    })
  });

  if (!response.ok) {
    throw new EmailDeliveryError('Transactional email provider rejected the request.', response.status);
  }
}
