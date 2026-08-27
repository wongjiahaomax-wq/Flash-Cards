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

export type TransactionalEmailSender = (
  env: EmailEnvironment,
  message: TransactionalEmailMessage,
  fetchImpl?: typeof fetch
) => Promise<void>;

export class EmailDeliveryError extends Error {
  status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'EmailDeliveryError';
    this.status = status;
  }
}
