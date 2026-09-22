import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import type { IntegrationEventRecord, IntegrationSendResult } from '../src/types/integrations.js';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { setPool } from '../src/db/index.js';
import { setIntegrationConfig } from '../src/services/integrationConfigs.js';
import { sendEmailProvider } from '../src/services/providers/emailProvider.js';
import { mockProvider } from '../src/services/providers/mockProvider.js';
import {
  getIntegrationProvider,
  processIntegrationEvent,
} from '../src/services/integrations.js';
import { httpRequest, HttpError } from '../src/utils/httpClient.js';

vi.mock('../src/utils/httpClient.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/utils/httpClient.js')>();
  return { ...actual, httpRequest: vi.fn() };
});

const mockedHttpRequest = vi.mocked(httpRequest);

const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEV_FOUNDER_ID = '00000000-0000-0000-0000-000000000002';
const PROVIDER = 'sendgrid';
const TEST_API_KEY = 'SG.test.key.123';
const TEST_FROM_EMAIL = 'from@example.com';
const TEST_FROM_NAME = 'Test Sender';

type MockHeaders = { get(name: string): string | null };
const headers = (entries: Record<string, string | null>): MockHeaders => ({
  get: (name: string) => entries[name.toLowerCase()] ?? null,
});

const makeEvent = (
  payload: Record<string, unknown> | null = {
    to: 'recipient@example.com',
    subject: 'Example subject',
    body: 'Email body',
    body_type: 'text',
  }
): IntegrationEventRecord => ({
  id: '00000000-0000-0000-0000-000000001000',
  organization_id: DEV_ORG_ID,
  clinic_id: null,
  ai_execution_id: null,
  provider: PROVIDER,
  event_type: 'email.send',
  payload,
  status: 'pending',
  retry_count: 0,
  error_message: null,
  next_retry_at: null,
  sent_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const seedConfig = async (withFromName = false) => {
  await setIntegrationConfig({
    organizationId: DEV_ORG_ID,
    provider: PROVIDER,
    configKey: 'api_key',
    value: TEST_API_KEY,
  });
  await setIntegrationConfig({
    organizationId: DEV_ORG_ID,
    provider: PROVIDER,
    configKey: 'from_email',
    value: TEST_FROM_EMAIL,
  });
  if (withFromName) {
    await setIntegrationConfig({
      organizationId: DEV_ORG_ID,
      provider: PROVIDER,
      configKey: 'from_name',
      value: TEST_FROM_NAME,
    });
  }
};

const okResponse = (h: Record<string, string | null> = {}) => ({
  status: 202,
  ok: true,
  headers: headers(h),
});

describe('V3.1.2-C2 SendGrid Email Provider', () => {
  let tdb: TestDatabase;
  let memPool: Pool;

  beforeAll(async () => {
    tdb = createTestDatabase();
    const pgLib = tdb.db.adapters.createPg();
    memPool = new pgLib.Pool();
    setPool(memPool);
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  beforeEach(async () => {
    mockedHttpRequest.mockReset();
    await memPool.query(`DELETE FROM integration_configs`);
  });

  const callOptions = () => {
    const calls = mockedHttpRequest.mock.calls;
    const last = calls[calls.length - 1];
    return {
      url: last[0] as string,
      options: last[1] as {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
        timeoutMs?: number;
      },
    };
  };

  // ==================================================================
  // C2.1–10: successful send path
  // ==================================================================
  describe('C2.1 successful SendGrid request', () => {
    it('returns success on 202', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue(okResponse({}));

      const result = await sendEmailProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent(),
      });

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBeUndefined();
    });
  });

  describe('C2.2 correct endpoint', () => {
    it('POSTs to the SendGrid v3 mail send endpoint', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue(okResponse({}));

      await sendEmailProvider.send({ organizationId: DEV_ORG_ID, event: makeEvent() });

      const { url, options } = callOptions();
      expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
      expect(options.method).toBe('POST');
    });
  });

  describe('C2.3 Bearer authentication', () => {
    it('sends Authorization: Bearer <api_key>', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue(okResponse({}));

      await sendEmailProvider.send({ organizationId: DEV_ORG_ID, event: makeEvent() });

      const { options } = callOptions();
      expect(options.headers?.Authorization).toBe(`Bearer ${TEST_API_KEY}`);
    });
  });

  describe('C2.4 correct JSON body', () => {
    it('builds the SendGrid Mail Send payload', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue(okResponse({}));

      await sendEmailProvider.send({ organizationId: DEV_ORG_ID, event: makeEvent() });

      const { options } = callOptions();
      expect(options.headers?.['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body ?? '{}');
      expect(body.personalizations[0].to[0].email).toBe('recipient@example.com');
      expect(body.from.email).toBe(TEST_FROM_EMAIL);
      expect(body.subject).toBe('Example subject');
      expect(body.content[0].value).toBe('Email body');
    });
  });

  describe('C2.5 configured from_email used', () => {
    it('uses stored from_email as sender', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue(okResponse({}));

      await sendEmailProvider.send({ organizationId: DEV_ORG_ID, event: makeEvent() });

      const body = JSON.parse(callOptions().options.body ?? '{}');
      expect(body.from.email).toBe(TEST_FROM_EMAIL);
      expect(body.from.name).toBeUndefined();
    });
  });

  describe('C2.6 configured from_name used', () => {
    it('uses stored from_name when configured', async () => {
      await seedConfig(true);
      mockedHttpRequest.mockResolvedValue(okResponse({}));

      await sendEmailProvider.send({ organizationId: DEV_ORG_ID, event: makeEvent() });

      const body = JSON.parse(callOptions().options.body ?? '{}');
      expect(body.from.name).toBe(TEST_FROM_NAME);
    });
  });

  describe('C2.7 text/plain body', () => {
    it('maps body_type text to text/plain content', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue(okResponse({}));

      await sendEmailProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent({ to: 'recipient@example.com', subject: 'S', body: 'Plain', body_type: 'text' }),
      });

      const body = JSON.parse(callOptions().options.body ?? '{}');
      expect(body.content[0].type).toBe('text/plain');
      expect(body.content[0].value).toBe('Plain');
    });
  });

  describe('C2.8 text/html body', () => {
    it('maps body_type html to text/html content', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue(okResponse({}));

      await sendEmailProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent({ to: 'recipient@example.com', subject: 'S', body: '<p>Hi</p>', body_type: 'html' }),
      });

      const body = JSON.parse(callOptions().options.body ?? '{}');
      expect(body.content[0].type).toBe('text/html');
      expect(body.content[0].value).toBe('<p>Hi</p>');
    });
  });

  describe('C2.9 X-Message-ID captured', () => {
    it('uses the SendGrid X-Message-ID as providerMessageId', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue(okResponse({ 'x-message-id': 'sg-msg-123' }));

      const result = await sendEmailProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent(),
      });

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe('sg-msg-123');
    });
  });

  describe('C2.10 API key never appears in result/error', () => {
    it('success result contains no secret', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue(okResponse({}));

      const result = await sendEmailProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent(),
      });

      expect(JSON.stringify(result)).not.toContain(TEST_API_KEY);
    });

    it('error result contains no secret', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue({ status: 400, ok: false, headers: headers({}) });

      const result = await sendEmailProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(JSON.stringify(result)).not.toContain(TEST_API_KEY);
      expect(JSON.stringify(result)).not.toContain('Authorization');
    });
  });

  // ==================================================================
  // C2.11–14: configuration / payload validation (no HTTP)
  // ==================================================================
  describe('C2.11 missing api_key handled safely', () => {
    it('returns failure without HTTP request', async () => {
      await setIntegrationConfig({
        organizationId: DEV_ORG_ID,
        provider: PROVIDER,
        configKey: 'from_email',
        value: TEST_FROM_EMAIL,
      });

      const result = await sendEmailProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent(),
      });

      expect(result.success).toBe(false);
      expect(mockedHttpRequest).not.toHaveBeenCalled();
    });
  });

  describe('C2.12 missing from_email handled safely', () => {
    it('returns failure without HTTP request', async () => {
      await setIntegrationConfig({
        organizationId: DEV_ORG_ID,
        provider: PROVIDER,
        configKey: 'api_key',
        value: TEST_API_KEY,
      });

      const result = await sendEmailProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent(),
      });

      expect(result.success).toBe(false);
      expect(mockedHttpRequest).not.toHaveBeenCalled();
    });
  });

  describe('C2.13 invalid recipient rejected before HTTP', () => {
    it('rejects a non-email recipient without HTTP', async () => {
      await seedConfig();

      const result = await sendEmailProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent({ to: 'not-an-email', subject: 'S', body: 'B' }),
      });

      expect(result.success).toBe(false);
      expect(mockedHttpRequest).not.toHaveBeenCalled();
    });
  });

  describe('C2.14 invalid payload rejected before HTTP', () => {
    it('rejects a payload missing required fields without HTTP', async () => {
      await seedConfig();

      const result = await sendEmailProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent({ subject: 'no recipients or body' }),
      });

      expect(result.success).toBe(false);
      expect(mockedHttpRequest).not.toHaveBeenCalled();
    });
  });

  // ==================================================================
  // C2.15–19: provider HTTP error classification
  // ==================================================================
  describe('C2.15 4xx provider error handled safely', () => {
    it('classifies 4xx as a non-success failure', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue({ status: 400, ok: false, headers: headers({}) });

      const result = await sendEmailProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent(),
      });

      expect(result.success).toBe(false);
      expect(mockedHttpRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('C2.16 429 provider error classified correctly', () => {
    it('classifies 429 as a retryable failure', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue({ status: 429, ok: false, headers: headers({}) });

      const result = await sendEmailProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent(),
      });

      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('429');
    });
  });

  describe('C2.17 5xx provider error classified correctly', () => {
    it('classifies 5xx as a retryable failure', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue({ status: 503, ok: false, headers: headers({}) });

      const result = await sendEmailProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent(),
      });

      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('503');
    });
  });

  describe('C2.18 network failure handled safely', () => {
    it('classifies a network error as a retryable failure', async () => {
      await seedConfig();
      mockedHttpRequest.mockRejectedValue(new Error('connect ECONNREFUSED'));

      const result = await sendEmailProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error contacting SendGrid');
    });
  });

  describe('C2.19 timeout handled safely', () => {
    it('classifies a timeout as a retryable failure', async () => {
      await seedConfig();
      mockedHttpRequest.mockRejectedValue(new HttpError('timed out', 'timeout'));

      const result = await sendEmailProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('SendGrid request timed out');
    });
  });

  // ==================================================================
  // C2.20–21: registry
  // ==================================================================
  describe('C2.20 SendGrid provider registered', () => {
    it('is resolvable via getIntegrationProvider', () => {
      expect(getIntegrationProvider('sendgrid')).toBe(sendEmailProvider);
    });
  });

  describe('C2.21 mock provider still works', () => {
    it('mock provider still sends successfully', async () => {
      const result = await mockProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent(),
      });

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe(`mock-msg-${makeEvent().id}`);
    });
  });

  // ==================================================================
  // C2.22: end-to-end via processIntegrationEvent
  // ==================================================================
  describe('C2.22 processIntegrationEvent can execute SendGrid provider', () => {
    it('marks the event as sent without persisting provider_message_id', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue(okResponse({ 'x-message-id': 'sg-msg-123' }));

      const insertRes = await memPool.query<{ id: string }>(
        `INSERT INTO integration_events
           (organization_id, provider, event_type, payload, status, retry_count)
         VALUES ($1, 'sendgrid', 'email.send', $2, 'pending', 0)
         RETURNING id`,
        [
          DEV_ORG_ID,
          JSON.stringify({
            to: 'recipient@example.com',
            subject: 'Example subject',
            body: 'Email body',
            body_type: 'text',
          }),
        ]
      );
      const eventId = insertRes.rows[0].id;

      const updated = await processIntegrationEvent({
        eventId,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        clinicId: null,
      });

      expect(updated.status).toBe('sent');
      expect(updated.error_message).toBeNull();

      const dbRow = await memPool.query<{ status: string; error_message: string | null }>(
        `SELECT status, error_message FROM integration_events WHERE id = $1`,
        [eventId]
      );
      expect(dbRow.rows[0].status).toBe('sent');
      expect(dbRow.rows[0].error_message).toBeNull();
    });
  });

  // ==================================================================
  // Security: API key never leaks into stored event payload
  // ==================================================================
  describe('security: event payload never contains the API key', () => {
    it('integration_events payload does not hold the SendGrid API key', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue(okResponse({}));

      const insertRes = await memPool.query<{ id: string }>(
        `INSERT INTO integration_events
           (organization_id, provider, event_type, payload, status, retry_count)
         VALUES ($1, 'sendgrid', 'email.send', $2, 'pending', 0)
         RETURNING id`,
        [DEV_ORG_ID, JSON.stringify({ to: 'a@b.com', subject: 'S', body: 'B' })]
      );
      const eventId = insertRes.rows[0].id;

      await processIntegrationEvent({
        eventId,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        clinicId: null,
      });

      const dbRow = await memPool.query<{ payload: string }>(
        `SELECT payload FROM integration_events WHERE id = $1`,
        [eventId]
      );
      expect(JSON.stringify(dbRow.rows[0].payload)).not.toContain(TEST_API_KEY);
      expect(JSON.stringify(dbRow.rows[0].payload)).not.toContain('Authorization');
    });
  });

  describe('security: thrown errors never leak secrets', () => {
    it('does not leak the API key, auth header, or encrypted config in errors', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue({ status: 401, ok: false, headers: headers({}) });

      const result: IntegrationSendResult = await sendEmailProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent(),
      });

      expect(result.success).toBe(false);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(TEST_API_KEY);
      expect(serialized).not.toContain('Bearer ');
      expect(serialized).not.toContain('config_value_encrypted');
    });
  });

  // ==================================================================
  // C2-H1–H4: health check
  // ==================================================================
  describe('C2-H1 successful health check', () => {
    it('returns true on 200 with valid API key', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue(okResponse({}));

      const result = await sendEmailProvider.healthCheck!(DEV_ORG_ID);

      expect(result).toBe(true);
      expect(mockedHttpRequest).toHaveBeenCalledTimes(1);
      const { url, options } = callOptions();
      expect(url).toBe('https://api.sendgrid.com/v3/user/account');
      expect(options.method).toBe('GET');
      expect(options.timeoutMs).toBe(5_000);
      const authHeader = options.headers?.['Authorization'];
      expect(authHeader).toBe(`Bearer ${TEST_API_KEY}`);
    });
  });

  describe('C2-H2 network failure', () => {
    it('returns false on network error', async () => {
      await seedConfig();
      mockedHttpRequest.mockRejectedValue(new Error('connect ECONNREFUSED'));

      const result = await sendEmailProvider.healthCheck!(DEV_ORG_ID);

      expect(result).toBe(false);
    });
  });

  describe('C2-H3 timeout', () => {
    it('returns false on timeout', async () => {
      await seedConfig();
      mockedHttpRequest.mockRejectedValue(new HttpError('timed out', 'timeout'));

      const result = await sendEmailProvider.healthCheck!(DEV_ORG_ID);

      expect(result).toBe(false);
    });
  });

  describe('C2-H4 4xx/5xx', () => {
    it('returns false on 401 (invalid credentials)', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue({ status: 401, ok: false, headers: headers({}) });

      const result = await sendEmailProvider.healthCheck!(DEV_ORG_ID);

      expect(result).toBe(false);
    });

    it('returns false on 403 (insufficient scope)', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue({ status: 403, ok: false, headers: headers({}) });

      const result = await sendEmailProvider.healthCheck!(DEV_ORG_ID);

      expect(result).toBe(false);
    });

    it('returns false on 503', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue({ status: 503, ok: false, headers: headers({}) });

      const result = await sendEmailProvider.healthCheck!(DEV_ORG_ID);

      expect(result).toBe(false);
    });
  });

  describe('C2-H5 no API key configured', () => {
    it('returns false when api_key is not configured', async () => {
      await memPool.query(`DELETE FROM integration_configs`);
      mockedHttpRequest.mockResolvedValue(okResponse({}));

      const result = await sendEmailProvider.healthCheck!(DEV_ORG_ID);

      expect(result).toBe(false);
      expect(mockedHttpRequest).not.toHaveBeenCalled();
    });
  });
});
