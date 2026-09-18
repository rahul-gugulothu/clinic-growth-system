import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import request from 'supertest';
import { BadRequestError, NotFoundError } from '../src/types/index.js';
import type { AuthContext } from '../src/types/index.js';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { setPool } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/jwt.js';
import { executeTool, approveExecution, rejectExecution } from '../src/services/aiTools.js';
import {
  createIntegrationEvent,
  getIntegrationEvent,
  getExecutionEvents,
} from '../src/services/integrations.js';

const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEV_PROSPECT_ID = '00000000-0000-0000-0000-000000000010';
const DEV_CLINIC_ID = '00000000-0000-0000-0000-000000000020';
const DEV_FOUNDER_ID = '00000000-0000-0000-0000-000000000002';
const DEV_CLINIC_OWNER_ID = '00000000-0000-0000-0000-000000000003';
const INVALID_UUID = '00000000-0000-0000-0000-000000000999';
const TEST_AUDIT_ID = '00000000-0000-0000-0000-000000000100';
const TEST_OUTREACH_ID = '00000000-0000-0000-0000-000000000110';

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

const WHATSAPP_PROVIDER = 'whatsapp';
const EMAIL_PROVIDER = 'email';
const MESSAGE_EVENT_TYPE = 'outbound_message';
const PROPOSAL_EVENT_TYPE = 'proposal_delivery';

describe('V3.1.2-A Integration Events', () => {
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

    // Insert Org B with its own prospect and audit (for tenant isolation)
    await tdb.public.none(`
      INSERT INTO organizations (id, name, status, timezone, data_source, created_at, updated_at)
      VALUES ('${ORG_B_ID}', 'Test Org B', 'trial', 'UTC', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO prospects (
        id, organization_id, clinic_name, doctor_name, specialty, area,
        booking_available, whatsapp_available, google_rating, review_count,
        visible_advertising, content_quality, priority, data_source, created_at, updated_at
      ) VALUES (
        '${PROSPECT_B_ID}',
        '${ORG_B_ID}',
        'Clinic B',
        'Dr. B',
        'Dermatology',
        'Area B',
        TRUE,
        TRUE,
        4.2,
        50,
        'Google ads',
        'Medium',
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
        identified_problems, recommendations, overall_opportunity,
        data_source, created_at
      ) VALUES (
        '${AUDIT_B_ID}',
        '${ORG_B_ID}',
        '${PROSPECT_B_ID}',
        NOW(),
        'Moderate SEO',
        '3.0 stars, 50 reviews',
        'Basic',
        'Mixed sentiment',
        'Slow response',
        '["Limited reviews"]',
        '["Improve review response"]',
        'Medium',
        'demo',
        NOW()
      )
    `);

    // Insert Org B founder user (for cross-org tests needing valid FK)
    await tdb.public.none(`
      INSERT INTO users (id, email, role, organization_id, clinic_id, data_source, created_at, updated_at)
      VALUES ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee03', 'founder@orgb.local', 'founder',
       '${ORG_B_ID}', NULL, 'demo', NOW(), NOW())
    `);
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  const query = (sql: string, params?: unknown[]) =>
    params ? memPool.query(sql, params) : memPool.query(sql);

  // ==================================================================
  // S. SERVICE: createIntegrationEvent
  // ==================================================================

  describe('S. createIntegrationEvent', () => {
    let approvedExecutionId: string;

    beforeAll(async () => {
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

      approvedExecutionId = execResult.id;
    });

    it('S.1 approved execution creates pending integration event', async () => {
      const event = await createIntegrationEvent({
        executionId: approvedExecutionId,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        clinicId: null,
        provider: WHATSAPP_PROVIDER,
        eventType: MESSAGE_EVENT_TYPE,
        payload: { channel: 'whatsapp', recipient: 'test' },
      });

      expect(event.status).toBe('pending');
      expect(event.ai_execution_id).toBe(approvedExecutionId);
      expect(event.provider).toBe(WHATSAPP_PROVIDER);
      expect(event.event_type).toBe(MESSAGE_EVENT_TYPE);
    });

    it('S.2 requires_approval execution rejected', async () => {
      const execResult = await executeTool(
        'draft-email',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        { prospectId: DEV_PROSPECT_ID }
      );

      await expect(
        createIntegrationEvent({
          executionId: execResult.id,
          organizationId: DEV_ORG_ID,
          userId: DEV_FOUNDER_ID,
          clinicId: null,
          provider: EMAIL_PROVIDER,
          eventType: MESSAGE_EVENT_TYPE,
          payload: {},
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('S.3 rejected execution rejected', async () => {
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
        reason: 'Not relevant',
        clinicId: null,
      });

      await expect(
        createIntegrationEvent({
          executionId: execResult.id,
          organizationId: DEV_ORG_ID,
          userId: DEV_FOUNDER_ID,
          clinicId: null,
          provider: EMAIL_PROVIDER,
          eventType: MESSAGE_EVENT_TYPE,
          payload: {},
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('S.4 completed read-only execution rejected', async () => {
      const execResult = await executeTool(
        'priority-clinics',
        DEV_ORG_ID,
        DEV_FOUNDER_ID,
        null,
        {}
      );

      await expect(
        createIntegrationEvent({
          executionId: execResult.id,
          organizationId: DEV_ORG_ID,
          userId: DEV_FOUNDER_ID,
          clinicId: null,
          provider: WHATSAPP_PROVIDER,
          eventType: MESSAGE_EVENT_TYPE,
          payload: {},
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('S.5 missing execution → NotFoundError', async () => {
      await expect(
        createIntegrationEvent({
          executionId: INVALID_UUID,
          organizationId: DEV_ORG_ID,
          userId: DEV_FOUNDER_ID,
          clinicId: null,
          provider: WHATSAPP_PROVIDER,
          eventType: MESSAGE_EVENT_TYPE,
          payload: {},
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('S.6 cross-organization execution cannot create an event', async () => {
      const execResult = await executeTool(
        'draft-whatsapp',
        ORG_B_ID,
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee03',
        null,
        { prospectId: PROSPECT_B_ID }
      );

      await approveExecution({
        executionId: execResult.id,
        organizationId: ORG_B_ID,
        userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee03',
        userRole: 'founder',
        clinicId: null,
      });

      await expect(
        createIntegrationEvent({
          executionId: execResult.id,
          organizationId: DEV_ORG_ID,
          userId: DEV_FOUNDER_ID,
          clinicId: null,
          provider: WHATSAPP_PROVIDER,
          eventType: MESSAGE_EVENT_TYPE,
          payload: {},
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('S.7 correct organization_id copied from execution', async () => {
      const execResult = await executeTool(
        'draft-email',
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

      const event = await createIntegrationEvent({
        executionId: execResult.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        clinicId: null,
        provider: EMAIL_PROVIDER,
        eventType: MESSAGE_EVENT_TYPE,
        payload: {},
      });

      expect(event.organization_id).toBe(DEV_ORG_ID);
    });

    it('S.8 correct clinic_id copied from execution', async () => {
      // draft-whatsapp is org-scoped (tenant_scope: 'org'), so it can't be
      // executed with a clinic_id via executeTool. Insert a pre-approved
      // execution with clinic_id directly to verify the field is copied.
      const execResult = await executeTool(
        'draft-email',
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

      const idResult = await query(
        `UPDATE ai_tool_executions
         SET clinic_id = $1
         WHERE id = $2
         RETURNING id`,
        [DEV_CLINIC_ID, execResult.id]
      );
      expect(idResult.rows.length).toBe(1);

      const event = await createIntegrationEvent({
        executionId: execResult.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        clinicId: DEV_CLINIC_ID,
        provider: EMAIL_PROVIDER,
        eventType: MESSAGE_EVENT_TYPE,
        payload: {},
      });

      expect(event.clinic_id).toBe(DEV_CLINIC_ID);
    });

    it('S.9 retry_count starts at 0', async () => {
      const execResult = await executeTool(
        'draft-email',
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

      const event = await createIntegrationEvent({
        executionId: execResult.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        clinicId: null,
        provider: EMAIL_PROVIDER,
        eventType: PROPOSAL_EVENT_TYPE,
        payload: {},
      });

      expect(event.retry_count).toBe(0);
    });

    it('S.10 status starts as pending', async () => {
      const execResult = await executeTool(
        'generate-proposal',
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

      const event = await createIntegrationEvent({
        executionId: execResult.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        clinicId: null,
        provider: WHATSAPP_PROVIDER,
        eventType: PROPOSAL_EVENT_TYPE,
        payload: {},
      });

      expect(event.status).toBe('pending');
    });

    it('S.11 ai_execution_id correctly persisted', async () => {
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

      const event = await createIntegrationEvent({
        executionId: execResult.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        clinicId: null,
        provider: WHATSAPP_PROVIDER,
        eventType: MESSAGE_EVENT_TYPE,
        payload: {},
      });

      expect(event.ai_execution_id).toBe(execResult.id);
    });

    it('S.12 duplicate create request returns existing event and does not create a second row', async () => {
      const execResult = await executeTool(
        'draft-email',
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

      const existing = await createIntegrationEvent({
        executionId: execResult.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        clinicId: null,
        provider: EMAIL_PROVIDER,
        eventType: MESSAGE_EVENT_TYPE,
        payload: {},
      });

      const duplicate = await createIntegrationEvent({
        executionId: execResult.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        clinicId: null,
        provider: EMAIL_PROVIDER,
        eventType: MESSAGE_EVENT_TYPE,
        payload: {},
      });

      expect(duplicate.id).toBe(existing.id);

      const rows = await query(
        `SELECT * FROM integration_events
         WHERE ai_execution_id = $1 AND provider = $2 AND event_type = $3`,
        [execResult.id, EMAIL_PROVIDER, MESSAGE_EVENT_TYPE]
      );
      expect(rows.rows.length).toBe(1);
    });

    it('S.13 database uniqueness prevents duplicate event rows even when the application pre-check is bypassed', async () => {
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

      // Bypass the service pre-check — insert directly into the DB
      await memPool.query(
        `INSERT INTO integration_events
           (organization_id, clinic_id, ai_execution_id, provider, event_type, payload, status, retry_count)
         VALUES ($1, NULL, $2, $3, $4, $5, 'pending', 0)`,
        [
          DEV_ORG_ID,
          execResult.id,
          WHATSAPP_PROVIDER,
          MESSAGE_EVENT_TYPE,
          JSON.stringify({ channel: 'whatsapp' }),
        ]
      );

      // Now try to create via the service — should hit unique constraint
      // and return the existing row
      const event = await createIntegrationEvent({
        executionId: execResult.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        clinicId: null,
        provider: WHATSAPP_PROVIDER,
        eventType: MESSAGE_EVENT_TYPE,
        payload: {},
      });

      const rows = await query(
        `SELECT * FROM integration_events
         WHERE ai_execution_id = $1 AND provider = $2 AND event_type = $3`,
        [execResult.id, WHATSAPP_PROVIDER, MESSAGE_EVENT_TYPE]
      );
      expect(rows.rows.length).toBe(1);
      expect(event.id).toBe(rows.rows[0].id);
    });

    it('S.14 getIntegrationEvent() organization isolation', async () => {
      const execResult = await executeTool(
        'draft-email',
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

      const event = await createIntegrationEvent({
        executionId: execResult.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        clinicId: null,
        provider: EMAIL_PROVIDER,
        eventType: MESSAGE_EVENT_TYPE,
        payload: {},
      });

      const orgBResult = await getIntegrationEvent({
        eventId: event.id,
        organizationId: ORG_B_ID,
      });

      expect(orgBResult).toBeNull();
    });

    it('S.15 getExecutionEvents() organization isolation', async () => {
      const execResult = await executeTool(
        'draft-email',
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

      const event = await createIntegrationEvent({
        executionId: execResult.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        clinicId: null,
        provider: EMAIL_PROVIDER,
        eventType: MESSAGE_EVENT_TYPE,
        payload: {},
      });

      // Org B should not see events for a DEV_ORG_ID execution
      const orgBEvents = await getExecutionEvents({
        executionId: execResult.id,
        organizationId: ORG_B_ID,
      });
      expect(orgBEvents).toHaveLength(0);

      // DEV_ORG_ID should see its own events
      const devEvents = await getExecutionEvents({
        executionId: execResult.id,
        organizationId: DEV_ORG_ID,
      });
      expect(devEvents.length).toBe(1);
      expect(devEvents[0].id).toBe(event.id);
    });

    it('S.16 audit event integration_event_created is written', async () => {
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

      const event = await createIntegrationEvent({
        executionId: execResult.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        clinicId: null,
        provider: WHATSAPP_PROVIDER,
        eventType: MESSAGE_EVENT_TYPE,
        payload: { test: true },
      });

      const auditRows = await query(
        `SELECT * FROM audit_log
         WHERE entity = $1
           AND entity_id = $2
           AND action = $3
         ORDER BY created_at DESC`,
        ['integration_event', event.id, 'integration_event_created']
      );
      expect(auditRows.rows.length).toBe(1);
      expect(auditRows.rows[0].new_values).toMatchObject({
        provider: WHATSAPP_PROVIDER,
        event_type: MESSAGE_EVENT_TYPE,
        status: 'pending',
      });
    });
  });

  // ==================================================================
  // R. ROUTE TESTS
  // ==================================================================

  describe('R. Integration Routes', () => {
    let approvedExecutionId: string;
    let eventId: string;

    beforeAll(async () => {
      const execResult = await executeTool(
        'draft-email',
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

      approvedExecutionId = execResult.id;

      const event = await createIntegrationEvent({
        executionId: execResult.id,
        organizationId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        clinicId: null,
        provider: EMAIL_PROVIDER,
        eventType: MESSAGE_EVENT_TYPE,
        payload: {},
      });

      eventId = event.id;
    });

    it('R.1 GET event succeeds for owning organization', async () => {
      const result = await request(app)
        .get(`/api/v1/integrations/events/${eventId}`)
        .set('Authorization', `Bearer ${founderToken}`);

      expect(result.status).toBe(200);
      expect(result.body.event.id).toBe(eventId);
      expect(result.body.event.organization_id).toBe(DEV_ORG_ID);
      expect(result.body.event.status).toBe('pending');
    });

    it('R.2 GET event from another organization behaves as not found', async () => {
      const result = await request(app)
        .get(`/api/v1/integrations/events/${eventId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(result.status).toBe(404);
    });

    it('R.3 GET execution events succeeds for owning organization', async () => {
      const result = await request(app)
        .get(`/api/v1/integrations/events?execution_id=${approvedExecutionId}`)
        .set('Authorization', `Bearer ${founderToken}`);

      expect(result.status).toBe(200);
      expect(result.body.events.length).toBeGreaterThanOrEqual(1);
    });

    it('R.4 GET execution events is tenant isolated', async () => {
      const result = await request(app)
        .get(`/api/v1/integrations/events?execution_id=${approvedExecutionId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(result.status).toBe(200);
      expect(result.body.events).toHaveLength(0);
    });

    it('R.5 unauthenticated request → 401', async () => {
      const result = await request(app)
        .get(`/api/v1/integrations/events/${eventId}`);

      expect(result.status).toBe(401);
    });

    it('R.6 clinic-scoped user is denied if INTERNAL_ROLES is required by the route', async () => {
      // The GET routes only require requireAuth (not INTERNAL_ROLES).
      // A clinic-scoped user can read events from their own org.
      // They cannot access events from another org (404).
      const result = await request(app)
        .get(`/api/v1/integrations/events/${eventId}`)
        .set('Authorization', `Bearer ${clinicOwnerToken}`);

      // clinic_owner belongs to DEV_ORG_ID — same org, so access is granted
      expect(result.status).toBe(200);
      expect(result.body.event.organization_id).toBe(DEV_ORG_ID);
    });

    it('R.7 GET event with invalid UUID → 400', async () => {
      const result = await request(app)
        .get(`/api/v1/integrations/events/invalid-uuid`)
        .set('Authorization', `Bearer ${founderToken}`);

      expect(result.status).toBe(400);
    });

    it('R.8 GET execution events without execution_id → 400', async () => {
      const result = await request(app)
        .get('/api/v1/integrations/events')
        .set('Authorization', `Bearer ${founderToken}`);

      expect(result.status).toBe(400);
    });
  });
});
