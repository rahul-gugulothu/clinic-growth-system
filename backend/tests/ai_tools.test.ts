import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import request from 'supertest';
import { BadRequestError, NotFoundError, ForbiddenError } from '../src/types/index.js';
import type { AuthContext } from '../src/types/index.js';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { setPool } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/jwt.js';
import {
  listTools,
  getTool,
  executeTool,
  getExecutionResult,
  approveExecution,
  rejectExecution,
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

const founderAuth: AuthContext = {
  userId: DEV_FOUNDER_ID,
  organizationId: DEV_ORG_ID,
  role: 'founder',
  clinicId: null,
};

const clinicOwnerAuth: AuthContext = {
  userId: DEV_CLINIC_OWNER_ID,
  organizationId: DEV_ORG_ID,
  role: 'clinic_owner',
  clinicId: DEV_CLINIC_ID,
};

const userBAuth: AuthContext = {
  userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee03',
  organizationId: ORG_B_ID,
  role: 'founder',
  clinicId: null,
};

const founderToken = signAccessToken(founderAuth);
const clinicOwnerToken = signAccessToken(clinicOwnerAuth);
const userBToken = signAccessToken(userBAuth);

describe('V3.1.0-B AI Tools', () => {
  let tdb: TestDatabase;
  let memPool: Pool;
  const app = createApp();

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

  const query = (sql: string, params?: unknown[]) =>
    params ? memPool.query(sql, params) : memPool.query(sql);

  // ==================================================================
  // A. REGISTRY
  // ==================================================================

  describe('A. Registry', () => {
    it('registry contains exactly 11 tools', () => {
      const tools = listTools();
      expect(tools).toHaveLength(11);
    });

    it('tools have correct IDs', () => {
      const tools = listTools();
      const ids = tools.map((t) => t.id).sort();
      expect(ids).toEqual([
        'audit-summary',
        'call-preparation',
        'draft-email',
        'draft-whatsapp',
        'generate-proposal',
        'growth-opportunities',
        'pipeline-diagnosis',
        'priority-clinics',
        'prospect-summary',
        'weekly-report',
        'work-planner',
      ]);
    });

    it('non-action tools have human_review_required = false', () => {
      const tools = listTools().filter((t) => !['draft-whatsapp', 'draft-email', 'generate-proposal'].includes(t.id));
      for (const tool of tools) {
        expect(tool.human_review_required).toBe(false);
      }
    });

    it('action tools have human_review_required = true', () => {
      const actionTools = listTools().filter((t) => ['draft-whatsapp', 'draft-email', 'generate-proposal'].includes(t.id));
      expect(actionTools).toHaveLength(3);
      for (const tool of actionTools) {
        expect(tool.human_review_required).toBe(true);
      }
    });

    it('all tools have correct tenant scope', () => {
      const tools = listTools();
      for (const tool of tools) {
        expect(['org', 'clinic', 'mixed']).toContain(tool.tenant_scope);
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

    it('call-preparation requires prospectId', () => {
      const tool = getTool('call-preparation');
      expect(tool).toBeDefined();
      expect(tool!.required_context).toContain('prospectId');
    });

    it('work-planner has no required context', () => {
      const tool = getTool('work-planner');
      expect(tool).toBeDefined();
      expect(tool!.required_context).toEqual([]);
    });

    it('weekly-report has no required context', () => {
      const tool = getTool('weekly-report');
      expect(tool).toBeDefined();
      expect(tool!.required_context).toEqual([]);
    });

    it('growth-opportunities has no required context', () => {
      const tool = getTool('growth-opportunities');
      expect(tool).toBeDefined();
      expect(tool!.required_context).toEqual([]);
    });

    it('work-planner is clinic-scoped', () => {
      const tool = getTool('work-planner');
      expect(tool).toBeDefined();
      expect(tool!.tenant_scope).toBe('clinic');
    });

    it('growth-opportunities is clinic-scoped', () => {
      const tool = getTool('growth-opportunities');
      expect(tool).toBeDefined();
      expect(tool!.tenant_scope).toBe('clinic');
    });

    it('call-preparation is org-scoped', () => {
      const tool = getTool('call-preparation');
      expect(tool).toBeDefined();
      expect(tool!.tenant_scope).toBe('org');
    });

    it('weekly-report is org-scoped', () => {
      const tool = getTool('weekly-report');
      expect(tool).toBeDefined();
      expect(tool!.tenant_scope).toBe('org');
    });

    it('draft-whatsapp requires prospectId', () => {
      const tool = getTool('draft-whatsapp');
      expect(tool).toBeDefined();
      expect(tool!.required_context).toContain('prospectId');
    });

    it('draft-email requires prospectId', () => {
      const tool = getTool('draft-email');
      expect(tool).toBeDefined();
      expect(tool!.required_context).toContain('prospectId');
    });

    it('generate-proposal requires prospectId', () => {
      const tool = getTool('generate-proposal');
      expect(tool).toBeDefined();
      expect(tool!.required_context).toContain('prospectId');
    });

    it('draft-whatsapp has human_review_required = true', () => {
      const tool = getTool('draft-whatsapp');
      expect(tool!.human_review_required).toBe(true);
    });

    it('draft-email has human_review_required = true', () => {
      const tool = getTool('draft-email');
      expect(tool!.human_review_required).toBe(true);
    });

    it('generate-proposal has human_review_required = true', () => {
      const tool = getTool('generate-proposal');
      expect(tool!.human_review_required).toBe(true);
    });

    it('draft-whatsapp is org-scoped', () => {
      const tool = getTool('draft-whatsapp');
      expect(tool!.tenant_scope).toBe('org');
    });

    it('draft-email is org-scoped', () => {
      const tool = getTool('draft-email');
      expect(tool!.tenant_scope).toBe('org');
    });

    it('generate-proposal is org-scoped', () => {
      const tool = getTool('generate-proposal');
      expect(tool!.tenant_scope).toBe('org');
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
      const result = await query(
        `SELECT * FROM ai_tool_executions
         WHERE tool_id = $1 AND organization_id = $2 AND status = $3
         ORDER BY created_at DESC LIMIT 1`,
        ['audit-summary', DEV_ORG_ID, 'failed']
      );

      expect(result.rows.length).toBe(1);
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
  // ==================================================================
  // H. CALL-PREPARATION
  // ==================================================================

  describe('H. Call Preparation', () => {
    it('call-preparation executes successfully', async () => {
      const result = await executeTool(
        'call-preparation',
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

    it('call-preparation returns structured data', async () => {
      const result = await executeTool(
        'call-preparation',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const data = result.data as {
        objective: string;
        clinicContext: string;
        auditFindings: string[];
        discussionPoints: string[];
        questionsToAsk: string[];
        suggestedNextStep: string;
      };
      expect(data.objective).toContain('Kaya Skin Clinic');
      expect(data.clinicContext).toContain('Aesthetic Dermatology');
      expect(data.auditFindings).toBeInstanceOf(Array);
      expect(data.discussionPoints).toBeInstanceOf(Array);
      expect(data.discussionPoints.length).toBeGreaterThan(0);
      expect(data.questionsToAsk).toBeInstanceOf(Array);
      expect(data.questionsToAsk.length).toBeGreaterThan(0);
      expect(data.suggestedNextStep).toBeDefined();
    });

    it('call-preparation execution row completed', async () => {
      const result = await executeTool(
        'call-preparation',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const record = await getExecutionResult(result.id, DEV_ORG_ID);
      expect(record).not.toBeNull();
      expect(record!.status).toBe('completed');
      expect(record!.success).toBe(true);
      expect(record!.requires_human_review).toBe(false);
      expect(record!.completed_at).toBeDefined();
      expect(record!.duration_ms).toBeGreaterThanOrEqual(0);
      expect(record!.result_output).not.toBeNull();
    });

    it('call-preparation cross-org returns NotFoundError', async () => {
      await expect(
        executeTool(
          'call-preparation',
          ORG_B_ID,
          DEV_FOUNDER_ID,
          null,
          { prospectId: DEV_PROSPECT_ID }
        )
      ).rejects.toThrow(NotFoundError);
    });
  });
  // ==================================================================
  // I. WEEKLY-REPORT
  // ==================================================================

  describe('I. Weekly Report', () => {
    it('weekly-report executes successfully', async () => {
      const result = await executeTool(
        'weekly-report',
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

    it('weekly-report returns structured data', async () => {
      const result = await executeTool(
        'weekly-report',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );

      const data = result.data as {
        generatedAt: string;
        prospectsResearched: number;
        auditsCompleted: number;
        outreachRecords: number;
        responsesReceived: number;
        callsHad: number;
        proposalsCreated: number;
        wins: number;
        pipelineValue: number;
        recommendedFocus: string;
        insufficientData: boolean;
      };
      expect(data.generatedAt).toBeDefined();
      expect(data.prospectsResearched).toBeGreaterThanOrEqual(0);
      expect(data.auditsCompleted).toBeGreaterThanOrEqual(0);
      expect(data.outreachRecords).toBeGreaterThanOrEqual(0);
      expect(data.responsesReceived).toBeGreaterThanOrEqual(0);
      expect(data.callsHad).toBeGreaterThanOrEqual(0);
      expect(data.proposalsCreated).toBeGreaterThanOrEqual(0);
      expect(data.wins).toBeGreaterThanOrEqual(0);
      expect(data.pipelineValue).toBeGreaterThanOrEqual(0);
      expect(data.recommendedFocus).toBeDefined();
      expect(data.insufficientData).toBe(false);
    });

    it('weekly-report persistence verified', async () => {
      const result = await executeTool(
        'weekly-report',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );

      const record = await getExecutionResult(result.id, DEV_ORG_ID);
      expect(record).not.toBeNull();
      expect(record!.status).toBe('completed');
      expect(record!.result_output).not.toBeNull();
      expect(record!.result_output!.prospectsResearched).toBeDefined();
    });

    it('weekly-report org isolation', async () => {
      const result = await executeTool(
        'weekly-report',
        ORG_B_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );

      const data = result.data as {
        insufficientData: boolean;
        prospectsResearched: number;
      };
      expect(data.prospectsResearched).toBeGreaterThanOrEqual(0);
      expect(result.organization_id).toBe(ORG_B_ID);
    });
  });
  // ==================================================================
  // J. WORK-PLANNER
  // ==================================================================

  describe('J. Work Planner', () => {
    it('work-planner executes successfully for clinic-scoped user', async () => {
      const result = await executeTool(
        'work-planner',
        DEV_ORG_ID,
        DEV_CLINIC_OWNER_ID,
        DEV_CLINIC_ID,
        {}
      );

      expect(result.status).toBe('completed');
      expect(result.requires_human_review).toBe(false);
      expect(result.data).toBeDefined();
    });

    it('work-planner returns structured data', async () => {
      const result = await executeTool(
        'work-planner',
        DEV_ORG_ID,
        DEV_CLINIC_OWNER_ID,
        DEV_CLINIC_ID,
        {}
      );

      const data = result.data as {
        doNow: Array<{ task: string; reason: string }>;
        doToday: Array<{ task: string; reason: string }>;
        optional: Array<{ task: string; reason: string }>;
      };
      expect(data.doNow).toBeInstanceOf(Array);
      expect(data.doToday).toBeInstanceOf(Array);
      expect(data.optional).toBeInstanceOf(Array);
    });

    it('work-planner founder access (clinicId=null) succeeds', async () => {
      const result = await executeTool(
        'work-planner',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );

      expect(result.status).toBe('completed');
      expect(result.data).toBeDefined();
    });

    it('work-planner clinic isolation', async () => {
      const result = await executeTool(
        'work-planner',
        DEV_ORG_ID,
        DEV_CLINIC_OWNER_ID,
        DEV_CLINIC_ID,
        {}
      );

      const record = await getExecutionResult(result.id, DEV_ORG_ID);
      expect(record).not.toBeNull();
      expect(record!.clinic_id).toBe(DEV_CLINIC_ID);
    });

    it('work-planner cross-org denied', async () => {
      await expect(
        executeTool(
          'work-planner',
          ORG_B_ID,
          DEV_CLINIC_OWNER_ID,
          DEV_CLINIC_ID,
          {}
        )
      ).rejects.toThrow(Error);
    });
  });
  // ==================================================================
  // K. GROWTH-OPPORTUNITIES
  // ==================================================================

  describe('K. Growth Opportunities', () => {
    it('growth-opportunities executes successfully for clinic-scoped user', async () => {
      const result = await executeTool(
        'growth-opportunities',
        DEV_ORG_ID,
        DEV_CLINIC_OWNER_ID,
        DEV_CLINIC_ID,
        {}
      );

      expect(result.status).toBe('completed');
      expect(result.requires_human_review).toBe(false);
      expect(result.data).toBeDefined();
    });

    it('growth-opportunities returns structured data', async () => {
      const result = await executeTool(
        'growth-opportunities',
        DEV_ORG_ID,
        DEV_CLINIC_OWNER_ID,
        DEV_CLINIC_ID,
        {}
      );

      const data = result.data as {
        opportunities: Array<{
          opportunity: string;
          evidence: string;
          suggestedAction: string;
          confidence: 'high' | 'medium' | 'low';
        }>;
      };
      expect(data.opportunities).toBeInstanceOf(Array);
      expect(data.opportunities.length).toBeGreaterThan(0);
      for (const opp of data.opportunities) {
        expect(opp).toHaveProperty('opportunity');
        expect(opp).toHaveProperty('evidence');
        expect(opp).toHaveProperty('suggestedAction');
        expect(opp).toHaveProperty('confidence');
        expect(['high', 'medium', 'low']).toContain(opp.confidence);
      }
    });

    it('growth-opportunities founder access (clinicId=null) succeeds', async () => {
      const result = await executeTool(
        'growth-opportunities',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );

      expect(result.status).toBe('completed');
      const data = result.data as {
        opportunities: Array<Record<string, unknown>>
      };
      expect(data.opportunities.length).toBeGreaterThan(0);
    });

    it('growth-opportunities clinic isolation', async () => {
      const result = await executeTool(
        'growth-opportunities',
        DEV_ORG_ID,
        DEV_CLINIC_OWNER_ID,
        DEV_CLINIC_ID,
        {}
      );

      const record = await getExecutionResult(result.id, DEV_ORG_ID);
      expect(record).not.toBeNull();
      expect(record!.clinic_id).toBe(DEV_CLINIC_ID);
    });

    it('growth-opportunities cross-org denied', async () => {
      await expect(
        executeTool(
          'growth-opportunities',
          ORG_B_ID,
          DEV_CLINIC_OWNER_ID,
          DEV_CLINIC_ID,
          {}
        )
      ).rejects.toThrow(Error);
    });
  });
  // ==================================================================
  // L. EXECUTION PROPERTIES FOR NEW TOOLS
  // ==================================================================

  describe('L. Execution Properties for New Tools', () => {
    it('all new tools have requires_human_review = false', async () => {
      for (const toolId of [
        'call-preparation',
        'weekly-report',
        'work-planner',
        'growth-opportunities',
      ]) {
        const tool = getTool(toolId);
        expect(tool).toBeDefined();
        expect(tool!.human_review_required).toBe(false);
      }
    });

    it('call-preparation execution persists result_output', async () => {
      const result = await executeTool(
        'call-preparation',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const record = await getExecutionResult(result.id, DEV_ORG_ID);
      expect(record).not.toBeNull();
      expect(record!.result_output).not.toBeNull();
      expect(record!.result_output!.objective).toBeDefined();
    });

    it('weekly-report execution persists result_output', async () => {
      const result = await executeTool(
        'weekly-report',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );

      const record = await getExecutionResult(result.id, DEV_ORG_ID);
      expect(record).not.toBeNull();
      expect(record!.result_output).not.toBeNull();
      expect(record!.result_output!.recommendedFocus).toBeDefined();
    });
  });


  // ==================================================================
  // M. DRAFT-WHATSAPP
  // ==================================================================

  describe('M. Draft WhatsApp', () => {
    it('draft-whatsapp succeeds with valid prospectId', async () => {
      const result = await executeTool(
        'draft-whatsapp',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      expect(result.status).toBe('requires_approval');
      expect(result.requires_human_review).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.completed_at).not.toBeNull();
      expect(result.approved_by).toBeNull();
      expect(result.approved_at).toBeNull();
    });

    it('draft-whatsapp returns structured data', async () => {
      const result = await executeTool(
        'draft-whatsapp',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const data = result.data as {
        channel: string;
        recipient: string;
        draftText: string;
        reasoning: string;
      };
      expect(data.channel).toBe('WhatsApp');
      expect(data.recipient).toContain('Kaya Skin Clinic');
      expect(data.draftText).toBeDefined();
      expect(data.reasoning).toBeDefined();
    });

    it('draft-whatsapp execution row has requires_human_review = true', async () => {
      const result = await executeTool(
        'draft-whatsapp',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const record = await getExecutionResult(result.id, DEV_ORG_ID);
      expect(record).not.toBeNull();
      expect(record!.status).toBe('requires_approval');
      expect(record!.success).toBe(true);
      expect(record!.requires_human_review).toBe(true);
      expect(record!.result_output).not.toBeNull();
      expect(record!.result_output!.channel).toBe('WhatsApp');
    });

    it('draft-whatsapp cross-org returns NotFoundError', async () => {
      await expect(
        executeTool(
          'draft-whatsapp',
          ORG_B_ID,
          DEV_FOUNDER_ID,
          null,
          { prospectId: DEV_PROSPECT_ID }
        )
      ).rejects.toThrow(NotFoundError);
    });

    it('draft-whatsapp missing prospectId rejected', async () => {
      await expect(
        executeTool(
          'draft-whatsapp',
          DEV_ORG_ID,
          DEV_FOUNDER_ID,
          null,
          {}
        )
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ==================================================================
  // N. DRAFT-EMAIL
  // ==================================================================

  describe('N. Draft Email', () => {
    it('draft-email succeeds with valid prospectId', async () => {
      const result = await executeTool(
        'draft-email',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      expect(result.status).toBe('requires_approval');
      expect(result.requires_human_review).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.completed_at).not.toBeNull();
      expect(result.approved_by).toBeNull();
      expect(result.approved_at).toBeNull();
    });

    it('draft-email returns structured data', async () => {
      const result = await executeTool(
        'draft-email',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const data = result.data as {
        channel: string;
        recipient: string;
        draftText: string;
        reasoning: string;
      };
      expect(data.channel).toBe('Email');
      expect(data.recipient).toContain('Kaya Skin Clinic');
      expect(data.draftText).toContain('Subject:');
      expect(data.reasoning).toBeDefined();
    });

    it('draft-email execution row has requires_human_review = true', async () => {
      const result = await executeTool(
        'draft-email',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const record = await getExecutionResult(result.id, DEV_ORG_ID);
      expect(record).not.toBeNull();
      expect(record!.status).toBe('requires_approval');
      expect(record!.requires_human_review).toBe(true);
      expect(record!.result_output).not.toBeNull();
      expect(record!.result_output!.channel).toBe('Email');
    });

    it('draft-email cross-org returns NotFoundError', async () => {
      await expect(
        executeTool(
          'draft-email',
          ORG_B_ID,
          DEV_FOUNDER_ID,
          null,
          { prospectId: DEV_PROSPECT_ID }
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ==================================================================
  // O. GENERATE-PROPOSAL
  // ==================================================================

  describe('O. Generate Proposal', () => {
    it('generate-proposal succeeds with valid prospectId', async () => {
      const result = await executeTool(
        'generate-proposal',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      expect(result.status).toBe('requires_approval');
      expect(result.requires_human_review).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.completed_at).not.toBeNull();
      expect(result.approved_by).toBeNull();
      expect(result.approved_at).toBeNull();
    });

    it('generate-proposal returns structured data', async () => {
      const result = await executeTool(
        'generate-proposal',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const data = result.data as {
        clinic: string;
        scope: string;
        expectedOutcomes: string;
        timeline: string;
        price?: number;
        assumptions: string[];
        nextStep: string;
      };
      expect(data.clinic).toBe('Kaya Skin Clinic');
      expect(data.scope).toBeDefined();
      expect(data.expectedOutcomes).toBeDefined();
      expect(data.timeline).toBeDefined();
      expect(data.assumptions).toBeInstanceOf(Array);
      expect(data.assumptions.length).toBeGreaterThan(0);
      expect(data.nextStep).toBeDefined();
    });

    it('generate-proposal execution row has requires_human_review = true', async () => {
      const result = await executeTool(
        'generate-proposal',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const record = await getExecutionResult(result.id, DEV_ORG_ID);
      expect(record).not.toBeNull();
      expect(record!.status).toBe('requires_approval');
      expect(record!.requires_human_review).toBe(true);
      expect(record!.result_output).not.toBeNull();
      expect(record!.result_output!.clinic).toBe('Kaya Skin Clinic');
    });

    it('generate-proposal cross-org returns NotFoundError', async () => {
      await expect(
        executeTool(
          'generate-proposal',
          ORG_B_ID,
          DEV_FOUNDER_ID,
          null,
          { prospectId: DEV_PROSPECT_ID }
        )
      ).rejects.toThrow(NotFoundError);
    });

    it('generate-proposal missing prospectId rejected', async () => {
      await expect(
        executeTool(
          'generate-proposal',
          DEV_ORG_ID,
          DEV_FOUNDER_ID,
          null,
          {}
        )
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ==================================================================
  // P. ACTION TOOL EXECUTION PROPERTIES
  // ==================================================================

  describe('P. Action Tool Execution Properties', () => {
    it('all action tools have requires_human_review = true', async () => {
      for (const toolId of [
        'draft-whatsapp',
        'draft-email',
        'generate-proposal',
      ]) {
        const tool = getTool(toolId);
        expect(tool).toBeDefined();
        expect(tool!.human_review_required).toBe(true);
      }
    });

    it('draft-whatsapp result persists to result_output', async () => {
      const result = await executeTool(
        'draft-whatsapp',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const record = await getExecutionResult(result.id, DEV_ORG_ID);
      expect(record).not.toBeNull();
      expect(record!.result_output).not.toBeNull();
      expect(record!.result_output!.draftText).toBeDefined();
    });

    it('draft-email result persists to result_output', async () => {
      const result = await executeTool(
        'draft-email',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const record = await getExecutionResult(result.id, DEV_ORG_ID);
      expect(record).not.toBeNull();
      expect(record!.result_output).not.toBeNull();
      expect(record!.result_output!.channel).toBe('Email');
    });

    it('generate-proposal result persists to result_output', async () => {
      const result = await executeTool(
        'generate-proposal',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const record = await getExecutionResult(result.id, DEV_ORG_ID);
      expect(record).not.toBeNull();
      expect(record!.result_output).not.toBeNull();
      expect(record!.result_output!.scope).toBeDefined();
    });
  });

  // ==================================================================
  // Q. APPROVAL WORKFLOW (V3.1.1)
  // ==================================================================

  describe('Q. Approval Workflow', () => {
    let actionExecutionId: string;
    let readOnlyExecutionId: string;

    beforeAll(async () => {
      const actionResult = await executeTool(
        'draft-whatsapp',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );
      actionExecutionId = actionResult.id;

      const readOnlyResult = await executeTool(
        'priority-clinics',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );
      readOnlyExecutionId = readOnlyResult.id;
    });

    it('Q.1 requires_approval execution status for action tool', () => {
      expect(actionExecutionId).toBeDefined();
      // Verified by status assertions in section M
    });

    it('Q.13 executeTool action tool sets status = requires_approval', async () => {
      const result = await executeTool(
        'draft-email',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );
      expect(result.status).toBe('requires_approval');
      expect(result.requires_human_review).toBe(true);
      expect(result.approved_by).toBeNull();
      expect(result.approved_at).toBeNull();
    });

    it('Q.14 executeTool read-only tool sets status = completed', async () => {
      const result = await executeTool(
        'priority-clinics',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );
      expect(result.status).toBe('completed');
      expect(result.requires_human_review).toBe(false);
    });

    it('Q.16 approved_by / approved_at not populated during initial execution', async () => {
      const result = await executeTool(
        'generate-proposal',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );
      expect(result.approved_by).toBeNull();
      expect(result.approved_at).toBeNull();
    });

    it('Q.1 valid approval: requires_approval → approved', async () => {
      const execution = await approveExecution({
        executionId: actionExecutionId,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        userRole: 'founder',
        clinicId: null,
      });

      expect(execution.status).toBe('approved');
      expect(execution.approved_by).toBe(DEV_FOUNDER_ID);
      expect(execution.approved_at).not.toBeNull();
    });

    it('Q.6 already approved: second approve → BadRequestError', async () => {
      await expect(
        approveExecution({
          executionId: actionExecutionId,
          organizationId: DEV_ORG_ID,
          userId: DEV_FOUNDER_ID,
          userRole: 'founder',
          clinicId: null,
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('Q.2 valid rejection: requires_approval → rejected', async () => {
      const result = await executeTool(
        'draft-whatsapp',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const execution = await rejectExecution({
        executionId: result.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        userRole: 'founder',
        reason: 'Client not interested in WhatsApp outreach',
        clinicId: null,
      });

      expect(execution.status).toBe('rejected');
    });

    it('Q.7 already rejected: approve rejected execution → BadRequestError', async () => {
      const result = await executeTool(
        'draft-whatsapp',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      await rejectExecution({
        executionId: result.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        userRole: 'founder',
        reason: 'Initial rejection',
        clinicId: null,
      });

      await expect(
        approveExecution({
          executionId: result.id,
          organizationId: DEV_ORG_ID,
          userId: DEV_FOUNDER_ID,
          userRole: 'founder',
          clinicId: null,
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('Q.3 clinic-scoped user cannot approve', async () => {
      await expect(
        approveExecution({
          executionId: actionExecutionId,
          organizationId: DEV_ORG_ID,
          userId: DEV_CLINIC_OWNER_ID,
          userRole: 'clinic_owner',
          clinicId: DEV_CLINIC_ID,
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it('Q.4 cross-org isolation: cannot approve another org execution', async () => {
      await expect(
        approveExecution({
          executionId: actionExecutionId,
          organizationId: ORG_B_ID,
          userId: DEV_FOUNDER_ID,
          userRole: 'founder',
          clinicId: null,
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it('Q.5 completed non-reviewable execution → BadRequestError', async () => {
      await expect(
        approveExecution({
          executionId: readOnlyExecutionId,
          organizationId: DEV_ORG_ID,
          userId: DEV_FOUNDER_ID,
          userRole: 'founder',
          clinicId: null,
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('Q.8 failed execution cannot be approved', async () => {
      try {
        await executeTool(
          'draft-whatsapp',
          DEV_ORG_ID,
          DEV_FOUNDER_ID,
          null,
          { prospectId: INVALID_UUID }
        );
      } catch {
        // expected - tool execution fails with NotFoundError
      }

      const failedRows = await query(
        `SELECT id FROM ai_tool_executions
         WHERE tool_id = $1 AND status = $2 AND organization_id = $3
         ORDER BY created_at DESC LIMIT 1`,
        ['draft-whatsapp', 'failed', DEV_ORG_ID]
      );
      expect(failedRows.rows.length).toBe(1);

      await expect(
        approveExecution({
          executionId: failedRows.rows[0].id,
          organizationId: DEV_ORG_ID,
          userId: DEV_FOUNDER_ID,
          userRole: 'founder',
          clinicId: null,
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('Q.9 approval audit event created', async () => {
      const execResult = await executeTool(
        'draft-whatsapp',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      await approveExecution({
        executionId: execResult.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        userRole: 'founder',
        clinicId: null,
      });

      const auditRows = await query(
        `SELECT * FROM audit_log
         WHERE entity = $1
           AND entity_id = $2
           AND action = $3
         ORDER BY created_at DESC`,
        ['ai_tool_execution', execResult.id, 'ai_execution_approved']
      );
      expect(auditRows.rows.length).toBe(1);
      expect(auditRows.rows[0].new_values).toMatchObject({
        status: 'approved',
        approved_by: DEV_FOUNDER_ID,
      });
    });

    it('Q.10 rejection audit event created', async () => {
      const execResult = await executeTool(
        'draft-email',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      await rejectExecution({
        executionId: execResult.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        userRole: 'founder',
        reason: 'Not a good fit for the clinic',
        clinicId: null,
      });

      const auditRows = await query(
        `SELECT * FROM audit_log
         WHERE entity = $1
           AND entity_id = $2
           AND action = $3
         ORDER BY created_at DESC`,
        ['ai_tool_execution', execResult.id, 'ai_execution_rejected']
      );
      expect(auditRows.rows.length).toBe(1);
      expect(auditRows.rows[0].new_values).toMatchObject({
        status: 'rejected',
        reason: 'Not a good fit for the clinic',
      });
    });

    it('Q.11 repeated approval is idempotent (only one succeeds)', async () => {
      const execResult = await executeTool(
        'generate-proposal',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const first = await approveExecution({
        executionId: execResult.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        userRole: 'founder',
        clinicId: null,
      });

      expect(first.status).toBe('approved');

      await expect(
        approveExecution({
          executionId: execResult.id,
          organizationId: DEV_ORG_ID,
          userId: DEV_FOUNDER_ID,
          userRole: 'founder',
          clinicId: null,
        })
      ).rejects.toThrow(BadRequestError);

      const record = await getExecutionResult(execResult.id, DEV_ORG_ID);
      expect(record!.status).toBe('approved');
    });

    it('Q.12 rejection reason persists in audit event', async () => {
      const execResult = await executeTool(
        'draft-whatsapp',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      await rejectExecution({
        executionId: execResult.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        userRole: 'founder',
        reason: 'Prospect already has WhatsApp automation',
        clinicId: null,
      });

      const auditRows = await query(
        `SELECT * FROM audit_log
         WHERE entity = $1
           AND entity_id = $2
           AND action = $3
         ORDER BY created_at DESC`,
        ['ai_tool_execution', execResult.id, 'ai_execution_rejected']
      );
      expect(auditRows.rows[0].new_values).toMatchObject({
        status: 'rejected',
        reason: 'Prospect already has WhatsApp automation',
      });
    });

    it('Q.15 GET execution organization isolation', async () => {
      const result = await request(app)
        .get(`/api/v1/ai/${actionExecutionId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(result.status).toBe(404);
    });

    it('Q.17 approve route requires authentication', async () => {
      const result = await request(app)
        .post(`/api/v1/ai/${readOnlyExecutionId}/approve`)
        .send();

      expect(result.status).toBe(401);
    });

    it('Q.18 approve route rejects clinic-scoped roles', async () => {
      const result = await request(app)
        .post(`/api/v1/ai/${readOnlyExecutionId}/approve`)
        .set('Authorization', `Bearer ${clinicOwnerToken}`);

      expect(result.status).toBe(403);
    });

    it('Q.R1 valid approval via route', async () => {
      const execResult = await executeTool(
        'draft-whatsapp',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const result = await request(app)
        .post(`/api/v1/ai/${execResult.id}/approve`)
        .set('Authorization', `Bearer ${founderToken}`);

      expect(result.status).toBe(200);
      expect(result.body.execution.status).toBe('approved');
      expect(result.body.execution.approved_by).toBe(DEV_FOUNDER_ID);
      expect(result.body.execution.approved_at).not.toBeNull();
    });

    it('Q.R2 valid rejection via route', async () => {
      const execResult = await executeTool(
        'draft-email',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      const result = await request(app)
        .post(`/api/v1/ai/${execResult.id}/reject`)
        .set('Authorization', `Bearer ${founderToken}`)
        .send({ reason: 'Client feedback negative' });

      expect(result.status).toBe(200);
      expect(result.body.execution.status).toBe('rejected');
    });

    it('Q.R3 GET execution detail via route', async () => {
      const result = await request(app)
        .get(`/api/v1/ai/${readOnlyExecutionId}`)
        .set('Authorization', `Bearer ${founderToken}`);

      expect(result.status).toBe(200);
      expect(result.body.execution.id).toBe(readOnlyExecutionId);
      expect(result.body.execution.organization_id).toBe(DEV_ORG_ID);
    });
  });
});
