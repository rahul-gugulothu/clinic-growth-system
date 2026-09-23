import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, type TestDatabase } from '../helpers.js';
import { setPool } from '../../src/db/index.js';
import { executeTool, approveExecution, rejectExecution } from '../../src/services/aiTools.js';
import { setIntegrationConfig } from '../../src/services/integrationConfigs.js';
import {
  MockLLMClient,
  LLMError,
  type LLMClient,
  type LLMRequest,
  type LLMResponse,
} from '../../src/services/llm/client.js';
import { createLLMClient } from '../../src/services/llm/index.js';
import { logger } from '../../src/utils/logger.js';

vi.mock('../../src/services/llm/index.js', () => ({
  createLLMClient: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockedCreateLLMClient = vi.mocked(createLLMClient);
const mockedLoggerWarn = vi.mocked(logger.warn);

const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEV_PROSPECT_ID = '00000000-0000-0000-0000-000000000010';
const DEV_FOUNDER_ID = '00000000-0000-0000-0000-000000000002';
const DEV_CLINIC_ID = '00000000-0000-0000-0000-000000000020';
const TEST_AUDIT_ID = '00000000-0000-0000-0000-000000000100';

const SENDGRID_PROVIDER = 'sendgrid';
const TEST_API_KEY = 'SG.test.key.123';
const TEST_FROM_EMAIL = 'from@example.com';

const LLM_SUBJECT = 'Partnership opportunity for Kaya Skin Clinic';
const LLM_BODY = 'Dear Dr. Anaya Kaya,\n\nI loved your clinic profile and would like to explore how Clinic Growth can help. Are you available for a 15-minute call this week?\n\nBest regards,\nClinic Growth Team';

const DETERMINISTIC_SUBJECT = 'Growth Opportunity for Kaya Skin Clinic';

interface DraftEmailResult {
  channel: string;
  recipient: string;
  draftText: string;
  reasoning: string;
  to: string;
  subject: string;
  body: string;
  body_type: string;
}

class StubLLMClient implements LLMClient {
  private readonly response: LLMResponse | Error;

  constructor(response: LLMResponse | Error) {
    this.response = response;
  }

  async generateCompletion(_request: LLMRequest): Promise<LLMResponse> {
    if (this.response instanceof Error) {
      throw this.response;
    }
    return this.response;
  }
}

describe('V3.1.11 draft-email LLM path', () => {
  let tdb: TestDatabase;
  let memPool: Pool;

  const query = (sql: string, params?: unknown[]) =>
    memPool.query(sql, params ?? []);

  beforeAll(async () => {
    tdb = createTestDatabase();
    const pgLib = tdb.db.adapters.createPg();
    memPool = new pgLib.Pool();
    setPool(memPool);

    await memPool.query(
      `UPDATE prospects
       SET email = 'dr.anaya.kaya@example.com'
       WHERE id = '${DEV_PROSPECT_ID}'
         AND organization_id = '${DEV_ORG_ID}'`
    );

    await memPool.query(
      `INSERT INTO audits (
         id, organization_id, prospect_id, clinic_id, audit_date,
         discovery, google_presence, website, reviews, enquiry_process,
         identified_problems, recommendations, overall_opportunity,
         data_source, created_at
       ) VALUES (
         '${TEST_AUDIT_ID}',
         '${DEV_ORG_ID}',
         '${DEV_PROSPECT_ID}',
         '${DEV_CLINIC_ID}',
         NOW(),
         'Strong SEO presence',
         '4.5 stars, 200 reviews',
         'Professional, fast loading',
         'Positive sentiment, slow response',
         'Slow response time',
         '["No WhatsApp auto-confirm"]',
         '["Start WhatsApp automation"]',
         'High',
         'demo',
         NOW()
       )`
    );
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('LLM enhancement path', () => {
    const llmResponse: LLMResponse = {
      content: JSON.stringify({
        subject: LLM_SUBJECT,
        body: LLM_BODY,
        body_type: 'text',
      }),
      inputTokens: 10,
      outputTokens: 20,
    };

    const executeDraftEmail = () =>
      executeTool(
        'draft-email',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

    it('valid LLM output replaces deterministic subject and body', async () => {
      mockedCreateLLMClient.mockResolvedValue(new StubLLMClient(llmResponse));

      const result = await executeDraftEmail();

      expect(result.status).toBe('requires_approval');
      expect(result.requires_human_review).toBe(true);

      const data = result.data as DraftEmailResult;
      expect(data.subject).toBe(LLM_SUBJECT);
      expect(data.body).toBe(LLM_BODY);
      expect(data.body_type).toBe('text');
      expect(data.to).toBe('dr.anaya.kaya@example.com');
      expect(data.draftText).toBe(`Subject: ${LLM_SUBJECT}\n\n${LLM_BODY}`);
    });

    it('valid LLM output is reflected in persisted result_output', async () => {
      mockedCreateLLMClient.mockResolvedValue(new StubLLMClient(llmResponse));

      const result = await executeDraftEmail();
      const record = await query(
        `SELECT result_output FROM ai_tool_executions WHERE id = $1`,
        [result.id]
      );

      const output = record.rows[0].result_output as DraftEmailResult;
      expect(output.subject).toBe(LLM_SUBJECT);
      expect(output.body).toBe(LLM_BODY);
      expect(output.body_type).toBe('text');
    });

    it('MockLLMClient path falls back to deterministic output (default config is safe)', async () => {
      // MockLLMClient returns prospect-summary-shaped JSON, which does not
      // match the draft-email schema, so the tool must fall back deterministically.
      mockedCreateLLMClient.mockResolvedValue(new MockLLMClient());

      const result = await executeDraftEmail();

      const data = result.data as DraftEmailResult;
      expect(data.subject).toBe(DETERMINISTIC_SUBJECT);
      expect(data.body_type).toBe('text');
      expect(data.body).toBeTruthy();
      expect(data.draftText).toContain(`Subject: ${DETERMINISTIC_SUBJECT}`);
    });

    it('malformed LLM JSON (not parseable) causes deterministic fallback', async () => {
      mockedCreateLLMClient.mockResolvedValue(
        new StubLLMClient({ content: 'This is { not valid JSON', inputTokens: 1, outputTokens: 1 })
      );

      const result = await executeDraftEmail();
      const data = result.data as DraftEmailResult;
      expect(data.subject).toBe(DETERMINISTIC_SUBJECT);
    });

    it('malformed LLM JSON (schema mismatch — missing required fields) causes deterministic fallback', async () => {
      mockedCreateLLMClient.mockResolvedValue(
        new StubLLMClient({
          content: JSON.stringify({ some_other_field: 'wrong shape' }),
          inputTokens: 1,
          outputTokens: 1,
        })
      );

      const result = await executeDraftEmail();
      const data = result.data as DraftEmailResult;
      expect(data.subject).toBe(DETERMINISTIC_SUBJECT);
    });

    it('LLMError with api_error kind causes deterministic fallback', async () => {
      mockedCreateLLMClient.mockResolvedValue(
        new StubLLMClient(new LLMError('OpenAI API error', 'api_error', 500))
      );

      const result = await executeDraftEmail();
      const data = result.data as DraftEmailResult;
      expect(data.subject).toBe(DETERMINISTIC_SUBJECT);
    });

    it('LLMError with timeout kind causes deterministic fallback', async () => {
      mockedCreateLLMClient.mockResolvedValue(
        new StubLLMClient(new LLMError('LLM request timed out', 'timeout'))
      );

      const result = await executeDraftEmail();
      const data = result.data as DraftEmailResult;
      expect(data.subject).toBe(DETERMINISTIC_SUBJECT);
    });

    it('LLMError with network kind causes deterministic fallback', async () => {
      mockedCreateLLMClient.mockResolvedValue(
        new StubLLMClient(
          new LLMError('Network error contacting LLM provider', 'network')
        )
      );

      const result = await executeDraftEmail();
      const data = result.data as DraftEmailResult;
      expect(data.subject).toBe(DETERMINISTIC_SUBJECT);
    });

    it('LLMError with config_error kind causes deterministic fallback', async () => {
      mockedCreateLLMClient.mockResolvedValue(
        new StubLLMClient(new LLMError('Invalid LLM API key', 'config_error', 401))
      );

      const result = await executeDraftEmail();
      const data = result.data as DraftEmailResult;
      expect(data.subject).toBe(DETERMINISTIC_SUBJECT);
    });

    it('LLMError with parse_error kind causes deterministic fallback', async () => {
      mockedCreateLLMClient.mockResolvedValue(
        new StubLLMClient(new LLMError('LLM returned malformed JSON', 'parse_error'))
      );

      const result = await executeDraftEmail();
      const data = result.data as DraftEmailResult;
      expect(data.subject).toBe(DETERMINISTIC_SUBJECT);
    });

    it('generic (non-LLMError) exception from LLM causes deterministic fallback', async () => {
      mockedCreateLLMClient.mockResolvedValue(
        new StubLLMClient(new Error('Unexpected LLM failure'))
      );

      const result = await executeDraftEmail();
      const data = result.data as DraftEmailResult;
      expect(data.subject).toBe(DETERMINISTIC_SUBJECT);
    });

    it('undefined LLM client causes deterministic fallback', async () => {
      mockedCreateLLMClient.mockResolvedValue(undefined);

      const result = await executeDraftEmail();
      const data = result.data as DraftEmailResult;
      expect(data.subject).toBe(DETERMINISTIC_SUBJECT);
    });
  });

  describe('Approval bridge with LLM-enhanced output', () => {
    const seedSendGridConfig = async () => {
      await setIntegrationConfig({
        organizationId: DEV_ORG_ID,
        provider: SENDGRID_PROVIDER,
        configKey: 'api_key',
        value: TEST_API_KEY,
      });
      await setIntegrationConfig({
        organizationId: DEV_ORG_ID,
        provider: SENDGRID_PROVIDER,
        configKey: 'from_email',
        value: TEST_FROM_EMAIL,
      });
    };

    const getEmailEventFor = async (executionId: string) => {
      const rows = await query(
        `SELECT * FROM integration_events
         WHERE ai_execution_id = $1 AND provider = 'sendgrid' AND event_type = 'email.send'`,
        [executionId]
      );
      return rows.rows;
    };

    const llmResponse: LLMResponse = {
      content: JSON.stringify({
        subject: LLM_SUBJECT,
        body: LLM_BODY,
        body_type: 'text',
      }),
      inputTokens: 10,
      outputTokens: 20,
    };

    it('approved LLM-enhanced draft-email creates a SendGrid event with the LLM subject/body', async () => {
      mockedCreateLLMClient.mockResolvedValue(new StubLLMClient(llmResponse));
      await seedSendGridConfig();

      const exec = await executeTool(
        'draft-email',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      await approveExecution({
        executionId: exec.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        userRole: 'founder',
        clinicId: null,
      });

      const events = await getEmailEventFor(exec.id);
      expect(events).toHaveLength(1);

      const payload = events[0].payload as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual([
        'body',
        'body_type',
        'subject',
        'to',
      ]);
      expect(payload.to).toBe('dr.anaya.kaya@example.com');
      expect(payload.subject).toBe(LLM_SUBJECT);
      expect(payload.body).toBe(LLM_BODY);
      expect(payload.body_type).toBe('text');
    });

    it('rejected LLM-enhanced draft-email creates no SendGrid event', async () => {
      mockedCreateLLMClient.mockResolvedValue(new StubLLMClient(llmResponse));
      await seedSendGridConfig();

      const exec = await executeTool(
        'draft-email',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      await rejectExecution({
        executionId: exec.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        userRole: 'founder',
        reason: 'Not relevant',
        clinicId: null,
      });

      const events = await getEmailEventFor(exec.id);
      expect(events).toHaveLength(0);
    });
  });

  describe('Observability', () => {
    it('LLM failure emits a draft-email fallback warning with errorKind', async () => {
      mockedCreateLLMClient.mockResolvedValue(
        new StubLLMClient(new LLMError('OpenAI API error', 'api_error', 500))
      );

      await executeTool(
        'draft-email',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const fallbackCall = mockedLoggerWarn.mock.calls.find((call) => {
        const fields = call[0] as Record<string, unknown>;
        return (
          fields.tool === 'draft-email' &&
          fields.organizationId === DEV_ORG_ID &&
          fields.errorKind === 'api_error'
        );
      });
      expect(fallbackCall).toBeDefined();
      expect(fallbackCall![1]).toContain('falling back to deterministic');
    });

    it('LLM schema mismatch emits a draft-email fallback warning without errorKind', async () => {
      mockedCreateLLMClient.mockResolvedValue(
        new StubLLMClient({
          content: JSON.stringify({ some_other_field: 'wrong shape' }),
          inputTokens: 1,
          outputTokens: 1,
        })
      );

      await executeTool(
        'draft-email',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      expect(mockedLoggerWarn).toHaveBeenCalled();
      const call = mockedLoggerWarn.mock.calls.find((call) => {
        const fields = call[0] as Record<string, unknown>;
        return fields.tool === 'draft-email';
      });
      expect(call).toBeDefined();
      expect((call![0] as { errorKind?: unknown }).errorKind).toBeUndefined();
    });
  });
});
