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

const CLINIC_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee02';
const ORG_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee03';

const DEV_DOCTOR_ID = '00000000-0000-0000-0000-000000000030';
const DOCTOR_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee10';

const founderAuth: AuthContext = {
  userId: '00000000-0000-0000-0000-000000000002',
  organizationId: DEV_ORG_ID,
  role: 'founder',
  clinicId: null,
};

const clinicOwnerAuth: AuthContext = {
  userId: '00000000-0000-0000-0000-000000000003',
  organizationId: DEV_ORG_ID,
  role: 'clinic_owner',
  clinicId: DEV_CLINIC_ID,
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

describe('V3.0.6 Doctor API', () => {
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
      VALUES ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee01', '${ORG_B_ID}', 'Clinic B', 'Dr. B', 'Dermatology', 'Area B', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO clinics (id, organization_id, prospect_id, name, specialty, address, city, phone, data_source, created_at, updated_at)
      VALUES ('${CLINIC_B_ID}', '${ORG_B_ID}', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee01', 'Clinic B', 'Dermatology', 'Address B', 'City B', '+91 0000000000', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO users (id, email, role, organization_id, clinic_id, data_source, created_at, updated_at)
      VALUES ('${USER_B_ID}', 'userb@test.local', 'clinic_owner', '${ORG_B_ID}', '${CLINIC_B_ID}', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO doctors (id, organization_id, clinic_id, name, specialty, role, status, data_source, created_at, updated_at)
      VALUES ('${DOCTOR_B_ID}', '${ORG_B_ID}', '${CLINIC_B_ID}', 'Dr. B', 'Dermatology', 'Owner', 'Active', 'demo', NOW(), NOW())
    `);

    app = createApp();
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  describe('GET /api/v1/clinics/:clinicId/doctors', () => {
    it('list own clinic doctors', async () => {
      const res = await request(app)
        .get(`/api/v1/clinics/${DEV_CLINIC_ID}/doctors`)
        .set(authHeader(clinicOwnerToken));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.doctors)).toBe(true);
      expect(res.body.doctors.length).toBe(2);
    });

    it('unauthenticated → 401', async () => {
      const res = await request(app)
        .get(`/api/v1/clinics/${DEV_CLINIC_ID}/doctors`);
      expect401(res);
    });

    it('Clinic A user cannot list Clinic B doctors → 403', async () => {
      const res = await request(app)
        .get(`/api/v1/clinics/${CLINIC_B_ID}/doctors`)
        .set(authHeader(clinicOwnerToken));
      expect403(res);
    });

    it('Org A founder listing Org B clinic doctors → 200 but empty (cross-org DB isolation)', async () => {
      const res = await request(app)
        .get(`/api/v1/clinics/${CLINIC_B_ID}/doctors`)
        .set(authHeader(founderToken));

      expect(res.status).toBe(200);
      expect(res.body.doctors.length).toBe(0);
    });
  });

  describe('GET /api/v1/doctors/:id', () => {
    it('get own clinic doctor → 200', async () => {
      const res = await request(app)
        .get(`/api/v1/doctors/${DEV_DOCTOR_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect(res.status).toBe(200);
      expect(res.body.doctor.id).toBe(DEV_DOCTOR_ID);
      expect(res.body.doctor.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.doctor.clinic_id).toBe(DEV_CLINIC_ID);
    });

    it('clinic user cannot get doctor from another clinic → 404', async () => {
      const res = await request(app)
        .get(`/api/v1/doctors/${DOCTOR_B_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect404(res);
    });

    it('Org A cannot get Org B doctor → 404', async () => {
      const res = await request(app)
        .get(`/api/v1/doctors/${DOCTOR_B_ID}`)
        .set(authHeader(founderToken));

      expect404(res);
    });

    it('unauthenticated → 401', async () => {
      const res = await request(app)
        .get(`/api/v1/doctors/${DEV_DOCTOR_ID}`);
      expect401(res);
    });

    it('invalid UUID → 400', async () => {
      const res = await request(app)
        .get('/api/v1/doctors/not-a-uuid')
        .set(authHeader(clinicOwnerToken));
      expect400(res);
    });
  });

  describe('POST /api/v1/clinics/:clinicId/doctors', () => {
    it('create doctor in own clinic', async () => {
      const res = await request(app)
        .post(`/api/v1/clinics/${DEV_CLINIC_ID}/doctors`)
        .set(authHeader(clinicOwnerToken))
        .send({
          name: 'Dr. New',
          specialty: 'Dermatology',
          role: 'Consultant',
        });

      expect(res.status).toBe(201);
      expect(res.body.doctor).toBeDefined();
      expect(res.body.doctor.clinic_id).toBe(DEV_CLINIC_ID);
      expect(res.body.doctor.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.doctor.name).toBe('Dr. New');
      expect(res.body.doctor.role).toBe('Consultant');
    });

    it('unauthenticated → 401', async () => {
      const res = await request(app)
        .post(`/api/v1/clinics/${DEV_CLINIC_ID}/doctors`)
        .send({ name: 'Dr. X', specialty: 'Dermatology', role: 'Consultant' });
      expect401(res);
    });

    it('clinic user cannot create in another clinic → 403', async () => {
      const res = await request(app)
        .post(`/api/v1/clinics/${CLINIC_B_ID}/doctors`)
        .set(authHeader(clinicOwnerToken))
        .send({ name: 'Dr. X', specialty: 'Dermatology', role: 'Consultant' });
      expect403(res);
    });

    it('client-supplied clinic_id cannot override JWT clinic scope', async () => {
      const res = await request(app)
        .post(`/api/v1/clinics/${DEV_CLINIC_ID}/doctors`)
        .set(authHeader(clinicOwnerToken))
        .send({
          name: 'Dr. Override',
          specialty: 'Dermatology',
          role: 'Consultant',
          clinic_id: CLINIC_B_ID,
        });

      expect(res.status).toBe(201);
      expect(res.body.doctor.clinic_id).toBe(DEV_CLINIC_ID);
      expect(res.body.doctor.clinic_id).not.toBe(CLINIC_B_ID);
    });

    it('invalid role → 400', async () => {
      const res = await request(app)
        .post(`/api/v1/clinics/${DEV_CLINIC_ID}/doctors`)
        .set(authHeader(clinicOwnerToken))
        .send({ name: 'Dr. X', specialty: 'Dermatology', role: 'Invalid' });
      expect400(res);
    });

    it('missing name → 400', async () => {
      const res = await request(app)
        .post(`/api/v1/clinics/${DEV_CLINIC_ID}/doctors`)
        .set(authHeader(clinicOwnerToken))
        .send({ specialty: 'Dermatology', role: 'Consultant' });
      expect400(res);
    });
  });

  describe('PATCH /api/v1/doctors/:id', () => {
    it('update own clinic doctor → 200', async () => {
      const res = await request(app)
        .patch(`/api/v1/doctors/${DEV_DOCTOR_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ name: 'Updated Dr. Anaya' });

      expect(res.status).toBe(200);
      expect(res.body.doctor.name).toBe('Updated Dr. Anaya');
    });

    it('clinic user cannot update doctor from another clinic → 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/doctors/${DOCTOR_B_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ name: 'Hacked' });
      expect404(res);
    });

    it('Org A cannot update Org B doctor → 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/doctors/${DOCTOR_B_ID}`)
        .set(authHeader(founderToken))
        .send({ name: 'Hacked' });
      expect404(res);
    });

    it('client-supplied clinic_id cannot override JWT clinic scope', async () => {
      const res = await request(app)
        .patch(`/api/v1/doctors/${DEV_DOCTOR_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ name: 'Still My Clinic', clinic_id: CLINIC_B_ID });

      expect(res.status).toBe(200);
      expect(res.body.doctor.clinic_id).toBe(DEV_CLINIC_ID);
    });

    it('PATCH nonexistent doctor → 404', async () => {
      const res = await request(app)
        .patch('/api/v1/doctors/00000000-0000-0000-0000-000000000999')
        .set(authHeader(clinicOwnerToken))
        .send({ name: 'Ghost' });
      expect404(res);
    });

    it('PATCH empty body → 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/doctors/${DEV_DOCTOR_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({});
      expect400(res);
    });
  });
});
