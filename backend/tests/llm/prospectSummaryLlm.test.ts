import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, type TestDatabase } from '../helpers.js';
import { setPool } from '../../src/db/index.js';
import { executeTool } from '../../src/services/aiTools.js';
import { LLMError, type LLMClient, type LLMRequest, type LLMResponse } from '../../src/services/llm/client.js';

vi.mock('../../src/services/llm/index.js', () => ({
  createLLMClient: vi.fn(),
}));

import { createLLMClient } from '../../src/services/llm/index.js';

const mockedCreateLLMClient = vi.mocked(createLLMClient);

const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEV_PROSPECT_ID = '00000000-0000-0000-0000-000000000010';
const DEV_FOUNDER_ID = '00000000-0000-0000-0000-000000000002';
const DEV_CLINIC_ID = '00000000-0000-0000-0000-000000000020';
const TEST_AUDIT_ID = '00000000-0000-0000-0000-000000000100';
const TEST_OUTREACH_ID = '00000000-0000-0000-0000-000000000110';
const TEST_PROPOSAL_ID = '00000000-0000-0000-0000-000000000120';

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

const LLM_SUMMARY = 'LLM-generated research summary for Kaya Skin Clinic.';
const LLM_ACTION = 'LLM recommends scheduling a discovery call with Kaya Skin Clinic.';

const DETERMINISTIC_SUMMARY =
  'Verified facts: booking form on website, GBP active, 312 reviews. Observation: enquiry response time unknown';
const DETERMINISTIC_ACTION = 'Follow up on proposal decision';

describe('V3.1.10 prospect-summary LLM path', () => {
  let tdb: TestDatabase;
  let memPool: Pool;

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

    await memPool.query(
      `INSERT INTO outreach (
         id, organization_id, prospect_id, channel, contact_date,
         last_contact_at, next_action, stage, data_source, created_at, updated_at
       ) VALUES (
         '${TEST_OUTREACH_ID}',
         '${DEV_ORG_ID}',
         '${DEV_PROSPECT_ID}',
         'WhatsApp',
         NOW(),
         NOW(),
         'Follow up on proposal',
         'Proposal',
         'demo',
         NOW(),
         NOW()
       )`
    );

    await memPool.query(
      `INSERT INTO proposals (
         id, organization_id, prospect_id, problem, proposed_service,
         expected_outcomes, price_inr, timeline, status, data_source, created_at, updated_at
       ) VALUES (
         '${TEST_PROPOSAL_ID}',
         '${DEV_ORG_ID}',
         '${DEV_PROSPECT_ID}',
         'Low online booking conversion',
         'WhatsApp automation for bookings',
         'Increase qualified enquiries by 30%',
         50000,
         '6 weeks',
         'Sent',
         'demo',
         NOW(),
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
    it('when the LLM returns valid structured JSON, researchSummary and recommendedNextAction come from the LLM', async () => {
      const llmResponse: LLMResponse = {
        content: JSON.stringify({
          researchSummary: LLM_SUMMARY,
          recommendedNextAction: LLM_ACTION,
        }),
        inputTokens: 100,
        outputTokens: 50,
      };

      mockedCreateLLMClient.mockResolvedValue(new StubLLMClient(llmResponse));

      const result = await executeTool(
        'prospect-summary',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      expect(result.status).toBe('completed');
      expect(result.requires_human_review).toBe(false);

      const data = result.data as {
        researchSummary: string;
        recommendedNextAction: string;
      };

      expect(data.researchSummary).toBe(LLM_SUMMARY);
      expect(data.recommendedNextAction).toBe(LLM_ACTION);
    });

    it('malformed LLM JSON (not parseable) causes deterministic fallback', async () => {
      const llmResponse: LLMResponse = {
        content: 'This is { not valid JSON',
        inputTokens: 10,
        outputTokens: 5,
      };

      mockedCreateLLMClient.mockResolvedValue(new StubLLMClient(llmResponse));

      const result = await executeTool(
        'prospect-summary',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      expect(result.status).toBe('completed');
      expect(result.requires_human_review).toBe(false);

      const data = result.data as {
        researchSummary: string;
        recommendedNextAction: string;
      };

      expect(data.researchSummary).toContain(DETERMINISTIC_SUMMARY);
      expect(data.researchSummary).not.toBe(LLM_SUMMARY);
      expect(data.recommendedNextAction).toBe(DETERMINISTIC_ACTION);
    });

    it('malformed LLM JSON (schema mismatch — missing required fields) causes deterministic fallback', async () => {
      const llmResponse: LLMResponse = {
        content: JSON.stringify({ some_other_field: 'wrong shape' }),
        inputTokens: 10,
        outputTokens: 5,
      };

      mockedCreateLLMClient.mockResolvedValue(new StubLLMClient(llmResponse));

      const result = await executeTool(
        'prospect-summary',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      expect(result.status).toBe('completed');
      expect(result.requires_human_review).toBe(false);

      const data = result.data as {
        researchSummary: string;
        recommendedNextAction: string;
      };

      expect(data.researchSummary).toContain(DETERMINISTIC_SUMMARY);
      expect(data.recommendedNextAction).toBe(DETERMINISTIC_ACTION);
    });

    it('LLMError with api_error kind causes deterministic fallback', async () => {
      const llmError = new LLMError('OpenAI API error', 'api_error', 500);
      mockedCreateLLMClient.mockResolvedValue(new StubLLMClient(llmError));

      const result = await executeTool(
        'prospect-summary',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      expect(result.status).toBe('completed');
      expect(result.requires_human_review).toBe(false);

      const data = result.data as {
        researchSummary: string;
        recommendedNextAction: string;
      };

      expect(data.researchSummary).toContain(DETERMINISTIC_SUMMARY);
      expect(data.recommendedNextAction).toBe(DETERMINISTIC_ACTION);
    });

    it('LLMError with timeout kind causes deterministic fallback', async () => {
      const llmError = new LLMError('LLM request timed out', 'timeout');
      mockedCreateLLMClient.mockResolvedValue(new StubLLMClient(llmError));

      const result = await executeTool(
        'prospect-summary',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      expect(result.status).toBe('completed');
      expect(result.requires_human_review).toBe(false);

      const data = result.data as {
        researchSummary: string;
        recommendedNextAction: string;
      };

      expect(data.researchSummary).toContain(DETERMINISTIC_SUMMARY);
      expect(data.recommendedNextAction).toBe(DETERMINISTIC_ACTION);
    });

    it('LLMError with network kind causes deterministic fallback', async () => {
      const llmError = new LLMError('Network error contacting LLM provider', 'network');
      mockedCreateLLMClient.mockResolvedValue(new StubLLMClient(llmError));

      const result = await executeTool(
        'prospect-summary',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      expect(result.status).toBe('completed');
      expect(result.requires_human_review).toBe(false);

      const data = result.data as {
        researchSummary: string;
        recommendedNextAction: string;
      };

      expect(data.researchSummary).toContain(DETERMINISTIC_SUMMARY);
      expect(data.recommendedNextAction).toBe(DETERMINISTIC_ACTION);
    });

    it('LLMError with config_error kind causes deterministic fallback', async () => {
      const llmError = new LLMError('Invalid LLM API key', 'config_error', 401);
      mockedCreateLLMClient.mockResolvedValue(new StubLLMClient(llmError));

      const result = await executeTool(
        'prospect-summary',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      expect(result.status).toBe('completed');
      expect(result.requires_human_review).toBe(false);

      const data = result.data as {
        researchSummary: string;
        recommendedNextAction: string;
      };

      expect(data.researchSummary).toContain(DETERMINISTIC_SUMMARY);
      expect(data.recommendedNextAction).toBe(DETERMINISTIC_ACTION);
    });

    it('generic (non-LLMError) exception from LLM causes deterministic fallback', async () => {
      const genericError = new Error('Unexpected LLM failure');
      mockedCreateLLMClient.mockResolvedValue(new StubLLMClient(genericError));

      const result = await executeTool(
        'prospect-summary',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      expect(result.status).toBe('completed');
      expect(result.requires_human_review).toBe(false);

      const data = result.data as {
        researchSummary: string;
        recommendedNextAction: string;
      };

      expect(data.researchSummary).toContain(DETERMINISTIC_SUMMARY);
      expect(data.recommendedNextAction).toBe(DETERMINISTIC_ACTION);
    });
  });

  describe('Missing LLM client fallback', () => {
    it('undefined LLM client still uses deterministic fallback', async () => {
      mockedCreateLLMClient.mockResolvedValue(undefined);

      const result = await executeTool(
        'prospect-summary',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      expect(result.status).toBe('completed');
      expect(result.requires_human_review).toBe(false);

      const data = result.data as {
        researchSummary: string;
        recommendedNextAction: string;
      };

      expect(data.researchSummary).toContain(DETERMINISTIC_SUMMARY);
      expect(data.recommendedNextAction).toBe(DETERMINISTIC_ACTION);
    });

    it('undefined LLM client still returns all expected fields', async () => {
      mockedCreateLLMClient.mockResolvedValue(undefined);

      const result = await executeTool(
        'prospect-summary',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const data = result.data as {
        prospectId: string;
        clinic: string;
        doctor: string;
        specialty: string;
        area: string;
        priority: string;
        researchSummary: string;
        auditSummary: string;
        outreachStatus: string;
        proposalStatus: string;
        recommendedNextAction: string;
      };

      expect(data.prospectId).toBe(DEV_PROSPECT_ID);
      expect(data.clinic).toBe('Kaya Skin Clinic');
      expect(data.doctor).toBe('Dr. Anaya Kaya');
      expect(data.specialty).toBe('Aesthetic Dermatology');
      expect(data.area).toBe('Bandra West');
      expect(data.priority).toBe('High');
      expect(data.researchSummary).toBeDefined();
      expect(data.recommendedNextAction).toBeDefined();
      expect(data.auditSummary).toBeDefined();
      expect(data.outreachStatus).toBeDefined();
      expect(data.proposalStatus).toBeDefined();
    });
  });

  describe('LLM-enhanced output is actually used', () => {
    it('proves the LLM result overrides deterministic logic when valid JSON is returned', async () => {
      const uniqueSummary = 'UNIQUE_LLM_SUMMARY_99988';
      const uniqueAction = 'UNIQUE_LLM_ACTION_77766';

      const llmResponse: LLMResponse = {
        content: JSON.stringify({
          researchSummary: uniqueSummary,
          recommendedNextAction: uniqueAction,
        }),
      };

      mockedCreateLLMClient.mockResolvedValue(new StubLLMClient(llmResponse));

      const result = await executeTool(
        'prospect-summary',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const data = result.data as {
        researchSummary: string;
        recommendedNextAction: string;
      };

      expect(data.researchSummary).toBe(uniqueSummary);
      expect(data.recommendedNextAction).toBe(uniqueAction);
    });
  });
});
