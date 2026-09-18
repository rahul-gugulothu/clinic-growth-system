import { Pool, PoolClient } from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let pool: Pool | null = null;

export const createPool = (): Pool => {
  if (pool) return pool;

  pool = new Pool({
    connectionString: config.database.url,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    logger.error({ err, event: 'pg_pool_error' }, 'Unexpected error on idle database client');
  });

  pool.on('connect', () => {
    logger.debug({ event: 'pg_pool_connect' }, 'Database client connected');
  });

  pool.on('remove', () => {
    logger.debug({ event: 'pg_pool_remove' }, 'Database client removed from pool');
  });

  return pool;
};

export const setPool = (p: Pool | null): void => {
  pool = p;
};

export const getPool = (): Pool => {
  if (!pool) {
    return createPool();
  }
  return pool;
};

export const getClient = async (): Promise<PoolClient> => {
  const p = getPool();
  return await p.connect();
};

export const checkDatabaseHealth = async (): Promise<{ connected: boolean; latencyMs: number }> => {
  const start = Date.now();
  try {
    const client = await getClient();
    try {
      await client.query('SELECT 1');
      return { connected: true, latencyMs: Date.now() - start };
    } finally {
      client.release();
    }
  } catch (_err) {
    return { connected: false, latencyMs: Date.now() - start };
  }
};

export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info({ event: 'db_pool_closed' }, 'Database connection pool closed');
  }
};
