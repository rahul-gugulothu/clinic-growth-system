import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { newDb, type IMemoryDb } from 'pg-mem';
import { DataType } from 'pg-mem';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

export const MIGRATION_FILES = [
  '00001_initial_schema.sql',
  '00002_seed_dev_data.sql',
  '00003_v310_ai_execution_foundation.sql',
  '00004_v312_integration_idempotency.sql',
  '00005_v312_prospect_email.sql',
  '00006_v314_ai_execution_delivery_index.sql',
  '00007_v313_founder_conversation_memory.sql',
  '00008_v314_knowledge_base.sql',
  '00009_v314_embeddings.sql',
] as const;

export interface TestDatabase {
  db: IMemoryDb;
  public: IMemoryDb['public'];
}

/**
 * Strip PL/pgSQL trigger definitions from migration SQL.
 * pg-mem does not support PL/pgSQL functions or triggers.
 * Real PostgreSQL supports both; the migration file is valid for real PostgreSQL.
 */
const stripTriggers = (sql: string): string => {
  const marker = '-- ============================================================================\n-- TRIGGERS';
  const idx = sql.indexOf(marker);
  if (idx >= 0) {
    return sql.substring(0, idx).trim();
  }
  return sql;
};

export const createTestDatabase = (): TestDatabase => {
  const memDb = newDb();

  // pg-mem does not implement pgcrypto's gen_random_uuid() by default.
  // Register a shim that generates UUID v4 strings.
  memDb.registerExtension('pgcrypto', (schema) => {
    schema.registerFunction({
      name: 'gen_random_uuid',
      implementation: () => {
        return randomUUID();
      },
      returns: DataType.uuid,
      impure: true,
    });
   });

  // Load and execute migration SQL
  for (const file of MIGRATION_FILES) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8').replace(/\r\n/g, '\n');
    const cleanSql = file.endsWith('_seed_dev_data.sql') ? sql : stripTriggers(sql);
    memDb.public.none(cleanSql);
  }

  return { db: memDb, public: memDb.public };
};

export { MIGRATIONS_DIR };

