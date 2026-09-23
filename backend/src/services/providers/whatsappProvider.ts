import { z } from 'zod';
import {
  httpRequest,
  HttpError,
  type HttpResponse,
} from '../../utils/httpClient.js';
import { getIntegrationConfig } from '../integrationConfigs.js';
import { logger } from '../../utils/logger.js';
import type {
  IntegrationEventRecord,
  IntegrationProvider,
  IntegrationSendResult,
  WhatsappPayload,
} from '../../types/integrations.js';

const PROVIDER = 'whatsapp';
const GRAPH_API_BASE = 'https://graph.facebook.com/v23.0';
const SEND_TIMEOUT_MS = 10_000;
const HEALTH_TIMEOUT_MS = 5_000;
const MAX_MESSAGE_LENGTH = 4096;

const E164_REGEX = /^\+[1-9]\d{4,14}$/;

const whatsappPayloadSchema = z.object({
  to: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, { message: 'Phone number is required' })
    .refine((s) => E164_REGEX.test(s), {
      message: 'Invalid phone number; E.164 format required',
    }),
  message: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, { message: 'Message is required' })
    .refine((s) => s.length <= MAX_MESSAGE_LENGTH, {
      message: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
    }),
});

interface ValidatePayloadResult {
  success: boolean;
  data?: WhatsappPayload;
  error?: string;
}

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

const validatePayload = (
  payload: Record<string, unknown>
): ValidatePayloadResult => {
  const parsed = whatsappPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ?? 'Invalid integration event payload',
    };
  }
  return { success: true, data: parsed.data };
};

const safeError = (message: string): IntegrationSendResult => ({
  success: false,
  error: message,
});

const sendWhatsappProvider: IntegrationProvider & {
  validatePayload(payload: Record<string, unknown>): ValidatePayloadResult;
} = {
  provider: PROVIDER,

  validatePayload,

  send: async ({
    organizationId,
    event,
  }: {
    organizationId: string;
    event: IntegrationEventRecord;
  }): Promise<IntegrationSendResult> => {
    const start = Date.now();

    const validation = validatePayload(event.payload ?? {});
    if (!validation.success) {
      logger.info({
        provider: PROVIDER,
        organizationId,
        success: false,
        latencyMs: Date.now() - start,
        errorKind: 'validation',
      });
      return safeError('Invalid integration event payload');
    }

    const { to, message } = validation.data as WhatsappPayload;

    const apiToken = await loadConfig(organizationId, 'api_token');
    if (!apiToken) {
      logger.info({
        provider: PROVIDER,
        organizationId,
        success: false,
        latencyMs: Date.now() - start,
        errorKind: 'config',
      });
      return safeError(
        'WhatsApp api_token is not configured for this organization'
      );
    }

    const phoneNumberId = await loadConfig(organizationId, 'phone_number_id');
    if (!phoneNumberId) {
      logger.info({
        provider: PROVIDER,
        organizationId,
        success: false,
        latencyMs: Date.now() - start,
        errorKind: 'config',
      });
      return safeError(
        'WhatsApp phone_number_id is not configured for this organization'
      );
    }

    const requestBody = JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: message },
    });

    let response: HttpResponse;
    try {
      response = await httpRequest(
        `${GRAPH_API_BASE}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: requestBody,
          timeoutMs: SEND_TIMEOUT_MS,
          returnBody: true,
        }
      );
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const errorKind =
        err instanceof HttpError ? err.kind : 'network';
      logger.info({
        provider: PROVIDER,
        organizationId,
        success: false,
        latencyMs,
        errorKind,
      });
      if (err instanceof HttpError && err.kind === 'timeout') {
        return safeError('WhatsApp request timed out');
      }
      return safeError('Network error contacting WhatsApp');
    }

    const latencyMs = Date.now() - start;

    if (!response.ok || response.status !== 200) {
      logger.info({
        provider: PROVIDER,
        organizationId,
        success: false,
        latencyMs,
        httpStatus: response.status,
      });
      return safeError(`WhatsApp request failed (status ${response.status})`);
    }

    let providerMessageId: string | undefined;
    try {
      const json = JSON.parse(response.body ?? '{}');
      providerMessageId = json?.messages?.[0]?.id;
    } catch {
      providerMessageId = undefined;
    }

    logger.info({
      provider: PROVIDER,
      organizationId,
      success: true,
      latencyMs,
      httpStatus: response.status,
    });
    return { success: true, providerMessageId };
  },

  validate: (_config: Record<string, unknown>): boolean => {
    return true;
  },

  healthCheck: async (organizationId: string): Promise<boolean> => {
    const start = Date.now();

    try {
      const apiToken = await loadConfig(organizationId, 'api_token');
      if (!apiToken) {
        logger.info({
          provider: PROVIDER,
          organizationId,
          success: false,
          latencyMs: Date.now() - start,
          errorKind: 'config',
        });
        return false;
      }

      const businessAccountId = await loadConfig(
        organizationId,
        'business_account_id'
      );
      if (!businessAccountId) {
        logger.info({
          provider: PROVIDER,
          organizationId,
          success: false,
          latencyMs: Date.now() - start,
          errorKind: 'config',
        });
        return false;
      }

      const response = await httpRequest(
        `${GRAPH_API_BASE}/${businessAccountId}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiToken}` },
          timeoutMs: HEALTH_TIMEOUT_MS,
        }
      );

      const latencyMs = Date.now() - start;
      const healthy = response.status === 200;
      logger.info({
        provider: PROVIDER,
        organizationId,
        success: healthy,
        latencyMs,
        httpStatus: response.status,
      });
      return healthy;
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const errorKind = err instanceof HttpError ? err.kind : 'network';
      logger.info({
        provider: PROVIDER,
        organizationId,
        success: false,
        latencyMs,
        errorKind,
      });
      return false;
    }
  },
};

export { sendWhatsappProvider };
