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
const DEV_CLINIC_STAFF_ID = '00000000-0000-0000-0000-000000000004';

const CLINIC_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee02';
const ORG_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee03';

const DEV_STAFF_ID = '00000000-0000-0000-0000-000000000040';
const STAFF_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee20';

const founderAuth: AuthContext = {
  userId: '00000000-0000-0000-0000-000000000002',
  organizationId: DEV_ORG_ID,
  role: 'founder',
  clinicId: null,
};

const clinicReceptionAuth: AuthContext = {
  userId: DEV_CLINIC_STAFF_ID,
  organizationId: DEV_ORG_ID,
  role: 'clinic_reception',
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

describe('V3.0.6 Staff API', () => {
  let tdb: TestDatabase;
  let memPool: Pool;
  let app: ReturnType<typeof createApp>;

  const founderToken = signAccessToken(founderAuth);
  const clinicReceptionToken = signAccessToken(clinicReceptionAuth);

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
      INSERT INTO staff (id, organization_id, clinic_id, name, role, email, phone, status, data_source, created_at, updated_at)
      VALUES ('${STAFF_B_ID}', '${ORG_B_ID}', '${CLINIC_B_ID}', 'Staff B', 'Reception', 'staffb@test.local', '+91 0000000010', 'Active', 'demo', NOW(), NOW())
    `);

    app = createApp();
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  describe('GET /api/v1/clinics/:clinicId/staff', () => {
    it('list own clinic staff → 200', async () => {
      const res = await request(app)
        .get(`/api/v1/clinics/${DEV_CLINIC_ID}/staff`)
        .set(authHeader(clinicReceptionToken));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.staff)).toBe(true);
      expect(res.body.staff.length).toBe(1);
      expect(res.body.staff[0].id).toBe(DEV_STAFF_ID);
      expect(res.body.staff[0].clinic_id).toBe(DEV_CLINIC_ID);
    });

    it('unauthenticated → 401', async () => {
      const res = await request(app)
        .get(`/api/v1/clinics/${DEV_CLINIC_ID}/staff`);
      expect401(res);
    });

    it('Clinic A user cannot list Clinic B staff → 403', async () => {
      const res = await request(app)
        .get(`/api/v1/clinics/${CLINIC_B_ID}/staff`)
        .set(authHeader(clinicReceptionToken));
      expect403(res);
    });

    it('Org A founder listing Org B clinic staff → 200 but empty (cross-org DB isolation)', async () => {
      const res = await request(app)
        .get(`/api/v1/clinics/${CLINIC_B_ID}/staff`)
        .set(authHeader(founderToken));

      expect(res.status).toBe(200);
      expect(res.body.staff.length).toBe(0);
    });
  });

  describe('GET /api/v1/staff/:id', () => {
    it('get own clinic staff → 200', async () => {
      const res = await request(app)
        .get(`/api/v1/staff/${DEV_STAFF_ID}`)
        .set(authHeader(clinicReceptionToken));

      expect(res.status).toBe(200);
      expect(res.body.staff.id).toBe(DEV_STAFF_ID);
      expect(res.body.staff.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.staff.clinic_id).toBe(DEV_CLINIC_ID);
    });

    it('clinic user cannot get staff from another clinic → 404', async () => {
      const res = await request(app)
        .get(`/api/v1/staff/${STAFF_B_ID}`)
        .set(authHeader(clinicReceptionToken));

      expect404(res);
    });

    it('Org A cannot get Org B staff → 404', async () => {
      const res = await request(app)
        .get(`/api/v1/staff/${STAFF_B_ID}`)
        .set(authHeader(founderToken));

      expect404(res);
    });

    it('unauthenticated → 401', async () => {
      const res = await request(app)
        .get(`/api/v1/staff/${DEV_STAFF_ID}`);
      expect401(res);
    });

    it('invalid UUID → 400', async () => {
      const res = await request(app)
        .get('/api/v1/staff/not-a-uuid')
        .set(authHeader(clinicReceptionToken));
      expect400(res);
    });
  });

  describe('POST /api/v1/clinics/:clinicId/staff', () => {
    it('create staff in own clinic → 201', async () => {
      const res = await request(app)
        .post(`/api/v1/clinics/${DEV_CLINIC_ID}/staff`)
        .set(authHeader(clinicReceptionToken))
        .send({
          name: 'New Staff',
          role: 'Reception',
          email: 'newstaff@test.local',
        });

      expect(res.status).toBe(201);
      expect(res.body.staff).toBeDefined();
      expect(res.body.staff.clinic_id).toBe(DEV_CLINIC_ID);
      expect(res.body.staff.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.staff.name).toBe('New Staff');
      expect(res.body.staff.role).toBe('Reception');
    });

    it('unauthenticated → 401', async () => {
      const res = await request(app)
        .post(`/api/v1/clinics/${DEV_CLINIC_ID}/staff`)
        .send({ name: 'X', role: 'Reception' });
      expect401(res);
    });

    it('clinic user cannot create staff in another clinic → 403', async () => {
      const res = await request(app)
        .post(`/api/v1/clinics/${CLINIC_B_ID}/staff`)
        .set(authHeader(clinicReceptionToken))
        .send({ name: 'X', role: 'Reception' });
      expect403(res);
    });

    it('client-supplied clinic_id cannot override JWT clinic scope', async () => {
      const res = await request(app)
        .post(`/api/v1/clinics/${DEV_CLINIC_ID}/staff`)
        .set(authHeader(clinicReceptionToken))
        .send({
          name: 'Override Staff',
          role: 'Reception',
          clinic_id: CLINIC_B_ID,
        });

      expect(res.status).toBe(201);
      expect(res.body.staff.clinic_id).toBe(DEV_CLINIC_ID);
      expect(res.body.staff.clinic_id).not.toBe(CLINIC_B_ID);
    });

    it('invalid role → 400', async () => {
      const res = await request(app)
        .post(`/api/v1/clinics/${DEV_CLINIC_ID}/staff`)
        .set(authHeader(clinicReceptionToken))
        .send({ name: 'X', role: 'Super Manager' });
      expect400(res);
    });

    it('missing name → 400', async () => {
      const res = await request(app)
        .post(`/api/v1/clinics/${DEV_CLINIC_ID}/staff`)
        .set(authHeader(clinicReceptionToken))
        .send({ role: 'Reception' });
      expect400(res);
    });
  });

  describe('PATCH /api/v1/staff/:id', () => {
    it('update own clinic staff → 200', async () => {
      const res = await request(app)
        .patch(`/api/v1/staff/${DEV_STAFF_ID}`)
        .set(authHeader(clinicReceptionToken))
        .send({ phone: '+91 99999 99999' });

      expect(res.status).toBe(200);
      expect(res.body.staff.phone).toBe('+91 99999 99999');
    });

    it('clinic user cannot update staff from another clinic → 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/staff/${STAFF_B_ID}`)
        .set(authHeader(clinicReceptionToken))
        .send({ name: 'Hacked' });
      expect404(res);
    });

    it('Org A cannot update Org B staff → 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/staff/${STAFF_B_ID}`)
        .set(authHeader(founderToken))
        .send({ name: 'Hacked' });
      expect404(res);
    });

    it('client-supplied clinic_id cannot override JWT clinic scope', async () => {
      const res = await request(app)
        .patch(`/api/v1/staff/${DEV_STAFF_ID}`)
        .set(authHeader(clinicReceptionToken))
        .send({ name: 'Still My Clinic', clinic_id: CLINIC_B_ID });

      expect(res.status).toBe(200);
      expect(res.body.staff.clinic_id).toBe(DEV_CLINIC_ID);
    });

    it('PATCH nonexistent staff → 404', async () => {
      const res = await request(app)
        .patch('/api/v1/staff/00000000-0000-0000-0000-000000000999')
        .set(authHeader(clinicReceptionToken))
        .send({ name: 'Ghost' });
      expect404(res);
    });

    it('PATCH empty body → 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/staff/${DEV_STAFF_ID}`)
        .set(authHeader(clinicReceptionToken))
        .send({});
      expect400(res);
    });
  });
});
