import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import type { AuthContext, UserRole } from '../src/types/index.js';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { setPool } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { signAccessToken, signRefreshToken } from '../src/utils/jwt.js';
import { config } from '../src/config/index.js';

// ---- Seed data IDs (from migrations/00002_seed_dev_data.sql) ----
const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEV_CLINIC_ID = '00000000-0000-0000-0000-000000000020';
const DEV_FOUNDER_ID = '00000000-0000-0000-0000-000000000002';
const DEV_CLINIC_OWNER_ID = '00000000-0000-0000-0000-000000000003';
const DEV_CLINIC_STAFF_ID = '00000000-0000-0000-0000-000000000004';

// ---- Test data for Organization B ----
const ORG_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PROSPECT_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee01';
const CLINIC_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee02';
const USER_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee03';

// ---- Auth contexts for seed users ----
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

const clinicStaffAuth: AuthContext = {
  userId: DEV_CLINIC_STAFF_ID,
  organizationId: DEV_ORG_ID,
  role: 'clinic_reception',
  clinicId: DEV_CLINIC_ID,
};

const userBAuth: AuthContext = {
  userId: USER_B_ID,
  organizationId: ORG_B_ID,
  role: 'clinic_owner',
  clinicId: CLINIC_B_ID,
};

const makeToken = (auth: AuthContext): string => signAccessToken(auth);

const makeExpiredToken = (auth: AuthContext): string => {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: auth.userId,
      org_id: auth.organizationId,
      role: auth.role,
      clinic_id: auth.clinicId,
      token_type: 'access',
      iat: now - 3600,
      exp: now - 1800,
    },
    config.jwt.secret,
    { algorithm: 'HS256' }
  );
};

const authHeader = (token: string): { Authorization: string } => ({
  Authorization: `Bearer ${token}`,
});

const getRefreshTokenFromResponse = (res: request.Response): string | undefined => {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return undefined;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const cookieStr = cookies.join('; ');
  const match = cookieStr.match(/refresh_token=([^;]+)/);
  return match?.[1];
};

const makeExpiredRefreshToken = (auth: AuthContext): string => {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: auth.userId,
      org_id: auth.organizationId,
      role: auth.role,
      clinic_id: auth.clinicId,
      token_type: 'refresh' as const,
      iat: now - 3600,
      exp: now - 1800,
    },
    config.jwt.refreshSecret,
    { algorithm: 'HS256' }
  );
};

const makeWrongTypeRefreshToken = (auth: AuthContext): string => {
  return signAccessToken(auth);
};

const expect401 = (res: { status: number; body: { error: { status: number } } }) => {
  expect(res.status).toBe(401);
  expect(res.body.error.status).toBe(401);
};

const expect403 = (res: { status: number; body: { error: { status: number } } }) => {
  expect(res.status).toBe(403);
  expect(res.body.error.status).toBe(403);
};

describe('V3.0.4 Authorization Tests', () => {
  let tdb: TestDatabase;
  let memPool: Pool;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    tdb = createTestDatabase();
    const pgLib = tdb.db.adapters.createPg();
    memPool = new pgLib.Pool();
    setPool(memPool);

    // Insert Organization B and related entities for cross-org tests
    await tdb.public.none(`
      INSERT INTO organizations (id, name, status, timezone, data_source, created_at, updated_at)
      VALUES ('${ORG_B_ID}', 'Test Org B', 'trial', 'UTC', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO prospects (id, organization_id, clinic_name, doctor_name, specialty, area, data_source, created_at, updated_at)
      VALUES ('${PROSPECT_B_ID}', '${ORG_B_ID}', 'Clinic B', 'Dr. B', 'Dermatology', 'Area B', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO clinics (id, organization_id, prospect_id, name, specialty, address, city, phone, data_source, created_at, updated_at)
      VALUES ('${CLINIC_B_ID}', '${ORG_B_ID}', '${PROSPECT_B_ID}', 'Clinic B', 'Dermatology', 'Address B', 'City B', '+91 0000000000', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO users (id, email, role, organization_id, clinic_id, data_source, created_at, updated_at)
      VALUES ('${USER_B_ID}', 'userb@test.local', 'clinic_owner', '${ORG_B_ID}', '${CLINIC_B_ID}', 'demo', NOW(), NOW())
    `);

    // Use the full app (includes health, auth routes, error handler)
    app = createApp();
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  describe('RequireAuth', () => {
    it('missing token → 401', async () => {
      const res = await request(app).get('/api/v1/auth/context-test');
      expect401(res);
    });

    it('invalid token → 401', async () => {
      const res = await request(app)
        .get('/api/v1/auth/context-test')
        .set(authHeader('invalid.token.here'));
      expect401(res);
    });

    it('expired token → 401', async () => {
      const token = makeExpiredToken(founderAuth);
      const res = await request(app)
        .get('/api/v1/auth/context-test')
        .set(authHeader(token));
      expect401(res);
    });

    it('valid token → 200 with context', async () => {
      const token = makeToken(founderAuth);
      const res = await request(app)
        .get('/api/v1/auth/context-test')
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.clinic_id).toBeNull();
      expect(res.body.role).toBe('founder');
    });
  });

  describe('/auth/me', () => {
    it('returns correct identity for clinic owner', async () => {
      const token = makeToken(clinicOwnerAuth);
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(DEV_CLINIC_OWNER_ID);
      expect(res.body.user.email).toBe('owner@drkaya.demo.local');
      expect(res.body.user.role).toBe('clinic_owner');
      expect(res.body.user.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.user.clinic_id).toBe(DEV_CLINIC_ID);
    });

    it('returns correct identity for internal/founder', async () => {
      const token = makeToken(founderAuth);
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(DEV_FOUNDER_ID);
      expect(res.body.user.role).toBe('founder');
      expect(res.body.user.clinic_id).toBeNull();
    });

    it('never returns secrets or password hashes', async () => {
      const token = makeToken(founderAuth);
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.user).not.toHaveProperty('password');
      expect(res.body.user).not.toHaveProperty('password_hash');
      expect(res.body.user).not.toHaveProperty('secret');
      expect(res.body.user).not.toHaveProperty('token');
      expect(res.body.user).not.toHaveProperty('data_source');
      expect(res.body.user).not.toHaveProperty('created_at');
      expect(res.body.user).not.toHaveProperty('updated_at');
      expect(res.body.user).not.toHaveProperty('deleted_at');
      expect(JSON.stringify(res.body)).not.toMatch(/secret/i);
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
      expect(JSON.stringify(res.body)).not.toMatch(config.jwt.secret);
    });
  });

  describe('Role Authorization (requireRole)', () => {
    it('authorized role (founder) → 200', async () => {
      const token = makeToken(founderAuth);
      const res = await request(app)
        .get('/api/v1/auth/require-role-test')
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.authorized).toBe(true);
      expect(res.body.role).toBe('founder');
    });

    it('wrong role (clinic_owner ≠ founder) → 403', async () => {
      const token = makeToken(clinicOwnerAuth);
      const res = await request(app)
        .get('/api/v1/auth/require-role-test')
        .set(authHeader(token));
      expect403(res);
    });

    it('another wrong role (clinic_reception ≠ founder) → 403', async () => {
      const token = makeToken(clinicStaffAuth);
      const res = await request(app)
        .get('/api/v1/auth/require-role-test')
        .set(authHeader(token));
      expect403(res);
    });
  });

  describe('Organization Isolation', () => {
    it('org A user can access org A resources', async () => {
      const token = makeToken(clinicOwnerAuth);
      const res = await request(app)
        .get(`/api/v1/auth/org-scope-test?resource_org_id=${DEV_ORG_ID}`)
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.authorized).toBe(true);
      expect(res.body.organization_id).toBe(DEV_ORG_ID);
    });

    it('org A user cannot access org B resources', async () => {
      const token = makeToken(clinicOwnerAuth);
      const res = await request(app)
        .get(`/api/v1/auth/org-scope-test?resource_org_id=${ORG_B_ID}`)
        .set(authHeader(token));
      expect403(res);
    });

    it('user from org B can access org B resources', async () => {
      const token = makeToken(userBAuth);
      const res = await request(app)
        .get(`/api/v1/auth/org-scope-test?resource_org_id=${ORG_B_ID}`)
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.authorized).toBe(true);
      expect(res.body.organization_id).toBe(ORG_B_ID);
    });

    it('user from org B cannot access org A resources', async () => {
      const token = makeToken(userBAuth);
      const res = await request(app)
        .get(`/api/v1/auth/org-scope-test?resource_org_id=${DEV_ORG_ID}`)
        .set(authHeader(token));
      expect403(res);
    });
  });

  describe('Clinic Isolation', () => {
    it('clinic A user can access clinic A context', async () => {
      const token = makeToken(clinicOwnerAuth);
      const res = await request(app)
        .get('/api/v1/auth/clinic-context-test')
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.clinic_id).toBe(DEV_CLINIC_ID);
      expect(res.body.organization_id).toBe(DEV_ORG_ID);
    });

    it('internal user with clinic_id NULL cannot enter clinic workspace (403)', async () => {
      const token = makeToken(founderAuth);
      const res = await request(app)
        .get('/api/v1/auth/clinic-context-test')
        .set(authHeader(token));
      expect403(res);
    });

    it('clinic A user cannot access clinic B', async () => {
      const token = makeToken(clinicOwnerAuth);
      const res = await request(app)
        .get(`/api/v1/auth/clinic-scope-test?resource_clinic_id=${CLINIC_B_ID}`)
        .set(authHeader(token));
      expect403(res);
    });

    it('client-supplied clinic_id cannot override JWT clinic_id', async () => {
      const token = makeToken(clinicOwnerAuth);
      // Client sends resource_clinic_id matching their own clinic → authorized
      const resAuthorized = await request(app)
        .get(`/api/v1/auth/clinic-scope-test?resource_clinic_id=${DEV_CLINIC_ID}`)
        .set(authHeader(token));
      expect(resAuthorized.status).toBe(200);
      expect(resAuthorized.body.authorized).toBe(true);
      expect(resAuthorized.body.clinic_id).toBe(DEV_CLINIC_ID);

      // Client sends resource_clinic_id of a DIFFERENT clinic → denied
      // Even though client tried to claim Clinic B, JWT says Clinic A
      const resDenied = await request(app)
        .get(`/api/v1/auth/clinic-scope-test?resource_clinic_id=${CLINIC_B_ID}`)
        .set(authHeader(token));
      expect403(resDenied);
    });
  });

  describe('Existing tests still pass', () => {
    it('health endpoint still works', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
    });
  });

  // ==========================================================================
  // V3.0.4-C: Refresh Token Endpoint Tests
  // ==========================================================================
  describe('POST /api/v1/auth/refresh', () => {
    const FOUNDER_EMAIL = 'founder@cliniciogrowth.local';

    const loginAndGetRefreshToken = async (): Promise<string> => {
      const loginRes = await request(app)
        .post('/api/v1/auth/dev/login')
        .send({ email: FOUNDER_EMAIL });

      expect(loginRes.status).toBe(200);
      const refreshToken = getRefreshTokenFromResponse(loginRes);
      expect(refreshToken).toBeDefined();
      return refreshToken!;
    };

    it('valid refresh token → 200 + new access token', async () => {
      const refreshToken = await loginAndGetRefreshToken();

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refresh_token=${refreshToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.access_token).toBeDefined();
      expect(res.body.token_type).toBe('Bearer');
      expect(res.body.expires_in).toBe(900);

      // Verify the new access token decodes to the correct user
      const decoded = jwt.verify(res.body.access_token, config.jwt.secret) as jwt.JwtPayload;
      expect(decoded.sub).toBe(DEV_FOUNDER_ID);
      expect(decoded.org_id).toBe(DEV_ORG_ID);
      expect(decoded.role).toBe('founder');
      expect(decoded.clinic_id).toBeNull();
      expect(decoded.token_type).toBe('access');
    });

    it('missing refresh cookie → 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', []);

      expect(res.status).toBe(401);
      expect(res.body.error.status).toBe(401);
      expect(res.body.error.message).toBe('Refresh token required');
    });

    it('malformed refresh token → 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', ['refresh_token=not-a-valid-jwt']);

      expect(res.status).toBe(401);
      expect(res.body.error.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid or expired refresh token');
    });

    it('expired refresh token → 401', async () => {
      const expiredToken = makeExpiredRefreshToken(founderAuth);

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refresh_token=${expiredToken}`]);

      expect(res.status).toBe(401);
      expect(res.body.error.status).toBe(401);
    });

    it('access token used as refresh token → 401', async () => {
      const accessToken = makeWrongTypeRefreshToken(founderAuth);

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refresh_token=${accessToken}`]);

      expect(res.status).toBe(401);
      expect(res.body.error.status).toBe(401);
    });

    it('nonexistent user → 401', async () => {
      const fakeUserAuth: AuthContext = {
        userId: '00000000-0000-0000-0000-000000000999',
        organizationId: DEV_ORG_ID,
        role: 'founder',
        clinicId: null,
      };
      const refreshToken = signRefreshToken(fakeUserAuth);

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refresh_token=${refreshToken}`]);

      expect(res.status).toBe(401);
      expect(res.body.error.status).toBe(401);
      expect(res.body.error.message).toBe('User not found');
    });

    it('authority is regenerated from DB, not trusted from JWT claims', async () => {
      const elevatedRefreshToken = signRefreshToken({
        userId: DEV_FOUNDER_ID,
        organizationId: DEV_ORG_ID,
        role: 'clinic_owner' as UserRole,
        clinicId: DEV_CLINIC_ID,
      });

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refresh_token=${elevatedRefreshToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.access_token).toBeDefined();

      const decoded = jwt.verify(res.body.access_token, config.jwt.secret) as jwt.JwtPayload;
      expect(decoded.sub).toBe(DEV_FOUNDER_ID);
      expect(decoded.org_id).toBe(DEV_ORG_ID);
      expect(decoded.role).toBe('founder');
      expect(decoded.clinic_id).toBeNull();
    });
  });

  // ==========================================================================
  // V3.0.4-C: Rate Limiting Tests (actual auth route wiring)
  // ==========================================================================
  describe('Rate Limiting (actual auth routes)', () => {
    it('POST /api/v1/auth/dev/login returns 429 after limit exceeded', async () => {
      const originalMax = process.env.AUTH_RATE_LIMIT_MAX;
      process.env.AUTH_RATE_LIMIT_MAX = '3';

      vi.resetModules();

      const { createApp: createAppFresh } = await import('../src/app.js');
      const { setPool: setPoolFresh } = await import('../src/db/index.js');
      setPoolFresh(memPool);

      const rateLimitedApp = createAppFresh();
      const validEmail = 'founder@cliniciogrowth.local';

      try {
        for (let i = 0; i < 3; i++) {
          const res = await request(rateLimitedApp)
            .post('/api/v1/auth/dev/login')
            .send({ email: validEmail });
          expect(res.status).not.toBe(429);
        }

        const res4th = await request(rateLimitedApp)
          .post('/api/v1/auth/dev/login')
          .send({ email: validEmail });

        expect(res4th.status).toBe(429);
        expect(res4th.body.error.message).toBe('Too many requests, please try again later.');
        expect(res4th.body.error.status).toBe(429);
        expect(res4th.headers['ratelimit-limit']).toBe('3');
      } finally {
        process.env.AUTH_RATE_LIMIT_MAX = originalMax ?? '5';
        vi.resetModules();
      }
    });
  });

  // ==========================================================================
  // V3.0.4-C: CORS Tests
  // ==========================================================================
  describe('CORS', () => {
    it('allows configured origin with Access-Control-Allow-Origin header', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', config.cors.origin);

      expect(res.headers['access-control-allow-origin']).toBe(config.cors.origin);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('disallowed origin gets no Access-Control-Allow-Origin header', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'http://evil.com');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
