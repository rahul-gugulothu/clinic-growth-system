import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import type { AuthContext } from '../src/types/index.js';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { setPool } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/jwt.js';

const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEV_CLINIC_ID = '00000000-0000-0000-0000-000000000020';
const DEV_FOUNDER_ID = '00000000-0000-0000-0000-000000000002';
const DEV_CLINIC_OWNER_ID = '00000000-0000-0000-0000-000000000003';

const CLINIC_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee02';
const PROSPECT_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee01';
const ORG_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee03';
const ORG_B_FOUNDER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee04';

const PROSPECT_C_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee40';

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

const orgBFoundierAuth: AuthContext = {
  userId: ORG_B_FOUNDER_ID,
  organizationId: ORG_B_ID,
  role: 'founder',
  clinicId: null,
};

const authHeader = (token: string): { Authorization: string } => ({
  Authorization: `Bearer ${token}`,
});

const expect401 = (res: { status: number; body: { error: { status: number } } }) => {
  expect(res.status).toBe(401);
  expect(res.body.error.status).toBe(401);
};

const expect403 = (res: { status: number; body: { error: { status: number } } }) => {
  expect(res.status).toBe(403);
  expect(res.body.error.status).toBe(403);
};

const expect404 = (res: { status: number; body: { error: { status: number } } }) => {
  expect(res.status).toBe(404);
  expect(res.body.error.status).toBe(404);
};

const expect400 = (res: { status: number; body: { error: { status: number } } }) => {
  expect(res.status).toBe(400);
  expect(res.body.error.status).toBe(400);
};

describe('V3.0.6 Clinic Workspace API', () => {
  let tdb: TestDatabase;
  let memPool: Pool;
  let app: ReturnType<typeof createApp>;

  const founderToken = signAccessToken(founderAuth);
  const clinicOwnerToken = signAccessToken(clinicOwnerAuth);

  beforeAll(async () => {
    tdb = createTestDatabase();
    const pgLib = tdb.db.adapters.createPg();
    memPool = new pgLib.Pool();
    setPool(memPool);

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

    await tdb.public.none(`
      INSERT INTO doctors (id, organization_id, clinic_id, name, specialty, role, status, data_source, created_at, updated_at)
      VALUES
        ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee10', '${ORG_B_ID}', '${CLINIC_B_ID}', 'Dr. B', 'Dermatology', 'Owner', 'Active', 'demo', NOW(), NOW()),
        ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee12', '${DEV_ORG_ID}', '${DEV_CLINIC_ID}', 'Dr. E', 'Dermatology', 'Owner', 'Active', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO staff (id, organization_id, clinic_id, name, role, email, phone, status, data_source, created_at, updated_at)
      VALUES
        ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee20', '${ORG_B_ID}', '${CLINIC_B_ID}', 'Staff B', 'Reception', 'staffb@test.local', '+91 0000000010', 'Active', 'demo', NOW(), NOW()),
        ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee21', '${DEV_ORG_ID}', '${DEV_CLINIC_ID}', 'Staff C', 'Manager', 'staffc@test.local', '+91 0000000020', 'Active', 'demo', NOW(), NOW())
    `);

    await tdb.public.none(`
      INSERT INTO prospects (id, organization_id, clinic_name, doctor_name, specialty, area, data_source, created_at, updated_at)
      VALUES ('${PROSPECT_C_ID}', '${DEV_ORG_ID}', 'New Clinic C', 'Dr. C', 'General', 'Area C', 'demo', NOW(), NOW())
    `);

    app = createApp();
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  describe('GET /api/v1/clinics/:id', () => {
    it('authenticated clinic user can GET own clinic → 200', async () => {
      const res = await request(app)
        .get(`/api/v1/clinics/${DEV_CLINIC_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect(res.status).toBe(200);
      expect(res.body.clinic.id).toBe(DEV_CLINIC_ID);
      expect(res.body.clinic.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.clinic.name).toBe('Kaya Skin Clinic');
    });

    it('unauthenticated → 401', async () => {
      const res = await request(app).get(`/api/v1/clinics/${DEV_CLINIC_ID}`);
      expect401(res);
    });

    it('Clinic A user cannot access Clinic B → 403', async () => {
      const res = await request(app)
        .get(`/api/v1/clinics/${CLINIC_B_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect403(res);
    });

    it('Org A founder cannot access Org B clinic → 404', async () => {
      const res = await request(app)
        .get(`/api/v1/clinics/${CLINIC_B_ID}`)
        .set(authHeader(founderToken));

      expect404(res);
    });

    it('client clinic_id param cannot override JWT clinic_id', async () => {
      const res = await request(app)
        .get(`/api/v1/clinics/${CLINIC_B_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect403(res);
    });

    it('GET nonexistent clinic → 404', async () => {
      const res = await request(app)
        .get('/api/v1/clinics/00000000-0000-0000-0000-000000000999')
        .set(authHeader(founderToken));

      expect404(res);
    });
  });

  describe('PATCH /api/v1/clinics/:id', () => {
    it('clinic update works for authorized user', async () => {
      const res = await request(app)
        .patch(`/api/v1/clinics/${DEV_CLINIC_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ name: 'Updated Kaya Clinic' });

      expect(res.status).toBe(200);
      expect(res.body.clinic.name).toBe('Updated Kaya Clinic');
      expect(res.body.clinic.id).toBe(DEV_CLINIC_ID);
    });

    it('clinic scoped user cannot PATCH another clinic → 403', async () => {
      const res = await request(app)
        .patch(`/api/v1/clinics/${CLINIC_B_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ name: 'Hacked' });

      expect403(res);
    });

    it('Org A cannot PATCH Org B clinic → 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/clinics/${CLINIC_B_ID}`)
        .set(authHeader(founderToken))
        .send({ name: 'Hacked' });

      expect404(res);
    });

    it('PATCH with clinic_id in body does not override JWT clinic_id → 403', async () => {
      const res = await request(app)
        .patch(`/api/v1/clinics/${CLINIC_B_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ name: 'Hacked', clinic_id: CLINIC_B_ID });

      expect403(res);
    });

    it('PATCH nonexistent clinic → 404', async () => {
      const res = await request(app)
        .patch('/api/v1/clinics/00000000-0000-0000-0000-000000000999')
        .set(authHeader(founderToken))
        .send({ name: 'Ghost' });

      expect404(res);
    });

    it('PATCH empty body → 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/clinics/${DEV_CLINIC_ID}`)
        .set(authHeader(founderToken))
        .send({});

      expect400(res);
    });

    it('founder can PATCH any clinic in own org', async () => {
      const res = await request(app)
        .patch(`/api/v1/clinics/${DEV_CLINIC_ID}`)
        .set(authHeader(founderToken))
        .send({ working_hours: 'Mon-Fri, 09:00-18:00' });

      expect(res.status).toBe(200);
      expect(res.body.clinic.working_hours).toBe('Mon-Fri, 09:00-18:00');
    });
  });

  describe('POST /api/v1/onboarding/prospect/:prospectId', () => {
    it('onboarding creates clinic from eligible prospect', async () => {
      const res = await request(app)
        .post(`/api/v1/onboarding/prospect/${PROSPECT_C_ID}`)
        .set(authHeader(founderToken));

      expect(res.status).toBe(201);
      expect(res.body.clinic).toBeDefined();
      expect(res.body.clinic.prospect_id).toBe(PROSPECT_C_ID);
      expect(res.body.clinic.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.clinic.status).toBe('Onboarding');
      expect(res.body.clinic.name).toBe('New Clinic C');
    });

    it('duplicate onboarding is rejected', async () => {
      await request(app)
        .post('/api/v1/onboarding/prospect/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee41')
        .set(authHeader(founderToken));

      await tdb.public.none(`
        INSERT INTO prospects (id, organization_id, clinic_name, doctor_name, specialty, area, data_source, created_at, updated_at)
        VALUES ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee41', '${DEV_ORG_ID}', 'Dup Clinic', 'Dr. D', 'General', 'Area D', 'demo', NOW(), NOW())
      `);

      await request(app)
        .post('/api/v1/onboarding/prospect/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee41')
        .set(authHeader(founderToken));

      const res = await request(app)
        .post('/api/v1/onboarding/prospect/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee41')
        .set(authHeader(founderToken));

      expect400(res);
    });

    it('prospect from another organization cannot be onboarded → 404', async () => {
      const res = await request(app)
        .post(`/api/v1/onboarding/prospect/${PROSPECT_B_ID}`)
        .set(authHeader(founderToken));

      expect404(res);
    });

    it('nonexistent prospect → 404', async () => {
      const res = await request(app)
        .post('/api/v1/onboarding/prospect/00000000-0000-0000-0000-000000000999')
        .set(authHeader(founderToken));

      expect404(res);
    });

    it('unauthenticated → 401', async () => {
      const res = await request(app)
        .post(`/api/v1/onboarding/prospect/${PROSPECT_C_ID}`);

      expect401(res);
    });

    it('clinic user cannot onboard (requires internal role) → 403', async () => {
      const res = await request(app)
        .post('/api/v1/onboarding/prospect/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee42')
        .set(authHeader(clinicOwnerToken));

      expect403(res);
    });

    it('onboarding accepts optional address override', async () => {
      const prospectForOverride = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee43';
      await tdb.public.none(`
        INSERT INTO prospects (id, organization_id, clinic_name, doctor_name, specialty, area, data_source, created_at, updated_at)
        VALUES ('${prospectForOverride}', '${DEV_ORG_ID}', 'Override Clinic', 'Dr. D', 'General', 'Area D', 'demo', NOW(), NOW())
      `);

      const res = await request(app)
        .post(`/api/v1/onboarding/prospect/${prospectForOverride}`)
        .set(authHeader(founderToken))
        .send({ address: '123 Custom Address, Dharavi' });

      expect(res.status).toBe(201);
      expect(res.body.clinic.address).toBe('123 Custom Address, Dharavi');
      expect(res.body.clinic.city).toBe('Area D');
    });
  });

  describe('POST /api/v1/onboarding/prospect/:prospectId — Org B', () => {
    const PROSPECT_D_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee50';

    it('founder of Org B can onboard their own prospect', async () => {
      const token = signAccessToken(orgBFoundierAuth);
      await tdb.public.none(`
        INSERT INTO prospects (id, organization_id, clinic_name, doctor_name, specialty, area, data_source, created_at, updated_at)
        VALUES ('${PROSPECT_D_ID}', '${ORG_B_ID}', 'Clinic D', 'Dr. D', 'General', 'Area D', 'demo', NOW(), NOW())
      `);

      const res = await request(app)
        .post(`/api/v1/onboarding/prospect/${PROSPECT_D_ID}`)
        .set(authHeader(token));

      expect(res.status).toBe(201);
      expect(res.body.clinic.organization_id).toBe(ORG_B_ID);
      expect(res.body.clinic.prospect_id).toBe(PROSPECT_D_ID);
    });
  });
});
