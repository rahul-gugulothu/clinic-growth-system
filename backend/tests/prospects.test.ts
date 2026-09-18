import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import type { AuthContext } from '../src/types/index.js';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { setPool } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/jwt.js';

// ---- Seed data IDs (from migrations/00002_seed_dev_data.sql) ----
const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEV_PROSPECT_ID = '00000000-0000-0000-0000-000000000010';
const DEV_FOUNDER_ID = '00000000-0000-0000-0000-000000000002';

// ---- Test Org B data ----
const ORG_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PROSPECT_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee01';
const USER_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee03';

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

const founderAuth: AuthContext = {
  userId: DEV_FOUNDER_ID,
  organizationId: DEV_ORG_ID,
  role: 'founder',
  clinicId: null,
};

const userBAuth: AuthContext = {
  userId: USER_B_ID,
  organizationId: ORG_B_ID,
  role: 'founder',
  clinicId: null,
};

describe('V3.0.5 Prospect API', () => {
  let tdb: TestDatabase;
  let memPool: Pool;
  let app: ReturnType<typeof createApp>;

  const founderToken = signAccessToken(founderAuth);
  const userBToken = signAccessToken(userBAuth);

  beforeAll(async () => {
    tdb = createTestDatabase();
    const pgLib = tdb.db.adapters.createPg();
    memPool = new pgLib.Pool();
    setPool(memPool);

    // Insert Organization B with a prospect for cross-org tests
    await tdb.public.none(`
      INSERT INTO organizations (id, name, status, timezone, data_source, created_at, updated_at)
      VALUES ('${ORG_B_ID}', 'Test Org B', 'trial', 'UTC', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO prospects (id, organization_id, clinic_name, doctor_name, specialty, area, data_source, created_at, updated_at)
      VALUES ('${PROSPECT_B_ID}', '${ORG_B_ID}', 'Clinic B', 'Dr. B', 'Dermatology', 'Area B', 'demo', NOW(), NOW())
    `);
    await tdb.public.none(`
      INSERT INTO users (id, email, role, organization_id, clinic_id, data_source, created_at, updated_at)
      VALUES ('${USER_B_ID}', 'userb@test.local', 'founder', '${ORG_B_ID}', NULL, 'demo', NOW(), NOW())
    `);

    app = createApp();
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  describe('Authentication', () => {
    it('missing token → 401', async () => {
      const res = await request(app)
        .get('/api/v1/prospects')
        .set('Cookie', []);

      expect401(res);
    });

    it('invalid token → 401', async () => {
      const res = await request(app)
        .get('/api/v1/prospects')
        .set(authHeader('invalid.token.here'));

      expect401(res);
    });
  });

  describe('GET /api/v1/prospects (list)', () => {
    it('valid authenticated list → 200', async () => {
      const res = await request(app)
        .get('/api/v1/prospects')
        .set(authHeader(founderToken));

      expect(res.status).toBe(200);
      expect(res.body.prospects).toBeDefined();
      expect(Array.isArray(res.body.prospects)).toBe(true);
      expect(res.body.prospects.length).toBe(1);
      expect(res.body.prospects[0].id).toBe(DEV_PROSPECT_ID);
      expect(res.body.prospects[0].organization_id).toBe(DEV_ORG_ID);
      expect(res.body.prospects[0].clinic_name).toBe('Kaya Skin Clinic');
    });

    it('Org A cannot list Org B records', async () => {
      const res = await request(app)
        .get('/api/v1/prospects')
        .set(authHeader(founderToken));

      expect(res.status).toBe(200);
      const orgBProspect = res.body.prospects.find(
        (p: { id: string }) => p.id === PROSPECT_B_ID
      );
      expect(orgBProspect).toBeUndefined();
    });

    it('Org B lists only its own records', async () => {
      const res = await request(app)
        .get('/api/v1/prospects')
        .set(authHeader(userBToken));

      expect(res.status).toBe(200);
      expect(res.body.prospects.length).toBe(1);
      expect(res.body.prospects[0].id).toBe(PROSPECT_B_ID);
      expect(res.body.prospects[0].organization_id).toBe(ORG_B_ID);
    });
  });

  describe('GET /api/v1/prospects/:id', () => {
    it('valid authenticated read → 200', async () => {
      const res = await request(app)
        .get(`/api/v1/prospects/${DEV_PROSPECT_ID}`)
        .set(authHeader(founderToken));

      expect(res.status).toBe(200);
      expect(res.body.prospect.id).toBe(DEV_PROSPECT_ID);
      expect(res.body.prospect.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.prospect.clinic_name).toBe('Kaya Skin Clinic');
      expect(res.body.prospect.doctor_name).toBe('Dr. Anaya Kaya');
    });

    it('Org A cannot GET Org B prospect → 404', async () => {
      const res = await request(app)
        .get(`/api/v1/prospects/${PROSPECT_B_ID}`)
        .set(authHeader(founderToken));

      expect404(res);
    });

    it('Org B can GET its own prospect → 200', async () => {
      const res = await request(app)
        .get(`/api/v1/prospects/${PROSPECT_B_ID}`)
        .set(authHeader(userBToken));

      expect(res.status).toBe(200);
      expect(res.body.prospect.id).toBe(PROSPECT_B_ID);
      expect(res.body.prospect.organization_id).toBe(ORG_B_ID);
    });

    it('nonexistent prospect → 404', async () => {
      const res = await request(app)
        .get('/api/v1/prospects/00000000-0000-0000-0000-000000000999')
        .set(authHeader(founderToken));

      expect404(res);
    });

    it('invalid UUID → 400', async () => {
      const res = await request(app)
        .get('/api/v1/prospects/not-a-uuid')
        .set(authHeader(founderToken));

      expect400(res);
    });
  });

  describe('POST /api/v1/prospects', () => {
    it('valid authenticated create → 201', async () => {
      const res = await request(app)
        .post('/api/v1/prospects')
        .set(authHeader(founderToken))
        .send({
          clinic_name: 'New Skin Clinic',
          doctor_name: 'Dr. New',
          specialty: 'Dermatology',
          area: 'Bandra',
          phone: '+91 99999 99999',
        });

      expect(res.status).toBe(201);
      expect(res.body.prospect.id).toBeDefined();
      expect(res.body.prospect.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.prospect.clinic_name).toBe('New Skin Clinic');
      expect(res.body.prospect.doctor_name).toBe('Dr. New');
    });

    it('client-supplied organization_id cannot override JWT organization', async () => {
      const res = await request(app)
        .post('/api/v1/prospects')
        .set(authHeader(founderToken))
        .send({
          clinic_name: 'Override Test',
          doctor_name: 'Dr. Override',
          specialty: 'Dermatology',
          area: 'Bandra',
          organization_id: ORG_B_ID,
        });

      expect(res.status).toBe(201);
      expect(res.body.prospect.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.prospect.organization_id).not.toBe(ORG_B_ID);
    });

    it('create always stores JWT organization_id', async () => {
      const res = await request(app)
        .post('/api/v1/prospects')
        .set(authHeader(founderToken))
        .send({
          clinic_name: 'JWT Org Test',
          doctor_name: 'Dr. JWT',
          specialty: 'Dermatology',
          area: 'Bandra',
        });

      expect(res.status).toBe(201);
      expect(res.body.prospect.organization_id).toBe(DEV_ORG_ID);
    });

    it('missing required field (clinic_name) → 400', async () => {
      const res = await request(app)
        .post('/api/v1/prospects')
        .set(authHeader(founderToken))
        .send({
          doctor_name: 'Dr. Missing',
          specialty: 'Dermatology',
          area: 'Bandra',
        });

      expect400(res);
    });

    it('invalid request body (wrong types) → 400', async () => {
      const res = await request(app)
        .post('/api/v1/prospects')
        .set(authHeader(founderToken))
        .send({
          clinic_name: 'Bad Types',
          doctor_name: 'Dr. Bad',
          specialty: 'Dermatology',
          area: 'Bandra',
          google_rating: 'not-a-number',
          booking_available: 'yes',
        });

      expect400(res);
    });

    it('invalid website URL → 400', async () => {
      const res = await request(app)
        .post('/api/v1/prospects')
        .set(authHeader(founderToken))
        .send({
          clinic_name: 'URL Test',
          doctor_name: 'Dr. URL',
          specialty: 'Dermatology',
          area: 'Bandra',
          website: 'not-a-url',
        });

      expect400(res);
    });

    it('full create with all fields → 201', async () => {
      const res = await request(app)
        .post('/api/v1/prospects')
        .set(authHeader(founderToken))
        .send({
          clinic_name: 'Full Fields Clinic',
          doctor_name: 'Dr. Complete',
          specialty: 'Aesthetic Dermatology',
          area: 'Juhu',
          phone: '+91 88888 88888',
          website: 'https://full.example.com',
          google_rating: 4.5,
          review_count: 100,
          instagram_url: 'https://instagram.com/full',
          booking_available: true,
          whatsapp_available: true,
          visible_advertising: 'Instagram ads',
          content_quality: 'High',
          obvious_problem: 'Slow response',
          priority: 'High',
          source_urls: ['https://g.page/full'],
          notes: 'Some notes',
        });

      expect(res.status).toBe(201);
      expect(res.body.prospect.id).toBeDefined();
      expect(res.body.prospect.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.prospect.google_rating).toBe(4.5);
      expect(res.body.prospect.review_count).toBe(100);
      expect(res.body.prospect.booking_available).toBe(true);
      expect(res.body.prospect.content_quality).toBe('High');
      expect(res.body.prospect.priority).toBe('High');
      expect(res.body.prospect.source_urls).toEqual(['https://g.page/full']);
    });
  });

  describe('PATCH /api/v1/prospects/:id', () => {
    it('valid authenticated update → 200', async () => {
      const res = await request(app)
        .patch(`/api/v1/prospects/${DEV_PROSPECT_ID}`)
        .set(authHeader(founderToken))
        .send({
          clinic_name: 'Updated Clinic Name',
        });

      expect(res.status).toBe(200);
      expect(res.body.prospect.id).toBe(DEV_PROSPECT_ID);
      expect(res.body.prospect.clinic_name).toBe('Updated Clinic Name');
    });

    it('Org A cannot PATCH Org B prospect → 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/prospects/${PROSPECT_B_ID}`)
        .set(authHeader(founderToken))
        .send({
          clinic_name: 'Hacked By Org A',
        });

      expect404(res);
    });

    it('PATCH cannot change organization_id', async () => {
      const res = await request(app)
        .patch(`/api/v1/prospects/${DEV_PROSPECT_ID}`)
        .set(authHeader(founderToken))
        .send({
          organization_id: ORG_B_ID,
          clinic_name: 'Still Dev Org',
        });

      expect(res.status).toBe(200);
      expect(res.body.prospect.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.prospect.clinic_name).toBe('Still Dev Org');
    });

    it('update nonexistent prospect → 404', async () => {
      const res = await request(app)
        .patch('/api/v1/prospects/00000000-0000-0000-0000-000000000999')
        .set(authHeader(founderToken))
        .send({
          clinic_name: 'Ghost',
        });

      expect404(res);
    });

    it('invalid UUID → 400', async () => {
      const res = await request(app)
        .patch('/api/v1/prospects/not-a-uuid')
        .set(authHeader(founderToken))
        .send({
          clinic_name: 'Bad UUID',
        });

      expect400(res);
    });

    it('empty body (no fields to update) → 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/prospects/${DEV_PROSPECT_ID}`)
        .set(authHeader(founderToken))
        .send({});

      expect400(res);
    });

    it('partial update with nullable field set to null → 200', async () => {
      const res = await request(app)
        .patch(`/api/v1/prospects/${DEV_PROSPECT_ID}`)
        .set(authHeader(founderToken))
        .send({
          phone: null,
        });

      expect(res.status).toBe(200);
      expect(res.body.prospect.phone).toBeNull();
    });
  });
});
