import { z } from 'zod';
import {
  httpRequest,
  HttpError,
  type HttpResponse,
} from '../../utils/httpClient.js';
import { getIntegrationConfig } from '../integrationConfigs.js';
import type {
  IntegrationEventRecord,
  IntegrationProvider,
  IntegrationSendResult,
} from '../../types/integrations.js';

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';
const SENDGRID_ACCOUNT_URL = 'https://api.sendgrid.com/v3/user/account';
const REQUEST_TIMEOUT_MS = 10_000;
const PROVIDER = 'sendgrid';

const emailPayloadSchema = z.object({
  to: z.string().min(1).email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  body_type: z.enum(['text', 'html']).optional().default('text'),
});

const safeError = (message: string): IntegrationSendResult => ({
  success: false,
  error: message,
});

const loadConfig = async (
  organizationId: string,
  configKey: string
): Promise<string | undefined> => {
  try {
    return await getIntegrationConfig({
      organizationId,
      provider: PROVIDER,
      configKey,
    });
  } catch {
    return undefined;
  }
};

const sendEmailProvider: IntegrationProvider = {
  provider: PROVIDER,

  send: async ({
    organizationId,
    event,
  }: {
    organizationId: string;
    event: IntegrationEventRecord;
  }): Promise<IntegrationSendResult> => {
    const apiKey = await loadConfig(organizationId, 'api_key');
    if (!apiKey) {
      return safeError('SendGrid api_key is not configured for this organization');
    }

    const fromEmail = await loadConfig(organizationId, 'from_email');
    if (!fromEmail) {
      return safeError('SendGrid from_email is not configured for this organization');
    }

    const fromName = await loadConfig(organizationId, 'from_name');

    const parsed = emailPayloadSchema.safeParse(event.payload ?? {});
    if (!parsed.success) {
      return safeError('Invalid integration event payload');
    }

    const { to, subject, body, body_type } = parsed.data;

    const mailPayload = {
      personalizations: [{ to: [{ email: to }] }],
      from: fromName ? { email: fromEmail, name: fromName } : { email: fromEmail },
      subject,
      content: [
        {
          type: body_type === 'html' ? 'text/html' : 'text/plain',
          value: body,
        },
      ],
    };

    let response: HttpResponse;
    try {
      response = await httpRequest(SENDGRID_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mailPayload),
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
    } catch (err: unknown) {
      if (err instanceof HttpError && err.kind === 'timeout') {
        return safeError('SendGrid request timed out');
      }
      return safeError('Network error contacting SendGrid');
    }

    if (response.status === 429) {
      return safeError('SendGrid rate limited (429)');
    }
    if (response.status >= 500) {
      return safeError(`SendGrid server error (status ${response.status})`);
    }
    if (response.status >= 400) {
      return safeError(`SendGrid request failed (status ${response.status})`);
    }

    const messageId = response.headers.get('x-message-id');
    if (!response.ok || response.status !== 202) {
      return safeError(`SendGrid request failed (status ${response.status})`);
    }

    return {
      success: true,
      providerMessageId: messageId ? messageId : undefined,
    };
  },

  validate: (_config: Record<string, unknown>): boolean => {
    return true;
  },

  healthCheck: async (organizationId: string): Promise<boolean> => {
    try {
      const apiKey = await loadConfig(organizationId, 'api_key');
      if (!apiKey) {
        return false;
      }

      const response = await httpRequest(SENDGRID_ACCOUNT_URL, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeoutMs: 5_000,
      });

      // 200: valid credentials + sufficient scope
      // 401: invalid / revoked API key
      // 403: valid API key but insufficient scope for account endpoint
      // Any other non-2xx: provider connectivity issue
      if (!response.ok) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },
};

export { sendEmailProvider };
