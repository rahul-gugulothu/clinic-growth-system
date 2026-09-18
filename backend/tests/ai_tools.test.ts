import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { BadRequestError, NotFoundError } from '../src/types/index.js';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { setPool } from '../src/db/index.js';
import {
  listTools,
  getTool,
  executeTool,
  getExecutionResult,
} from '../src/services/aiTools.js';

const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEV_PROSPECT_ID = '00000000-0000-0000-0000-000000000010';
const DEV_CLINIC_ID = '00000000-0000-0000-0000-000000000020';
const DEV_FOUNDER_ID = '00000000-0000-0000-0000-000000000002';
const DEV_CLINIC_OWNER_ID = '00000000-0000-0000-0000-000000000003';
const INVALID_UUID = '00000000-0000-0000-0000-000000000999';
const TEST_AUDIT_ID = '00000000-0000-0000-0000-000000000100';
const TEST_OUTREACH_ID = '00000000-0000-0000-0000-000000000110';
const TEST_PROPOSAL_ID = '00000000-0000-0000-0000-000000000120';

const ORG_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PROSPECT_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee01';
const AUDIT_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee02';

describe('V3.1.0-B AI Tools', () => {
  let tdb: TestDatabase;
  let memPool: Pool;

  beforeAll(async () => {
    tdb = createTestDatabase();
    const pgLib = tdb.db.adapters.createPg();
    memPool = new pgLib.Pool();
    setPool(memPool);

    // Insert test audit for DEV_PROSPECT_ID
    await tdb.public.none(`
      INSERT INTO audits (
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
      '["No WhatsApp auto-confirm", "Review response time slow"]',
      '["Start WhatsApp automation", "Improve review response"]',
      'High',
      'demo',
      NOW()
      )
    `);

    // Insert test outreach for DEV_PROSPECT_ID
    await tdb.public.none(`
      INSERT INTO outreach (
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
      )
    `);

    // Insert test proposal for DEV_PROSPECT_ID
    await tdb.public.none(`
      INSERT INTO proposals (
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
      )
    `);

    // Insert Org B with its own prospect and audit (for tenant isolation)
    await tdb.public.none(`
      INSERT INTO organizations (id, name, status, timezone, data_source, created_at, updated_at)
      VALUES ('${ORG_B_ID}', 'Test Org B', 'trial', 'UTC', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO prospects (
        id, organization_id, clinic_name, doctor_name, specialty, area,
        priority, data_source, created_at, updated_at
      ) VALUES (
        '${PROSPECT_B_ID}',
        '${ORG_B_ID}',
        'Clinic B',
        'Dr. B',
        'Dermatology',
        'Area B',
        'Medium',
        'demo',
        NOW(),
        NOW()
      )
    `);
    await tdb.public.none(`
      INSERT INTO audits (
        id, organization_id, prospect_id, audit_date,
        discovery, google_presence, website, reviews, enquiry_process,
        overall_opportunity, data_source, created_at
      ) VALUES (
        '${AUDIT_B_ID}',
        '${ORG_B_ID}',
        '${PROSPECT_B_ID}',
        NOW(),
      'Good',
      '3 stars, 50 reviews',
      'Basic',
      'Mixed sentiment',
      'Slow response',
      'Medium',
      'demo',
      NOW()
      )
    `);
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  const query = (sql: string) => tdb.public.query(sql);

  // ==================================================================
  // A. REGISTRY
  // ==================================================================

  describe('A. Registry', () => {
    it('registry contains exactly 4 tools', () => {
      const tools = listTools();
      expect(tools).toHaveLength(4);
    });

    it('tools have correct IDs', () => {
      const tools = listTools();
      const ids = tools.map((t) => t.id).sort();
      expect(ids).toEqual([
        'audit-summary',
        'pipeline-diagnosis',
        'priority-clinics',
        'prospect-summary',
      ]);
    });

    it('all tools have human_review_required = false', () => {
      const tools = listTools();
      for (const tool of tools) {
        expect(tool.human_review_required).toBe(false);
      }
    });

    it('all tools have correct tenant scope', () => {
      const tools = listTools();
      for (const tool of tools) {
        expect(tool.tenant_scope).toBe('org');
      }
    });

    it('priority-clinics has no required context', () => {
      const tool = getTool('priority-clinics');
      expect(tool).toBeDefined();
      expect(tool!.required_context).toEqual([]);
    });

    it('prospect-summary requires prospectId', () => {
      const tool = getTool('prospect-summary');
      expect(tool).toBeDefined();
      expect(tool!.required_context).toContain('prospectId');
    });

    it('pipeline-diagnosis has no required context', () => {
      const tool = getTool('pipeline-diagnosis');
      expect(tool).toBeDefined();
      expect(tool!.required_context).toEqual([]);
    });

    it('audit-summary requires auditId', () => {
      const tool = getTool('audit-summary');
      expect(tool).toBeDefined();
      expect(tool!.required_context).toContain('auditId');
    });
  });

  // ==================================================================
  // B. CONTEXT VALIDATION
  // ==================================================================

  describe('B. Context Validation', () => {
    it('prospect-summary without prospectId is rejected', async () => {
      await expect(
        executeTool('prospect-summary', DEV_ORG_ID, DEV_FOUNDER_ID, null, {})
      ).rejects.toThrow(BadRequestError);
    });

    it('audit-summary without auditId is rejected', async () => {
      await expect(
        executeTool('audit-summary', DEV_ORG_ID, DEV_FOUNDER_ID, null, {})
      ).rejects.toThrow(BadRequestError);
    });

    it('prospect-summary with malformed UUID is rejected', async () => {
      await expect(
        executeTool('prospect-summary', DEV_ORG_ID, DEV_FOUNDER_ID, null, {
          prospectId: 'not-a-uuid',
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('audit-summary with malformed UUID is rejected', async () => {
      await expect(
        executeTool('audit-summary', DEV_ORG_ID, DEV_FOUNDER_ID, null, {
          auditId: 'not-a-uuid',
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('unknown tool ID is rejected', async () => {
      await expect(
        executeTool('nonexistent-tool', DEV_ORG_ID, DEV_FOUNDER_ID, null, {})
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ==================================================================
  // C. SUCCESSFUL EXECUTION
  // ==================================================================

  describe('C. Successful Execution', () => {
    it('priority-clinics executes successfully', async () => {
      const result = await executeTool(
        'priority-clinics',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );

      expect(result.status).toBe('completed');
      expect(result.requires_human_review).toBe(false);
      expect(result.data).toBeDefined();
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.completed_at).not.toBeNull();
    });

    it('prospect-summary executes successfully', async () => {
      const result = await executeTool(
        'prospect-summary',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      expect(result.status).toBe('completed');
      expect(result.requires_human_review).toBe(false);
      expect(result.data).toBeDefined();
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.completed_at).not.toBeNull();
    });

    it('pipeline-diagnosis executes successfully', async () => {
      const result = await executeTool(
        'pipeline-diagnosis',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );

      expect(result.status).toBe('completed');
      expect(result.requires_human_review).toBe(false);
      expect(result.data).toBeDefined();
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.completed_at).not.toBeNull();
    });

    it('audit-summary executes successfully', async () => {
      const result = await executeTool(
        'audit-summary',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { auditId: TEST_AUDIT_ID }
      );

      expect(result.status).toBe('completed');
      expect(result.requires_human_review).toBe(false);
      expect(result.data).toBeDefined();
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.completed_at).not.toBeNull();
    });

    it('priority-clinics returns structured data', async () => {
      const result = await executeTool(
        'priority-clinics',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );

      const data = result.data as { clinics: Array<{ prospectId: string; clinicName: string }> };
      expect(data.clinics).toBeInstanceOf(Array);
      expect(data.clinics.length).toBeGreaterThan(0);
      expect(data.clinics[0]).toHaveProperty('prospectId');
      expect(data.clinics[0]).toHaveProperty('clinicName');
      expect(data.clinics[0]).toHaveProperty('priority');
      expect(data.clinics[0]).toHaveProperty('currentStage');
      expect(data.clinics[0]).toHaveProperty('nextAction');
    });

    it('prospect-summary returns structured data', async () => {
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
    });

    it('pipeline-diagnosis returns structured data', async () => {
      const result = await executeTool(
        'pipeline-diagnosis',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );

      const data = result.data as {
        stages: Array<{ name: string; count: number; pct: number }>;
        bottleneck: { from: string; to: string; dropoff: number } | null;
        recommendation: string;
      };
      expect(data.stages).toBeInstanceOf(Array);
      expect(data.bottleneck).toBeDefined();
      expect(data.recommendation).toBeDefined();
    });

    it('audit-summary returns structured data', async () => {
      const result = await executeTool(
        'audit-summary',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { auditId: TEST_AUDIT_ID }
      );

      const data = result.data as {
        auditId: string;
        prospectName: string;
        overallOpportunity: string;
        areasReviewed: number;
        weaknessesCount: number;
        recommendationsCount: number;
        identifiedProblems: string[];
        recommendations: string[];
        areaFindings: Array<{ label: string; value: string }>;
        nextActions: string[];
        insufficientData: boolean;
      };
      expect(data.auditId).toBe(TEST_AUDIT_ID);
      expect(data.prospectName).toBe('Kaya Skin Clinic');
      expect(data.overallOpportunity).toBe('High');
      expect(data.areasReviewed).toBeGreaterThan(0);
      expect(data.weaknessesCount).toBeGreaterThan(0);
      expect(data.recommendationsCount).toBeGreaterThan(0);
      expect(data.identifiedProblems.length).toBeGreaterThan(0);
      expect(data.areaFindings.length).toBeGreaterThan(0);
      expect(data.insufficientData).toBe(false);
    });
  });

  // ==================================================================
  // Execution row persistence
  // ==================================================================

  describe('Execution row persistence', () => {
    it('priority-clinics creates execution row with correct fields', async () => {
      const result = await executeTool(
        'priority-clinics',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );

      const record = await getExecutionResult(result.id, DEV_ORG_ID);
      expect(record).not.toBeNull();
      expect(record!.tool_id).toBe('priority-clinics');
      expect(record!.organization_id).toBe(DEV_ORG_ID);
      expect(record!.user_id).toBe(DEV_FOUNDER_ID);
      expect(record!.status).toBe('completed');
      expect(record!.success).toBe(true);
      expect(record!.requires_human_review).toBe(false);
      expect(record!.started_at).toBeDefined();
      expect(record!.completed_at).toBeDefined();
      expect(record!.duration_ms).toBeGreaterThanOrEqual(0);
      expect(record!.result_output).not.toBeNull();
      expect(record!.error).toBeNull();
    });

    it('started_at is before completed_at', async () => {
      const result = await executeTool(
        'priority-clinics',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );

      const record = await getExecutionResult(result.id, DEV_ORG_ID);
      expect(record).not.toBeNull();
      expect(new Date(record!.started_at!).getTime()).toBeLessThanOrEqual(
        new Date(record!.completed_at!).getTime()
      );
    });
  });

  // ==================================================================
  // D. FAILED EXECUTION
  // ==================================================================

  describe('D. Failed Execution', () => {
    it('audit-summary with non-existent auditId throws NotFoundError', async () => {
      await expect(
        executeTool('audit-summary', DEV_ORG_ID, DEV_FOUNDER_ID, null, {
          auditId: INVALID_UUID,
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('prospect-summary with non-existent prospectId throws NotFoundError', async () => {
      await expect(
        executeTool('prospect-summary', DEV_ORG_ID, DEV_FOUNDER_ID, null, {
          prospectId: INVALID_UUID,
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('failed execution still records execution row', async () => {
      let executionId: string | null = null;
      try {
        await executeTool('audit-summary', DEV_ORG_ID, DEV_FOUNDER_ID, null, {
          auditId: INVALID_UUID,
        });
      } catch {
        // expected — we just need the ID for verification
      }

      // Query for the failed execution row
      const result = query(
        "SELECT * FROM ai_tool_executions WHERE tool_id = 'audit-summary' AND organization_id = '" +
          DEV_ORG_ID +
          "' AND status = 'failed' ORDER BY created_at DESC LIMIT 1"
      );

      expect(result.rowCount).toBe(1);
      const row = result.rows[0];
      expect(row.status).toBe('failed');
      expect(row.success).toBe(false);
      expect(row.error).toContain('not found');
      expect(row.completed_at).toBeDefined();
      executionId = row.id;
      expect(executionId).toBeDefined();
    });
  });

  // ==================================================================
  // E. TENANT ISOLATION
  // ==================================================================

  describe('E. Tenant Isolation', () => {
    it('cross-org prospect-summary returns NotFoundError', async () => {
      // DEV_PROSPECT_ID belongs to DEV_ORG_ID, requesting with ORG_B
      await expect(
        executeTool('prospect-summary', ORG_B_ID, DEV_FOUNDER_ID, null, {
          prospectId: DEV_PROSPECT_ID,
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('cross-org audit-summary returns NotFoundError', async () => {
      // TEST_AUDIT_ID belongs to DEV_ORG_ID, requesting with ORG_B
      await expect(
        executeTool('audit-summary', ORG_B_ID, DEV_FOUNDER_ID, null, {
          auditId: TEST_AUDIT_ID,
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('cross-org priority-clinics does not expose other org data', async () => {
      const result = await executeTool(
        'priority-clinics',
        ORG_B_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );

      const data = result.data as { clinics: Array<{ prospectId: string }> };
      // Should only contain ORG_B prospect, not DEV_ORG prospect
      for (const clinic of data.clinics) {
        expect(clinic.prospectId).not.toBe(DEV_PROSPECT_ID);
      }
    });

    it('audit-summary for org B audit succeeds with org B context', async () => {
      const result = await executeTool(
        'audit-summary',
        ORG_B_ID,
        DEV_FOUNDER_ID,
        null,
        { auditId: AUDIT_B_ID }
      );

      expect(result.status).toBe('completed');
      const data = result.data as { auditId: string };
      expect(data.auditId).toBe(AUDIT_B_ID);
    });
  });

  // ==================================================================
  // F. CLINIC-SCOPED USER RESTRICTION
  // ==================================================================

  describe('F. Clinic-Scoped User Restriction', () => {
    it('clinic-scoped user cannot execute org-scoped priority-clinics', async () => {
      await expect(
        executeTool(
          'priority-clinics',
          DEV_ORG_ID,
          DEV_CLINIC_OWNER_ID,
          DEV_CLINIC_ID,
          {}
        )
      ).rejects.toThrow(BadRequestError);
    });

    it('clinic-scoped user cannot execute org-scoped prospect-summary', async () => {
      await expect(
        executeTool(
          'prospect-summary',
          DEV_ORG_ID,
          DEV_CLINIC_OWNER_ID,
          DEV_CLINIC_ID,
          { prospectId: DEV_PROSPECT_ID }
        )
      ).rejects.toThrow(BadRequestError);
    });

    it('clinic-scoped user cannot execute org-scoped pipeline-diagnosis', async () => {
      await expect(
        executeTool(
          'pipeline-diagnosis',
          DEV_ORG_ID,
          DEV_CLINIC_OWNER_ID,
          DEV_CLINIC_ID,
          {}
        )
      ).rejects.toThrow(BadRequestError);
    });

    it('clinic-scoped user cannot execute org-scoped audit-summary', async () => {
      await expect(
        executeTool(
          'audit-summary',
          DEV_ORG_ID,
          DEV_CLINIC_OWNER_ID,
          DEV_CLINIC_ID,
          { auditId: TEST_AUDIT_ID }
        )
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ==================================================================
  // G. RESULT PERSISTENCE
  // ==================================================================

  describe('G. Result Persistence', () => {
    it('result_output contains the tool output for priority-clinics', async () => {
      const result = await executeTool(
        'priority-clinics',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );

      const record = await getExecutionResult(result.id, DEV_ORG_ID);
      expect(record).not.toBeNull();
      expect(record!.result_output).not.toBeNull();
      expect(record!.result_output!.clinics).toBeDefined();
      expect(Array.isArray(record!.result_output!.clinics)).toBe(true);
    });

    it('result_output contains the tool output for audit-summary', async () => {
      const result = await executeTool(
        'audit-summary',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { auditId: TEST_AUDIT_ID }
      );

      const record = await getExecutionResult(result.id, DEV_ORG_ID);
      expect(record).not.toBeNull();
      expect(record!.result_output).not.toBeNull();
      expect(record!.result_output!.overallOpportunity).toBe('High');
    });

    it('getExecutionResult returns null for non-existent execution', async () => {
      const result = await getExecutionResult(INVALID_UUID, DEV_ORG_ID);
      expect(result).toBeNull();
    });

    it('getExecutionResult returns null for cross-org access', async () => {
      const result = await executeTool(
        'priority-clinics',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );

      // Try to access with org B — should return null
      const record = await getExecutionResult(result.id, ORG_B_ID);
      expect(record).toBeNull();
    });
  });
});
