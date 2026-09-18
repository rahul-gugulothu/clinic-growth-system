import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { Pool } from 'pg';

describe('Database Connection', () => {
  let tdb: TestDatabase;
  let pool: Pool;

  beforeAll(() => {
    tdb = createTestDatabase();
    const pgLib = tdb.db.adapters.createPg();
    pool = new pgLib.Pool();
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it('pool connects successfully', async () => {
    const result = await pool.query('SELECT 1 as test');
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].test).toBe(1);
  });

  it('database shows current timestamp', async () => {
    const result = await pool.query('SELECT NOW() as now');
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].now).toBeDefined();
  });

  it('uuid extension function is available (pgcrypto gen_random_uuid)', async () => {
    const result = await pool.query('SELECT gen_random_uuid()::text as uuid_val');
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].uuid_val).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('migration-created tables are accessible via pool', async () => {
    const result = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name IN ('organizations', 'clinics', 'prospects') ORDER BY table_name"
    );
    const tables = result.rows.map((r) => r.table_name);
    expect(tables).toEqual(['clinics', 'organizations', 'prospects']);
  });

  it('seed data is accessible via pool', async () => {
    const orgResult = await pool.query(
      'SELECT * FROM organizations WHERE id = $1',
      ['00000000-0000-0000-0000-000000000001']
    );
    expect(orgResult.rowCount).toBe(1);
    expect(orgResult.rows[0].name).toBe('Demo Dermatology Group');

    const prospectResult = await pool.query(
      'SELECT * FROM prospects WHERE id = $1',
      ['00000000-0000-0000-0000-000000000010']
    );
    expect(prospectResult.rowCount).toBe(1);
    expect(prospectResult.rows[0].clinic_name).toBe('Kaya Skin Clinic');
  });
});
