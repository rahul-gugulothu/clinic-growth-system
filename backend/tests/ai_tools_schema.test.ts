import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers.js';

const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEV_CLINIC_ID = '00000000-0000-0000-0000-000000000020';
const DEV_FOUNDER_USER_ID = '00000000-0000-0000-0000-000000000002';
const INVALID_UUID = '00000000-0000-0000-0000-000000000999';

const VALID_STATUSES = [
  'requested',
  'running',
  'completed',
  'failed',
  'requires_approval',
  'approved',
  'rejected',
];

describe('V3.1.0-A AI Execution Foundation — Schema', () => {
  let tdb: TestDatabase;

  beforeAll(() => {
    tdb = createTestDatabase();
  });

  const query = (sql: string) => tdb.public.query(sql);
  const none = (sql: string) => tdb.public.none(sql);
  const hasColumn = (table: string, column: string): boolean => {
    const result = query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = '" +
        table + "' AND column_name = '" + column + "'"
    );
    return result.rowCount === 1;
  };
  const getColumnUdtName = (table: string, column: string): string => {
    const result = query(
      "SELECT udt_name FROM information_schema.columns WHERE table_name = '" +
        table + "' AND column_name = '" + column + "'"
    );
    return result.rows[0]?.udt_name ?? 'UNKNOWN';
  };
  const listIndices = (table: string): string[] => {
    const tbl = tdb.db.getTable(table);
    if (!tbl) return [];
    return tbl.listIndices().map((i) => i.name);
  };

  describe('Migration applies successfully', () => {
    it('createTestDatabase loads all three migrations without error', () => {
      expect(tdb.db).toBeDefined();
      expect(tdb.public).toBeDefined();
    });
  });

  describe('ai_tool_executions new columns', () => {
    const expectedColumns = [
      'status',
      'started_at',
      'completed_at',
      'result_output',
      'requires_human_review',
      'approved_by',
      'approved_at',
      'clinic_id',
    ];

    for (const col of expectedColumns) {
      it(`ai_tool_executions has column: ${col}`, () => {
        expect(hasColumn('ai_tool_executions', col), `Column ${col} should exist`).toBe(true);
      });
    }

    it('ai_tool_executions.status uses ai_execution_status enum', () => {
      expect(getColumnUdtName('ai_tool_executions', 'status')).toBe('ai_execution_status');
    });

    it('ai_tool_executions.status has NOT NULL constraint', () => {
      const result = query(
        "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'ai_tool_executions' AND column_name = 'status'"
      );
      expect(result.rows[0].is_nullable).toBe('NO');
    });

    it('ai_tool_executions.status defaults to requested', () => {
      const result = query(
        "INSERT INTO ai_tool_executions (organization_id, tool_id, success) VALUES ('" +
          DEV_ORG_ID + "', 'test-tool', true) RETURNING status"
      );
      expect(result.rows[0].status).toBe('requested');
    });

    it('ai_tool_executions.requires_human_review defaults to false', () => {
      const result = query(
        "INSERT INTO ai_tool_executions (organization_id, tool_id, success) VALUES ('" +
          DEV_ORG_ID + "', 'test-tool', true) RETURNING requires_human_review"
      );
      expect(result.rows[0].requires_human_review).toBe(false);
    });
  });

  describe('ai_tool_executions indexes', () => {
    it('has idx_ai_tool_executions_status index', () => {
      expect(listIndices('ai_tool_executions')).toContain('idx_ai_tool_executions_status');
    });

    it('has idx_ai_tool_executions_started_at index', () => {
      expect(listIndices('ai_tool_executions')).toContain('idx_ai_tool_executions_started_at');
    });

    it('has idx_ai_tool_executions_clinic_id index', () => {
      expect(listIndices('ai_tool_executions')).toContain('idx_ai_tool_executions_clinic_id');
    });
  });

  describe('audit_log new column', () => {
    it('audit_log has clinic_id column', () => {
      expect(hasColumn('audit_log', 'clinic_id')).toBe(true);
    });

    it('has idx_audit_log_clinic_id index', () => {
      expect(listIndices('audit_log')).toContain('idx_audit_log_clinic_id');
    });

    it('audit_log.clinic_id accepts NULL values', () => {
      none(
        "INSERT INTO audit_log (organization_id, action, entity, clinic_id) VALUES ('" +
          DEV_ORG_ID + "', 'null_clinic_test', 'test_entity', NULL)"
      );
    });
  });

  describe('integration_events new column', () => {
    it('integration_events has ai_execution_id column', () => {
      expect(hasColumn('integration_events', 'ai_execution_id')).toBe(true);
    });
  });

  describe('Lifecycle status values', () => {
    for (const status of VALID_STATUSES) {
      it(`status '${status}' is accepted`, () => {
        none(
          "INSERT INTO ai_tool_executions (organization_id, tool_id, success, status) VALUES ('" +
            DEV_ORG_ID + "', 'test-tool', true, '" + status + "')"
        );
      });
    }

    it('invalid status value is rejected', () => {
      expect(() =>
        none(
          "INSERT INTO ai_tool_executions (organization_id, tool_id, success, status) VALUES ('" +
            DEV_ORG_ID + "', 'test-tool', true, 'nonexistent_status')"
        )
      ).toThrow(/constraint|invalid|enum|violates/i);
    });
  });

  describe('Foreign key integrity (new columns)', () => {
    it('ai_tool_executions.clinic_id with non-existent clinic is rejected', () => {
      expect(() =>
        none(
          "INSERT INTO ai_tool_executions (organization_id, tool_id, success, clinic_id) VALUES ('" +
            DEV_ORG_ID + "', 'test-tool', true, '" + INVALID_UUID + "')"
        )
      ).toThrow(/violates foreign key|constraint/i);
    });

    it('ai_tool_executions.clinic_id with valid clinic is accepted', () => {
      none(
        "INSERT INTO ai_tool_executions (organization_id, tool_id, success, clinic_id) VALUES ('" +
          DEV_ORG_ID + "', 'test-tool', true, '" + DEV_CLINIC_ID + "')"
      );
    });

    it('ai_tool_executions.approved_by with non-existent user is rejected', () => {
      expect(() =>
        none(
          "INSERT INTO ai_tool_executions (organization_id, tool_id, success, approved_by) VALUES ('" +
            DEV_ORG_ID + "', 'test-tool', true, '" + INVALID_UUID + "')"
        )
      ).toThrow(/violates foreign key|constraint/i);
    });

    it('ai_tool_executions.approved_by with valid user is accepted', () => {
      none(
        "INSERT INTO ai_tool_executions (organization_id, tool_id, success, approved_by) VALUES ('" +
          DEV_ORG_ID + "', 'test-tool', true, '" + DEV_FOUNDER_USER_ID + "')"
      );
    });

    it('integration_events.ai_execution_id with non-existent execution is rejected', () => {
      expect(() =>
        none(
          "INSERT INTO integration_events (organization_id, provider, event_type, payload, ai_execution_id) VALUES ('" +
            DEV_ORG_ID + "', 'test', 'test_event', '{}', '" + INVALID_UUID + "')"
        )
      ).toThrow(/violates foreign key|constraint/i);
    });

    it('integration_events.ai_execution_id with valid execution is accepted', () => {
      const execResult = query(
        "INSERT INTO ai_tool_executions (organization_id, tool_id, success, status) VALUES ('" +
          DEV_ORG_ID + "', 'test-tool', true, 'completed') RETURNING id"
      );
      const execId = execResult.rows[0].id;

      none(
        "INSERT INTO integration_events (organization_id, provider, event_type, payload, ai_execution_id) VALUES ('" +
          DEV_ORG_ID + "', 'test', 'test_event', '{}', '" + execId + "')"
      );
    });

    it('audit_log.clinic_id with non-existent clinic is rejected', () => {
      expect(() =>
        none(
          "INSERT INTO audit_log (organization_id, action, entity, clinic_id) VALUES ('" +
            DEV_ORG_ID + "', 'test_action', 'test_entity', '" + INVALID_UUID + "')"
        )
      ).toThrow(/violates foreign key|constraint/i);
    });

    it('audit_log.clinic_id NULL is accepted', () => {
      none(
        "INSERT INTO audit_log (organization_id, action, entity, clinic_id) VALUES ('" +
          DEV_ORG_ID + "', 'test_action', 'test_entity', NULL)"
      );
    });
  });

  describe('Existing columns preserved', () => {
    it('ai_tool_executions retains success column', () => {
      expect(hasColumn('ai_tool_executions', 'success')).toBe(true);
    });

    it('ai_tool_executions retains error column', () => {
      expect(hasColumn('ai_tool_executions', 'error')).toBe(true);
    });

    it('ai_tool_executions retains result_id column', () => {
      expect(hasColumn('ai_tool_executions', 'result_id')).toBe(true);
    });

    it('ai_tool_executions retains tool_id column', () => {
      expect(hasColumn('ai_tool_executions', 'tool_id')).toBe(true);
    });

    it('audit_log retains organization_id column', () => {
      expect(hasColumn('audit_log', 'organization_id')).toBe(true);
    });

    it('integration_events retains status column with integration_event_status enum', () => {
      expect(getColumnUdtName('integration_events', 'status')).toBe('integration_event_status');
    });
  });
});
