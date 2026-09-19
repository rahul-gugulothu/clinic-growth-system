process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Provide a placeholder DATABASE_URL so config validation passes during module
// imports (e.g., vi.importActual in health tests). Tests that need a real DB
// use pg-mem with a dedicated in-memory instance instead.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
}

// JWT secrets for testing — these are test-only and must not be used in production.
// In production, JWT_SECRET and JWT_REFRESH_SECRET are loaded from the environment.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-only-secret-key-do-not-use-in-production';
}
if (!process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET = 'test-only-refresh-secret-do-not-use-in-production';
}
if (!process.env.AUTH_RATE_LIMIT_MAX) {
  process.env.AUTH_RATE_LIMIT_MAX = '100';
}

// AES-256-GCM encryption key for testing integration config encryption.
// Must be 64 hex characters (32 bytes). DO NOT use in production.
if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
  process.env.INTEGRATION_ENCRYPTION_KEY =
    '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
}
