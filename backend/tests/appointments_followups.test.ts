import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
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
const DEV_DOCTOR_ID = '00000000-0000-0000-0000-000000000030';

const CLINIC_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee02';
const PROSPECT_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee01';
const ORG_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee04';
const DOCTOR_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee07';
const LEAD_A_ID = '00000000-0000-0000-0000-000000000051';
const LEAD_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee51';
const APPT_A_ID = '00000000-0000-0000-0000-000000000060';
const APPT_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee60';
const FOLLOWUP_A_ID = '00000000-0000-0000-0000-000000000070';
const FOLLOWUP_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee70';

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

const authHeader = (token: string): { Authorization: string } => ({
  Authorization: `Bearer ${token}`,
});

const expect401 = (res: { status: number; body: { error: { status: number } } }) => {
  expect(res.status).toBe(401);
  expect(res.body.error.status).toBe(401);
};

const expect400 = (res: { status: number; body: { error: { status: number } } }) => {
  expect(res.status).toBe(400);
  expect(res.body.error.status).toBe(400);
};

const expect404 = (res: { status: number; body: { error: { status: number } } }) => {
  expect(res.status).toBe(404);
  expect(res.body.error.status).toBe(404);
};

const setupSharedData = async (tdb: TestDatabase) => {
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
      ('${DOCTOR_B_ID}', '${ORG_B_ID}', '${CLINIC_B_ID}', 'Dr. B', 'Dermatology', 'Owner', 'Active', 'demo', NOW(), NOW())
  `);
  await tdb.public.none(`
    INSERT INTO leads (id, organization_id, clinic_id, source, service_interested, status, assigned_staff_id, last_contact_at, next_action, data_source, created_at, updated_at)
    VALUES
      ('${LEAD_A_ID}', '${DEV_ORG_ID}', '${DEV_CLINIC_ID}', 'Web Form', 'Dermatology', 'New', null, NOW(), 'Call back', 'demo', NOW(), NOW()),
      ('${LEAD_B_ID}', '${ORG_B_ID}', '${CLINIC_B_ID}', 'Instagram', 'Hair Loss', 'Contacted', null, NOW(), 'Send proposal', 'demo', NOW(), NOW())
  `);
  await tdb.public.none(`
    INSERT INTO appointments (id, organization_id, lead_id, doctor_id, scheduled_at, status, reminder_status, attended_at, data_source, created_at, updated_at)
    VALUES
      ('${APPT_A_ID}', '${DEV_ORG_ID}', '${LEAD_A_ID}', '${DEV_DOCTOR_ID}', '2025-01-15T10:00:00Z', 'Booked', 'Pending', NULL, 'demo', NOW(), NOW()),
      ('${APPT_B_ID}', '${ORG_B_ID}', '${LEAD_B_ID}', '${DOCTOR_B_ID}', '2025-01-16T10:00:00Z', 'Booked', 'Pending', NULL, 'demo', NOW(), NOW())
  `);
  await tdb.public.none(`
    INSERT INTO followups (id, organization_id, lead_id, appointment_id, type, scheduled_at, channel, status, outcome, data_source, created_at, updated_at)
    VALUES
      ('${FOLLOWUP_A_ID}', '${DEV_ORG_ID}', '${LEAD_A_ID}', '${APPT_A_ID}', 'Reminder', '2025-01-15T09:00:00Z', 'WhatsApp', 'Scheduled', NULL, 'demo', NOW(), NOW()),
      ('${FOLLOWUP_B_ID}', '${ORG_B_ID}', '${LEAD_B_ID}', '${APPT_B_ID}', 'Recovery', '2025-01-16T09:00:00Z', 'WhatsApp', 'Scheduled', NULL, 'demo', NOW(), NOW())
  `);
};

describe('V3.0.8 Appointments API', () => {
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
    await setupSharedData(tdb);
    app = createApp();
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  describe('GET /api/v1/appointments', () => {
    it('authenticated list -> 200', async () => {
      const res = await request(app)
        .get('/api/v1/appointments')
        .set(authHeader(founderToken));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.appointments)).toBe(true);
      expect(res.body.appointments.length).toBe(1);
      expect(res.body.appointments[0].organization_id).toBe(DEV_ORG_ID);
    });

    it('missing auth -> 401', async () => {
      const res = await request(app).get('/api/v1/appointments');
      expect401(res);
    });

    it('clinic owner sees only own clinic appointments', async () => {
      const res = await request(app)
        .get('/api/v1/appointments')
        .set(authHeader(clinicOwnerToken));

      expect(res.status).toBe(200);
      expect(res.body.appointments.length).toBe(1);
      expect(res.body.appointments[0].lead_id).toBe(LEAD_A_ID);
    });

    it('founder cannot see other org appointments', async () => {
      const res = await request(app)
        .get('/api/v1/appointments')
        .set(authHeader(founderToken));

      expect(res.body.appointments.length).toBe(1);
      expect(res.body.appointments[0].organization_id).toBe(DEV_ORG_ID);
    });
  });

  describe('GET /api/v1/appointments/:id', () => {
    it('get own appointment -> 200', async () => {
      const res = await request(app)
        .get(`/api/v1/appointments/${APPT_A_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect(res.status).toBe(200);
      expect(res.body.appointment.id).toBe(APPT_A_ID);
      expect(res.body.appointment.organization_id).toBe(DEV_ORG_ID);
    });

    it('missing auth -> 401', async () => {
      const res = await request(app).get(`/api/v1/appointments/${APPT_A_ID}`);
      expect401(res);
    });

    it('clinic A cannot access clinic B appointment -> 404', async () => {
      const res = await request(app)
        .get(`/api/v1/appointments/${APPT_B_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect404(res);
    });

    it('org A cannot access org B appointment -> 404', async () => {
      const res = await request(app)
        .get(`/api/v1/appointments/${APPT_B_ID}`)
        .set(authHeader(founderToken));

      expect404(res);
    });
  });

  describe('POST /api/v1/appointments', () => {
    it('create -> 201', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set(authHeader(clinicOwnerToken))
        .send({
          lead_id: LEAD_A_ID,
          doctor_id: DEV_DOCTOR_ID,
          scheduled_at: '2025-02-01T10:00:00Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.appointment).toBeDefined();
      expect(res.body.appointment.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.appointment.lead_id).toBe(LEAD_A_ID);
      expect(res.body.appointment.status).toBe('Booked');
    });

    it('missing auth -> 401', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .send({ lead_id: LEAD_A_ID, doctor_id: DEV_DOCTOR_ID, scheduled_at: '2025-02-01T10:00:00Z' });
      expect401(res);
    });

    it('clinic A cannot create for clinic B lead -> 404', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set(authHeader(clinicOwnerToken))
        .send({ lead_id: LEAD_B_ID, doctor_id: DEV_DOCTOR_ID, scheduled_at: '2025-02-01T10:00:00Z' });

      expect404(res);
    });

    it('org A cannot create for org B lead -> 404', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set(authHeader(founderToken))
        .send({ lead_id: LEAD_B_ID, doctor_id: DEV_DOCTOR_ID, scheduled_at: '2025-02-01T10:00:00Z' });

      expect404(res);
    });

    it('client organization_id cannot override JWT', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set(authHeader(clinicOwnerToken))
        .send({
          lead_id: LEAD_A_ID,
          doctor_id: DEV_DOCTOR_ID,
          scheduled_at: '2025-02-01T10:00:00Z',
          organization_id: ORG_B_ID,
        });

      expect(res.status).toBe(201);
      expect(res.body.appointment.organization_id).toBe(DEV_ORG_ID);
    });

    it('invalid payload -> 400', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set(authHeader(clinicOwnerToken))
        .send({});

      expect400(res);
    });
  });

  describe('PATCH /api/v1/appointments/:id', () => {
    beforeEach(async () => {
      await tdb.public.none(`UPDATE appointments SET status = 'Booked' WHERE id = '${APPT_A_ID}'`);
    });

    it('update own appointment -> 200', async () => {
      const res = await request(app)
        .patch(`/api/v1/appointments/${APPT_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Attended' });

      expect(res.status).toBe(200);
      expect(res.body.appointment.status).toBe('Attended');
    });

    it('clinic A cannot update clinic B appointment -> 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/appointments/${APPT_B_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Attended' });

      expect404(res);
    });

    it('org A cannot update org B appointment -> 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/appointments/${APPT_B_ID}`)
        .set(authHeader(founderToken))
        .send({ status: 'Attended' });

      expect404(res);
    });

    it('client clinic_id cannot override JWT', async () => {
      const res = await request(app)
        .patch(`/api/v1/appointments/${APPT_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'NoShow', clinic_id: CLINIC_B_ID });

      expect(res.status).toBe(200);
      expect(res.body.appointment.status).toBe('NoShow');
    });

    it('invalid status transition -> 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/appointments/${APPT_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Booked' });

      expect400(res);
    });

    it('PATCH empty body -> 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/appointments/${APPT_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({});

      expect400(res);
    });
  });
});

describe('V3.0.8 Followups API', () => {
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
    await setupSharedData(tdb);
    app = createApp();
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  describe('GET /api/v1/followups', () => {
    it('authenticated list -> 200', async () => {
      const res = await request(app)
        .get('/api/v1/followups')
        .set(authHeader(founderToken));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.followups)).toBe(true);
      expect(res.body.followups.length).toBe(1);
      expect(res.body.followups[0].organization_id).toBe(DEV_ORG_ID);
    });

    it('missing auth -> 401', async () => {
      const res = await request(app).get('/api/v1/followups');
      expect401(res);
    });

    it('clinic isolation: clinic owner sees only own clinic followups', async () => {
      const res = await request(app)
        .get('/api/v1/followups')
        .set(authHeader(clinicOwnerToken));

      expect(res.status).toBe(200);
      expect(res.body.followups.length).toBe(1);
      expect(res.body.followups[0].lead_id).toBe(LEAD_A_ID);
    });

    it('organization isolation: founder cannot see other org followups', async () => {
      const res = await request(app)
        .get('/api/v1/followups')
        .set(authHeader(founderToken));

      expect(res.body.followups.length).toBe(1);
      expect(res.body.followups[0].organization_id).toBe(DEV_ORG_ID);
    });
  });

  describe('GET /api/v1/followups/:id', () => {
    it('get own followup -> 200', async () => {
      const res = await request(app)
        .get(`/api/v1/followups/${FOLLOWUP_A_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect(res.status).toBe(200);
      expect(res.body.followup.id).toBe(FOLLOWUP_A_ID);
      expect(res.body.followup.organization_id).toBe(DEV_ORG_ID);
    });

    it('missing auth -> 401', async () => {
      const res = await request(app).get(`/api/v1/followups/${FOLLOWUP_A_ID}`);
      expect401(res);
    });

    it('clinic isolation -> 404', async () => {
      const res = await request(app)
        .get(`/api/v1/followups/${FOLLOWUP_B_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect404(res);
    });

    it('organization isolation -> 404', async () => {
      const res = await request(app)
        .get(`/api/v1/followups/${FOLLOWUP_B_ID}`)
        .set(authHeader(founderToken));

      expect404(res);
    });
  });

  describe('POST /api/v1/followups', () => {
    it('create followup -> 201', async () => {
      const res = await request(app)
        .post('/api/v1/followups')
        .set(authHeader(founderToken))
        .send({
          type: 'Reminder',
          scheduled_at: '2025-01-20T09:00:00Z',
          channel: 'WhatsApp',
          lead_id: LEAD_A_ID,
          appointment_id: APPT_A_ID,
        });

      expect(res.status).toBe(201);
      expect(res.body.followup).toBeDefined();
      expect(res.body.followup.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.followup.lead_id).toBe(LEAD_A_ID);
      expect(res.body.followup.status).toBe('Scheduled');
    });

    it('missing auth -> 401', async () => {
      const res = await request(app)
        .post('/api/v1/followups')
        .send({ type: 'Reminder', scheduled_at: '2025-01-20T09:00:00Z', channel: 'WhatsApp' });
      expect401(res);
    });

    it('invalid lead_id -> 404', async () => {
      const res = await request(app)
        .post('/api/v1/followups')
        .set(authHeader(founderToken))
        .send({
          type: 'Reminder',
          scheduled_at: '2025-01-20T09:00:00Z',
          channel: 'WhatsApp',
          lead_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee99',
        });

      expect404(res);
    });

    it('invalid appointment_id -> 404', async () => {
      const res = await request(app)
        .post('/api/v1/followups')
        .set(authHeader(founderToken))
        .send({
          type: 'Reminder',
          scheduled_at: '2025-01-20T09:00:00Z',
          channel: 'WhatsApp',
          appointment_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee99',
        });

      expect404(res);
    });

    it('client organization_id cannot override JWT', async () => {
      const res = await request(app)
        .post('/api/v1/followups')
        .set(authHeader(clinicOwnerToken))
        .send({
          type: 'Reminder',
          scheduled_at: '2025-01-20T09:00:00Z',
          channel: 'WhatsApp',
          lead_id: LEAD_A_ID,
          organization_id: ORG_B_ID,
        });

      expect(res.status).toBe(201);
      expect(res.body.followup.organization_id).toBe(DEV_ORG_ID);
    });

    it('invalid payload -> 400', async () => {
      const res = await request(app)
        .post('/api/v1/followups')
        .set(authHeader(founderToken))
        .send({});

      expect400(res);
    });
  });

  describe('PATCH /api/v1/followups/:id', () => {


    beforeEach(async () => {
      await tdb.public.none(`UPDATE followups SET status = 'Scheduled' WHERE id = '${FOLLOWUP_A_ID}'`);
    });

    it('update own followup -> 200', async () => {
      const res = await request(app)
        .patch(`/api/v1/followups/${FOLLOWUP_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Completed' });

      expect(res.status).toBe(200);
      expect(res.body.followup.status).toBe('Completed');
    });

    it('valid status transition Missed -> Scheduled -> 200', async () => {
      await request(app)
        .patch(`/api/v1/followups/${FOLLOWUP_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Missed' });

      const res = await request(app)
        .patch(`/api/v1/followups/${FOLLOWUP_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Scheduled' });

      expect(res.status).toBe(200);
      expect(res.body.followup.status).toBe('Scheduled');
    });

    it('invalid status transition -> 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/followups/${FOLLOWUP_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Scheduled' });

      expect400(res);
    });

    it('clinic isolation -> 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/followups/${FOLLOWUP_B_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Completed' });

      expect404(res);
    });

    it('organization isolation -> 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/followups/${FOLLOWUP_B_ID}`)
        .set(authHeader(founderToken))
        .send({ status: 'Completed' });

      expect404(res);
    });

    it('client organization_id cannot override JWT', async () => {
      const res = await request(app)
        .patch(`/api/v1/followups/${FOLLOWUP_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Completed', organization_id: ORG_B_ID });

      expect(res.status).toBe(200);
      expect(res.body.followup.organization_id).toBe(DEV_ORG_ID);
    });

    it('PATCH empty body -> 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/followups/${FOLLOWUP_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({});

      expect400(res);
    });
  });
});
