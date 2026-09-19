import { z } from 'zod';
import { randomBytes } from 'node:crypto';

const envSchema = z.object({
  DATABASE_URL: z.string().url().min(1),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  JWT_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(5),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  INTEGRATION_ENCRYPTION_KEY: z.string().min(1).optional(),
  INTEGRATION_WORKER_INTERVAL_MS: z.coerce.number().default(30000),
  INTEGRATION_WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(50),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.flatten();
  throw new Error(
    `Invalid environment configuration: ${JSON.stringify(errors, null, 2)}`
  );
}

export const config = {
  database: {
    url: parsed.data.DATABASE_URL,
  },
  server: {
    port: parsed.data.PORT,
    isProduction: parsed.data.NODE_ENV === 'production',
    isTest: parsed.data.NODE_ENV === 'test',
    isDevelopment: parsed.data.NODE_ENV === 'development',
  },
  logging: {
    level: parsed.data.LOG_LEVEL,
    pretty: parsed.data.NODE_ENV === 'development' ? { enabled: true } : { enabled: false },
  },
  jwt: {
    secret: parsed.data.JWT_SECRET ?? (parsed.data.NODE_ENV === 'production'
      ? (() => { throw new Error('JWT_SECRET is required in production'); })()
      : randomBytes(32).toString('hex')),
    refreshSecret: parsed.data.JWT_REFRESH_SECRET ?? (parsed.data.NODE_ENV === 'production'
      ? (() => { throw new Error('JWT_REFRESH_SECRET is required in production'); })()
      : randomBytes(32).toString('hex')),
    accessExpiresIn: parsed.data.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: parsed.data.JWT_REFRESH_EXPIRES_IN,
  },
  cors: {
    origin: parsed.data.CORS_ORIGIN,
  },
  rateLimit: {
    max: parsed.data.AUTH_RATE_LIMIT_MAX,
    windowMs: parsed.data.AUTH_RATE_LIMIT_WINDOW_MS,
  },
  integration: {
    encryptionKey: parsed.data.INTEGRATION_ENCRYPTION_KEY ?? null,
    worker: {
      intervalMs: parsed.data.INTEGRATION_WORKER_INTERVAL_MS,
      batchSize: parsed.data.INTEGRATION_WORKER_BATCH_SIZE,
    },
  },
};
