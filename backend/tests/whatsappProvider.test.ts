import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import type {
  IntegrationEventRecord,
  IntegrationSendResult,
} from '../src/types/integrations.js';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { setPool } from '../src/db/index.js';
import { setIntegrationConfig } from '../src/services/integrationConfigs.js';
import { sendWhatsappProvider } from '../src/services/providers/whatsappProvider.js';
import { getIntegrationProvider } from '../src/services/integrations.js';
import { httpRequest, HttpError } from '../src/utils/httpClient.js';

vi.mock('../src/utils/httpClient.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/utils/httpClient.js')>();
  return { ...actual, httpRequest: vi.fn() };
});

const mockedHttpRequest = vi.mocked(httpRequest);

const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const PROVIDER = 'whatsapp';
const TEST_API_TOKEN = 'EA-test-whatsapp-token-123';
const TEST_PHONE_ID = '1234567890';
const TEST_BA_ID = '9876543210';

type MockHeaders = { get(name: string): string | null };
const headers = (entries: Record<string, string | null>): MockHeaders => ({
  get: (name: string) => entries[name.toLowerCase()] ?? null,
});

const seedConfig = async () => {
  await setIntegrationConfig({
    organizationId: DEV_ORG_ID,
    provider: PROVIDER,
    configKey: 'api_token',
    value: TEST_API_TOKEN,
  });
  await setIntegrationConfig({
    organizationId: DEV_ORG_ID,
    provider: PROVIDER,
    configKey: 'phone_number_id',
    value: TEST_PHONE_ID,
  });
  await setIntegrationConfig({
    organizationId: DEV_ORG_ID,
    provider: PROVIDER,
    configKey: 'business_account_id',
    value: TEST_BA_ID,
  });
};

const okResponse = (body: string | null = null, h: Record<string, string | null> = {}) => ({
  status: 200,
  ok: true,
  headers: headers(h),
  body,
});

const makeEvent = (
  payload: Record<string, unknown> | null = {
    to: '+15551234567',
    message: 'Hello!',
  }
): IntegrationEventRecord => ({
  id: '00000000-0000-0000-0000-000000001000',
  organization_id: DEV_ORG_ID,
  clinic_id: null,
  ai_execution_id: null,
  provider: PROVIDER,
  event_type: 'whatsapp.send',
  payload,
  status: 'pending',
  retry_count: 0,
  error_message: null,
  next_retry_at: null,
  sent_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
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
      returnBody?: boolean;
    },
  };
};

describe('V3.1.12-A WhatsApp Provider', () => {
  let tdb: TestDatabase;
  let memPool: Pool;

  beforeAll(() => {
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

  // =====================================================================
  // H1–H5: health check
  // =====================================================================
  describe('H1 successful health check', () => {
    it('returns true on HTTP 200', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue(okResponse());

      const result = await sendWhatsappProvider.healthCheck!(DEV_ORG_ID);

      expect(result).toBe(true);
      expect(mockedHttpRequest).toHaveBeenCalledTimes(1);
      const { url, options } = callOptions();
      expect(url).toBe(`https://graph.facebook.com/v23.0/${TEST_BA_ID}`);
      expect(options.method).toBe('GET');
      expect(options.headers?.Authorization).toBe(`Bearer ${TEST_API_TOKEN}`);
      expect(options.timeoutMs).toBe(5_000);
    });
  });

  describe('H2 health 401', () => {
    it('returns false on invalid credentials', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue({
        status: 401,
        ok: false,
        headers: headers({}),
        body: null,
      });

      expect(await sendWhatsappProvider.healthCheck!(DEV_ORG_ID)).toBe(false);
    });
  });

  describe('H3 health 403', () => {
    it('returns false on insufficient scope', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue({
        status: 403,
        ok: false,
        headers: headers({}),
        body: null,
      });

      expect(await sendWhatsappProvider.healthCheck!(DEV_ORG_ID)).toBe(false);
    });
  });

  describe('H4 health timeout', () => {
    it('returns false on timeout', async () => {
      await seedConfig();
      mockedHttpRequest.mockRejectedValue(new HttpError('timed out', 'timeout'));

      expect(await sendWhatsappProvider.healthCheck!(DEV_ORG_ID)).toBe(false);
    });
  });

  describe('H5 health network failure', () => {
    it('returns false on network error', async () => {
      await seedConfig();
      mockedHttpRequest.mockRejectedValue(new Error('connect ECONNREFUSED'));

      expect(await sendWhatsappProvider.healthCheck!(DEV_ORG_ID)).toBe(false);
    });
  });

  // =====================================================================
  // V6–V9: payload validation
  // =====================================================================
  describe('V6 valid payload', () => {
    it('validates and trims a valid E.164 payload', () => {
      const result = sendWhatsappProvider.validatePayload({
        to: '  +15551234567  ',
        message: '  Hello!  ',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ to: '+15551234567', message: 'Hello!' });
    });
  });

  describe('V7 invalid phone', () => {
    it('rejects a non-E.164 phone number', () => {
      const result = sendWhatsappProvider.validatePayload({
        to: 'not-a-phone',
        message: 'Hi',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('V8 empty message', () => {
    it('rejects an empty message', () => {
      const result = sendWhatsappProvider.validatePayload({
        to: '+15551234567',
        message: '   ',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('V9 oversized message', () => {
    it('rejects a message exceeding 4096 characters', () => {
      const result = sendWhatsappProvider.validatePayload({
        to: '+15551234567',
        message: 'x'.repeat(4097),
      });

      expect(result.success).toBe(false);
    });
  });

  // =====================================================================
  // S10–S11: send
  // =====================================================================
  describe('S10 successful send', () => {
    it('returns success with providerMessageId = messages[0].id', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue(
        okResponse(JSON.stringify({ messages: [{ id: 'wamid.test-message-id' }] }))
      );

      const result = await sendWhatsappProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent(),
      });

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe('wamid.test-message-id');

      const { url, options } = callOptions();
      expect(url).toBe(`https://graph.facebook.com/v23.0/${TEST_PHONE_ID}/messages`);
      expect(options.method).toBe('POST');
      expect(options.headers?.Authorization).toBe(`Bearer ${TEST_API_TOKEN}`);
      expect(options.headers?.['Content-Type']).toBe('application/json');
      expect(options.returnBody).toBe(true);

      const body = JSON.parse(options.body ?? '{}');
      expect(body.messaging_product).toBe('whatsapp');
      expect(body.recipient_type).toBe('individual');
      expect(body.to).toBe('+15551234567');
      expect(body.type).toBe('text');
      expect(body.text.body).toBe('Hello!');
    });
  });

  describe('S11 API failure', () => {
    it('returns failure on 4xx', async () => {
      await seedConfig();
      mockedHttpRequest.mockResolvedValue({
        status: 400,
        ok: false,
        headers: headers({}),
        body: null,
      });

      const result: IntegrationSendResult = await sendWhatsappProvider.send({
        organizationId: DEV_ORG_ID,
        event: makeEvent(),
      });

      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('400');
      expect(mockedHttpRequest).toHaveBeenCalledTimes(1);
    });
  });

  // =====================================================================
  // R12: provider registry
  // =====================================================================
  describe('R12 provider registry contains WhatsApp', () => {
    it('is resolvable via getIntegrationProvider', () => {
      expect(getIntegrationProvider('whatsapp')).toBe(sendWhatsappProvider);
    });
  });
});
