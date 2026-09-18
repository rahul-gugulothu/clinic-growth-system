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
const USER_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee04';

const STAFF_A_ID = '00000000-0000-0000-0000-000000000050';
const STAFF_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee06';

const LEAD_A_ID = '00000000-0000-0000-0000-000000000051';
const LEAD_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee51';
const CONV_A_ID = '00000000-0000-0000-0000-000000000060';
const CONV_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee60';

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

const expect404 = (res: { status: number; body: { error: { status: number } } }) => {
  expect(res.status).toBe(404);
  expect(res.body.error.status).toBe(404);
};

const expect400 = (res: { status: number; body: { error: { status: number } } }) => {
  expect(res.status).toBe(400);
  expect(res.body.error.status).toBe(400);
};

describe('V3.0.7 Leads API', () => {
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
      INSERT INTO staff (id, organization_id, clinic_id, name, role, email, phone, status, data_source, created_at, updated_at)
      VALUES
        ('${STAFF_A_ID}', '${DEV_ORG_ID}', '${DEV_CLINIC_ID}', 'Priya S.', 'Reception', 'priya@drkaya.demo.local', '+91 98000 11111', 'Active', 'demo', NOW(), NOW()),
        ('${STAFF_B_ID}', '${ORG_B_ID}', '${CLINIC_B_ID}', 'Staff B', 'Manager', 'staffb@test.local', '+91 0000000010', 'Active', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO leads (id, organization_id, clinic_id, source, service_interested, status, assigned_staff_id, last_contact_at, next_action, data_source, created_at, updated_at)
      VALUES
        ('${LEAD_A_ID}', '${DEV_ORG_ID}', '${DEV_CLINIC_ID}', 'Web Form', 'Dermatology', 'New', '${STAFF_A_ID}', NOW(), 'Call back', 'demo', NOW(), NOW()),
        ('${LEAD_B_ID}', '${ORG_B_ID}', '${CLINIC_B_ID}', 'Instagram', 'Hair Loss', 'Contacted', '${STAFF_B_ID}', NOW(), 'Send proposal', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO conversations (id, organization_id, lead_id, channel, started_at, last_message_at, assigned_staff_id, status, data_source, created_at, updated_at)
      VALUES
        ('${CONV_A_ID}', '${DEV_ORG_ID}', '${LEAD_A_ID}', 'WhatsApp', NOW(), NOW(), '${STAFF_A_ID}', 'Open', 'demo', NOW(), NOW()),
        ('${CONV_B_ID}', '${ORG_B_ID}', '${LEAD_B_ID}', 'Phone', NOW(), NOW(), '${STAFF_B_ID}', 'Open', 'demo', NOW(), NOW())
    `);

    app = createApp();
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  describe('GET /api/v1/leads', () => {
    it('authenticated list → 200', async () => {
      const res = await request(app)
        .get('/api/v1/leads')
        .set(authHeader(founderToken));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.leads)).toBe(true);
      expect(res.body.leads.length).toBe(1);
      expect(res.body.leads[0].organization_id).toBe(DEV_ORG_ID);
    });

    it('unauthenticated → 401', async () => {
      const res = await request(app).get('/api/v1/leads');
      expect401(res);
    });

    it('clinic owner sees only own clinic leads', async () => {
      const res = await request(app)
        .get('/api/v1/leads')
        .set(authHeader(clinicOwnerToken));

      expect(res.status).toBe(200);
      expect(res.body.leads.length).toBe(1);
      expect(res.body.leads[0].clinic_id).toBe(DEV_CLINIC_ID);
    });

    it('founder cannot see other org leads → empty', async () => {
      const res = await request(app)
        .get('/api/v1/leads')
        .set(authHeader(founderToken));

      expect(res.body.leads.length).toBe(1);
      expect(res.body.leads[0].organization_id).toBe(DEV_ORG_ID);
    });
  });

  describe('GET /api/v1/leads/:id', () => {
    it('get own lead → 200', async () => {
      const res = await request(app)
        .get(`/api/v1/leads/${LEAD_A_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect(res.status).toBe(200);
      expect(res.body.lead.id).toBe(LEAD_A_ID);
      expect(res.body.lead.organization_id).toBe(DEV_ORG_ID);
    });

    it('missing auth → 401', async () => {
      const res = await request(app).get(`/api/v1/leads/${LEAD_A_ID}`);
      expect401(res);
    });

    it('clinic A cannot access clinic B lead → 404', async () => {
      const res = await request(app)
        .get(`/api/v1/leads/${LEAD_B_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect404(res);
    });

    it('org A cannot access org B lead → 404', async () => {
      const res = await request(app)
        .get(`/api/v1/leads/${LEAD_B_ID}`)
        .set(authHeader(founderToken));

      expect404(res);
    });

    it('client clinic_id cannot override JWT', async () => {
      const res = await request(app)
        .get(`/api/v1/leads/${LEAD_B_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect404(res);
    });
  });

  describe('POST /api/v1/leads', () => {
    it('create → 201', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set(authHeader(clinicOwnerToken))
        .send({ source: 'Web Form', service_interested: 'Aesthetic' });

      expect(res.status).toBe(201);
      expect(res.body.lead).toBeDefined();
      expect(res.body.lead.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.lead.clinic_id).toBe(DEV_CLINIC_ID);
      expect(res.body.lead.source).toBe('Web Form');
    });

    it('internal user can specify clinic_id', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set(authHeader(founderToken))
        .send({ clinic_id: DEV_CLINIC_ID, source: 'Phone' });

      expect(res.status).toBe(201);
      expect(res.body.lead.clinic_id).toBe(DEV_CLINIC_ID);
      expect(res.body.lead.organization_id).toBe(DEV_ORG_ID);
    });

    it('internal user invalid clinic_id → 404', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set(authHeader(founderToken))
        .send({ clinic_id: CLINIC_B_ID, source: 'Phone' });

      expect404(res);
    });

    it('missing auth → 401', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .send({ source: 'Web Form' });
      expect401(res);
    });

    it('client organization_id cannot override JWT', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set(authHeader(clinicOwnerToken))
        .send({ source: 'Web Form', organization_id: ORG_B_ID });

      expect(res.status).toBe(201);
      expect(res.body.lead.organization_id).toBe(DEV_ORG_ID);
    });

    it('invalid payload → 400', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set(authHeader(clinicOwnerToken))
        .send({});

      expect400(res);
    });

    it('invalid assigned_staff_id → 404', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set(authHeader(clinicOwnerToken))
        .send({ source: 'Web Form', assigned_staff_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee99' });

      expect404(res);
    });
  });

  describe('PATCH /api/v1/leads/:id', () => {
    it('update own lead → 200', async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${LEAD_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Contacted' });

      expect(res.status).toBe(200);
      expect(res.body.lead.status).toBe('Contacted');
    });

    it('clinic A cannot update clinic B lead → 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${LEAD_B_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Qualified' });

      expect404(res);
    });

    it('org A cannot update org B lead → 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${LEAD_B_ID}`)
        .set(authHeader(founderToken))
        .send({ status: 'Qualified' });

      expect404(res);
    });

    it('client clinic_id cannot override JWT', async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${LEAD_B_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Qualified', clinic_id: CLINIC_B_ID });

      expect404(res);
    });

    it('client organization_id cannot override JWT', async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${LEAD_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Qualified', organization_id: ORG_B_ID });

      expect(res.status).toBe(200);
      expect(res.body.lead.organization_id).toBe(DEV_ORG_ID);
    });

    it('PATCH empty body → 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${LEAD_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({});

      expect400(res);
    });
  });
});

describe('V3.0.7 Conversations API', () => {
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
      INSERT INTO staff (id, organization_id, clinic_id, name, role, email, phone, status, data_source, created_at, updated_at)
      VALUES
        ('${STAFF_A_ID}', '${DEV_ORG_ID}', '${DEV_CLINIC_ID}', 'Priya S.', 'Reception', 'priya@drkaya.demo.local', '+91 98000 11111', 'Active', 'demo', NOW(), NOW()),
        ('${STAFF_B_ID}', '${ORG_B_ID}', '${CLINIC_B_ID}', 'Staff B', 'Manager', 'staffb@test.local', '+91 0000000010', 'Active', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO leads (id, organization_id, clinic_id, source, service_interested, status, assigned_staff_id, last_contact_at, next_action, data_source, created_at, updated_at)
      VALUES
        ('${LEAD_A_ID}', '${DEV_ORG_ID}', '${DEV_CLINIC_ID}', 'Web Form', 'Dermatology', 'New', '${STAFF_A_ID}', NOW(), 'Call back', 'demo', NOW(), NOW()),
        ('${LEAD_B_ID}', '${ORG_B_ID}', '${CLINIC_B_ID}', 'Instagram', 'Hair Loss', 'Contacted', '${STAFF_B_ID}', NOW(), 'Send proposal', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO conversations (id, organization_id, lead_id, channel, started_at, last_message_at, assigned_staff_id, status, data_source, created_at, updated_at)
      VALUES
        ('${CONV_A_ID}', '${DEV_ORG_ID}', '${LEAD_A_ID}', 'WhatsApp', NOW(), NOW(), '${STAFF_A_ID}', 'Open', 'demo', NOW(), NOW()),
        ('${CONV_B_ID}', '${ORG_B_ID}', '${LEAD_B_ID}', 'Phone', NOW(), NOW(), '${STAFF_B_ID}', 'Open', 'demo', NOW(), NOW())
    `);

    app = createApp();
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  describe('GET /api/v1/leads/:leadId/conversations', () => {
    it('list conversations for authorized lead', async () => {
      const res = await request(app)
        .get(`/api/v1/leads/${LEAD_A_ID}/conversations`)
        .set(authHeader(founderToken));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.conversations)).toBe(true);
      expect(res.body.conversations.length).toBe(1);
      expect(res.body.conversations[0].lead_id).toBe(LEAD_A_ID);
    });

    it('missing auth → 401', async () => {
      const res = await request(app)
        .get(`/api/v1/leads/${LEAD_A_ID}/conversations`);
      expect401(res);
    });

    it('clinic isolation: Clinic A cannot list Clinic B lead conversations → 404', async () => {
      const res = await request(app)
        .get(`/api/v1/leads/${LEAD_B_ID}/conversations`)
        .set(authHeader(clinicOwnerToken));

      expect404(res);
    });

    it('organization isolation: Org A cannot list Org B lead conversations', async () => {
      const res = await request(app)
        .get(`/api/v1/leads/${LEAD_B_ID}/conversations`)
        .set(authHeader(founderToken));

      expect404(res);
    });

    it('unauthorized lead access denied → 404', async () => {
      const res = await request(app)
        .get('/api/v1/leads/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee99/conversations')
        .set(authHeader(founderToken));

      expect404(res);
    });
  });

  describe('GET /api/v1/conversations/:id', () => {
    it('get own conversation', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${CONV_A_ID}`)
        .set(authHeader(founderToken));

      expect(res.status).toBe(200);
      expect(res.body.conversation.id).toBe(CONV_A_ID);
      expect(res.body.conversation.organization_id).toBe(DEV_ORG_ID);
    });

    it('missing auth → 401', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${CONV_A_ID}`);
      expect401(res);
    });

    it('clinic isolation: cannot get other clinic conversation → 404', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${CONV_B_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect404(res);
    });

    it('organization isolation: cannot get other org conversation → 404', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${CONV_B_ID}`)
        .set(authHeader(founderToken));

      expect404(res);
    });
  });

  describe('POST /api/v1/leads/:leadId/conversations', () => {
    it('create conversation for authorized lead', async () => {
      const res = await request(app)
        .post(`/api/v1/leads/${LEAD_A_ID}/conversations`)
        .set(authHeader(founderToken))
        .send({ channel: 'Email' });

      expect(res.status).toBe(201);
      expect(res.body.conversation).toBeDefined();
      expect(res.body.conversation.lead_id).toBe(LEAD_A_ID);
      expect(res.body.conversation.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.conversation.status).toBe('Open');
    });

    it('missing auth → 401', async () => {
      const res = await request(app)
        .post(`/api/v1/leads/${LEAD_A_ID}/conversations`)
        .send({ channel: 'Email' });
      expect401(res);
    });

    it('clinic isolation: cannot create for other clinic lead → 404', async () => {
      const res = await request(app)
        .post(`/api/v1/leads/${LEAD_B_ID}/conversations`)
        .set(authHeader(clinicOwnerToken))
        .send({ channel: 'Email' });

      expect404(res);
    });

    it('invalid payload → 400', async () => {
      const res = await request(app)
        .post(`/api/v1/leads/${LEAD_A_ID}/conversations`)
        .set(authHeader(founderToken))
        .send({});

      expect400(res);
    });
  });

  describe('PATCH /api/v1/conversations/:id', () => {
    it('update own conversation', async () => {
      const res = await request(app)
        .patch(`/api/v1/conversations/${CONV_A_ID}`)
        .set(authHeader(founderToken))
        .send({ status: 'Closed' });

      expect(res.status).toBe(200);
      expect(res.body.conversation.status).toBe('Closed');
    });

    it('clinic isolation: cannot update other clinic conversation → 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/conversations/${CONV_B_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Closed' });

      expect404(res);
    });

    it('organization isolation: cannot update other org conversation → 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/conversations/${CONV_B_ID}`)
        .set(authHeader(founderToken))
        .send({ status: 'Closed' });

      expect404(res);
    });

    it('invalid payload → 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/conversations/${CONV_A_ID}`)
        .set(authHeader(founderToken))
        .send({});

      expect400(res);
    });
  });
});

describe('V3.0.7 Messages API', () => {
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
      INSERT INTO staff (id, organization_id, clinic_id, name, role, email, phone, status, data_source, created_at, updated_at)
      VALUES
        ('${STAFF_A_ID}', '${DEV_ORG_ID}', '${DEV_CLINIC_ID}', 'Priya S.', 'Reception', 'priya@drkaya.demo.local', '+91 98000 11111', 'Active', 'demo', NOW(), NOW()),
        ('${STAFF_B_ID}', '${ORG_B_ID}', '${CLINIC_B_ID}', 'Staff B', 'Manager', 'staffb@test.local', '+91 0000000010', 'Active', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO leads (id, organization_id, clinic_id, source, service_interested, status, assigned_staff_id, last_contact_at, next_action, data_source, created_at, updated_at)
      VALUES
        ('${LEAD_A_ID}', '${DEV_ORG_ID}', '${DEV_CLINIC_ID}', 'Web Form', 'Dermatology', 'New', '${STAFF_A_ID}', NOW(), 'Call back', 'demo', NOW(), NOW()),
        ('${LEAD_B_ID}', '${ORG_B_ID}', '${CLINIC_B_ID}', 'Instagram', 'Hair Loss', 'Contacted', '${STAFF_B_ID}', NOW(), 'Send proposal', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO conversations (id, organization_id, lead_id, channel, started_at, last_message_at, assigned_staff_id, status, data_source, created_at, updated_at)
      VALUES
        ('${CONV_A_ID}', '${DEV_ORG_ID}', '${LEAD_A_ID}', 'WhatsApp', NOW(), NOW(), '${STAFF_A_ID}', 'Open', 'demo', NOW(), NOW()),
        ('${CONV_B_ID}', '${ORG_B_ID}', '${LEAD_B_ID}', 'Phone', NOW(), NOW(), '${STAFF_B_ID}', 'Open', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO messages (id, organization_id, conversation_id, sender, body, sent_at, data_source, created_at)
      VALUES
        ('00000000-0000-0000-0000-000000000070', '${DEV_ORG_ID}', '${CONV_A_ID}', 'clinic', 'Hello from clinic', NOW(), 'demo', NOW()),
        ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee70', '${ORG_B_ID}', '${CONV_B_ID}', 'lead', 'Hello from lead', NOW(), 'demo', NOW())
    `);

    app = createApp();
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  describe('GET /api/v1/conversations/:conversationId/messages', () => {
    it('list authorized conversation messages', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${CONV_A_ID}/messages`)
        .set(authHeader(founderToken));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(res.body.messages.length).toBe(1);
      expect(res.body.messages[0].conversation_id).toBe(CONV_A_ID);
    });

    it('missing auth → 401', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${CONV_A_ID}/messages`);
      expect401(res);
    });

    it('unauthorized conversation cannot expose messages → 404', async () => {
      const res = await request(app)
        .get('/api/v1/conversations/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee99/messages')
        .set(authHeader(founderToken));

      expect404(res);
    });

    it('clinic isolation: cannot list messages for other clinic conversation → 404', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${CONV_B_ID}/messages`)
        .set(authHeader(clinicOwnerToken));

      expect404(res);
    });

    it('organization isolation: cannot list messages for other org conversation → 404', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${CONV_B_ID}/messages`)
        .set(authHeader(founderToken));

      expect404(res);
    });
  });

  describe('POST /api/v1/conversations/:conversationId/messages', () => {
    it('create message', async () => {
      const res = await request(app)
        .post(`/api/v1/conversations/${CONV_A_ID}/messages`)
        .set(authHeader(founderToken))
        .send({ sender: 'clinic', body: 'Follow-up message' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBeDefined();
      expect(res.body.message.conversation_id).toBe(CONV_A_ID);
      expect(res.body.message.sender).toBe('clinic');
      expect(res.body.message.body).toBe('Follow-up message');
    });

    it('missing auth → 401', async () => {
      const res = await request(app)
        .post(`/api/v1/conversations/${CONV_A_ID}/messages`)
        .send({ sender: 'clinic', body: 'Hello' });
      expect401(res);
    });

    it('unauthorized conversation cannot receive messages → 404', async () => {
      const res = await request(app)
        .post('/api/v1/conversations/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee99/messages')
        .set(authHeader(founderToken))
        .send({ sender: 'clinic', body: 'Hello' });

      expect404(res);
    });

    it('clinic isolation: cannot create message on other clinic conversation → 404', async () => {
      const res = await request(app)
        .post(`/api/v1/conversations/${CONV_B_ID}/messages`)
        .set(authHeader(clinicOwnerToken))
        .send({ sender: 'clinic', body: 'Hello' });

      expect404(res);
    });

    it('organization isolation: cannot create message on other org conversation → 404', async () => {
      const res = await request(app)
        .post(`/api/v1/conversations/${CONV_B_ID}/messages`)
        .set(authHeader(founderToken))
        .send({ sender: 'clinic', body: 'Hello' });

      expect404(res);
    });

    it('invalid payload → 400', async () => {
      const res = await request(app)
        .post(`/api/v1/conversations/${CONV_A_ID}/messages`)
        .set(authHeader(founderToken))
        .send({});

      expect400(res);
    });
  });
});
