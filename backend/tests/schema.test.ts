import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers.js';

describe('Schema Validation', () => {
  let tdb: TestDatabase;

  beforeAll(() => {
    tdb = createTestDatabase();
  });

  const hasTable = (table: string): boolean => {
    const result = tdb.public.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name = '" + table + "' AND table_schema = 'public'"
    );
    return result.rowCount === 1;
  };

  const hasColumn = (table: string, column: string): boolean => {
    const result = tdb.public.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = '" + table + "' AND column_name = '" + column + "'"
    );
    return result.rowCount === 1;
  };

  const getColumnUdtName = (table: string, column: string): string => {
    const result = tdb.public.query(
      "SELECT udt_name FROM information_schema.columns WHERE table_name = '" + table + "' AND column_name = '" + column + "'"
    );
    return result.rows[0]?.udt_name ?? 'UNKNOWN';
  };

  const listIndices = (table: string): string[] => {
    const tbl = tdb.db.getTable(table);
    if (!tbl) return [];
    return tbl.listIndices().map((i) => i.name);
  };

  it('all 17 core tables exist', () => {
    const expectedTables = [
      'organizations', 'users', 'clinics', 'doctors', 'staff', 'prospects',
      'audits', 'outreach', 'proposals', 'leads', 'conversations', 'messages',
      'appointments', 'followups', 'reviews', 'business_outcomes', 'referrals',
    ];

    for (const table of expectedTables) {
      expect(hasTable(table), `Table ${table} should exist`).toBe(true);
    }
  });

  it('supplementary tables exist (audit_log, ai_tool_executions, integration_events, integration_configs)', () => {
    const tables = ['audit_log', 'ai_tool_executions', 'integration_events', 'integration_configs'];
    for (const table of tables) {
      expect(hasTable(table), `Table ${table} should exist`).toBe(true);
    }
  });

  it('all tables have UUID primary key column named "id"', () => {
    const tables = [
      'organizations', 'users', 'clinics', 'doctors', 'staff', 'prospects',
      'audits', 'outreach', 'proposals', 'leads', 'conversations', 'messages',
      'appointments', 'followups', 'reviews', 'business_outcomes', 'referrals',
      'audit_log', 'ai_tool_executions', 'integration_events', 'integration_configs',
    ];

    for (const table of tables) {
      expect(hasColumn(table, 'id'), `Table ${table} should have 'id' column`).toBe(true);
      const tbl = tdb.db.getTable(table);
      expect(tbl?.primaryIndex, `Table ${table} should have a primary key index`).toBeTruthy();
    }
  });

  it('organization_id is present on all tenant-owned tables', () => {
    const tenantTables = [
      'users', 'clinics', 'doctors', 'staff', 'prospects',
      'audits', 'outreach', 'proposals', 'leads', 'conversations',
      'messages', 'appointments', 'followups', 'reviews',
      'business_outcomes', 'referrals',
      'audit_log', 'ai_tool_executions', 'integration_events',
    ];

    for (const table of tenantTables) {
      expect(hasColumn(table, 'organization_id'), `Table ${table} should have organization_id`).toBe(true);
    }
  });

  it('all core tables have deleted_at for soft delete', () => {
    const coreTables = [
      'organizations', 'users', 'clinics', 'doctors', 'staff', 'prospects',
      'audits', 'outreach', 'proposals', 'leads', 'conversations', 'messages',
      'appointments', 'followups', 'reviews', 'business_outcomes', 'referrals',
      'integration_configs',
    ];

    for (const table of coreTables) {
      expect(hasColumn(table, 'deleted_at'), `Table ${table} should have deleted_at`).toBe(true);
    }
  });

  it('all core entity tables have data_source column', () => {
    const coreTables = [
      'organizations', 'users', 'clinics', 'doctors', 'staff', 'prospects',
      'audits', 'outreach', 'proposals', 'leads', 'conversations', 'messages',
      'appointments', 'followups', 'reviews', 'business_outcomes', 'referrals',
    ];

    for (const table of coreTables) {
      expect(hasColumn(table, 'data_source'), `Table ${table} should have data_source`).toBe(true);
    }
  });

  it('V3.1.2-C3-A: prospects.email column exists as nullable TEXT', () => {
    expect(hasColumn('prospects', 'email'), 'prospects.email should exist').toBe(true);
    expect(getColumnUdtName('prospects', 'email'), 'prospects.email should be TEXT').toBe('text');

    // The seeded DEV_PROSPECT_ID row was inserted by migration 00002 before the
    // email column existed, so its email must be NULL — proving the column is
    // nullable. (pg-mem does not surface is_nullable reliably for ALTER TABLE ADD COLUMN.)
    const row = tdb.public.query(
      "SELECT email FROM prospects WHERE id = '00000000-0000-0000-0000-000000000010'"
    );
    expect(row.rowCount).toBe(1);
    expect(row.rows[0].email).toBeNull();
  });

  it('enum types are registered and used by table columns (verified via udt_name)', () => {
    // pg-mem does not expose pg_enum; verify via information_schema udt_name.
    const enumColumnChecks = [
      { table: 'organizations', column: 'status', udt: 'organization_status' },
      { table: 'users', column: 'role', udt: 'user_role' },
      { table: 'clinics', column: 'status', udt: 'clinic_status' },
      { table: 'doctors', column: 'role', udt: 'doctor_role' },
      { table: 'doctors', column: 'status', udt: 'person_status' },
      { table: 'staff', column: 'role', udt: 'staff_role' },
      { table: 'staff', column: 'status', udt: 'person_status' },
      { table: 'prospects', column: 'priority', udt: 'priority_enum' },
      { table: 'prospects', column: 'content_quality', udt: 'content_quality' },
      { table: 'audits', column: 'overall_opportunity', udt: 'audit_opportunity' },
      { table: 'outreach', column: 'channel', udt: 'channel_type' },
      { table: 'outreach', column: 'stage', udt: 'outreach_stage' },
      { table: 'proposals', column: 'status', udt: 'proposal_status' },
      { table: 'leads', column: 'status', udt: 'lead_status' },
      { table: 'appointments', column: 'status', udt: 'appointment_status' },
      { table: 'appointments', column: 'reminder_status', udt: 'reminder_status' },
      { table: 'followups', column: 'type', udt: 'followup_type' },
      { table: 'followups', column: 'channel', udt: 'channel_type' },
      { table: 'followups', column: 'status', udt: 'followup_status' },
      { table: 'conversations', column: 'status', udt: 'conversation_status' },
      { table: 'conversations', column: 'channel', udt: 'channel_type' },
      { table: 'messages', column: 'sender', udt: 'message_sender' },
      { table: 'reviews', column: 'status', udt: 'review_status' },
      { table: 'reviews', column: 'source', udt: 'review_source' },
      { table: 'business_outcomes', column: 'attribution_confidence', udt: 'confidence_level' },
      { table: 'referrals', column: 'status', udt: 'referral_status' },
      { table: 'organizations', column: 'data_source', udt: 'data_source' },
      { table: 'integration_events', column: 'status', udt: 'integration_event_status' },
    ];

    for (const { table, column, udt } of enumColumnChecks) {
      expect(hasColumn(table, column), `Column ${table}.${column} should exist`).toBe(true);
      expect(getColumnUdtName(table, column), `Column ${table}.${column} should use enum ${udt}`).toBe(udt);
    }
  });

  it('important indexes exist (verified via pg-mem table API)', () => {
    const expectedIndices = [
      { table: 'prospects', name: 'idx_prospects_priority' },
      { table: 'proposals', name: 'idx_proposals_status' },
      { table: 'leads', name: 'idx_leads_status' },
      { table: 'conversations', name: 'idx_conversations_status' },
      { table: 'appointments', name: 'idx_appointments_scheduled_at' },
      { table: 'appointments', name: 'idx_appointments_status' },
      { table: 'reviews', name: 'idx_reviews_rating' },
      { table: 'business_outcomes', name: 'idx_business_outcomes_recorded_at' },
     ];

     for (const { table, name } of expectedIndices) {
       const indices = listIndices(table);
       expect(indices, `Index ${name} should exist on ${table}`).toContain(name);
     }
   });

   it('V3.1.4-A: ai_execution delivery status index exists on integration_events', () => {
     const indices = listIndices('integration_events');
     expect(indices, 'idx_integration_events_ai_execution_org should exist').toContain(
       'idx_integration_events_ai_execution_org'
     );
   });

  it('Q6: no drafts table exists (drafts are frontend-only)', () => {
    expect(hasTable('drafts')).toBe(false);
  });
});
