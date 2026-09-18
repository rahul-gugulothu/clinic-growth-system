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

const REVIEW_A_ID = '00000000-0000-0000-0000-000000000080';
const REVIEW_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee80';
const OUTCOME_A_ID = '00000000-0000-0000-0000-000000000090';
const OUTCOME_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee90';
const REFERRAL_A_ID = '00000000-0000-0000-0000-000000000010';
const REFERRAL_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee10';

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
    INSERT INTO reviews (id, organization_id, clinic_id, appointment_id, requested_at, status, rating, source, data_source, created_at, updated_at)
    VALUES
      ('${REVIEW_A_ID}', '${DEV_ORG_ID}', '${DEV_CLINIC_ID}', '${APPT_A_ID}', '2025-01-15T11:00:00Z', 'Requested', 5, 'Google', 'demo', NOW(), NOW()),
      ('${REVIEW_B_ID}', '${ORG_B_ID}', '${CLINIC_B_ID}', '${APPT_B_ID}', '2025-01-16T11:00:00Z', 'Received', 4, 'Practo', 'demo', NOW(), NOW())
  `);
  await tdb.public.none(`
    INSERT INTO business_outcomes (id, organization_id, clinic_id, appointment_id, amount_inr, recorded_at, attribution_source, attribution_confidence, data_source, created_at, updated_at)
    VALUES
      ('${OUTCOME_A_ID}', '${DEV_ORG_ID}', '${DEV_CLINIC_ID}', '${APPT_A_ID}', 5000.00, '2025-01-15T12:00:00Z', 'Google Reviews', 'High', 'demo', NOW(), NOW()),
      ('${OUTCOME_B_ID}', '${ORG_B_ID}', '${CLINIC_B_ID}', '${APPT_B_ID}', 3000.00, '2025-01-16T12:00:00Z', 'Direct', 'Medium', 'demo', NOW(), NOW())
  `);
  await tdb.public.none(`
    INSERT INTO referrals (id, organization_id, clinic_id, referring_lead_id, referred_lead_id, created_at, status, outcome, data_source, updated_at)
    VALUES
      ('${REFERRAL_A_ID}', '${DEV_ORG_ID}', '${DEV_CLINIC_ID}', '${LEAD_A_ID}', '${LEAD_B_ID}', NOW(), 'New', 'Referral from clinic A', 'demo', NOW()),
      ('${REFERRAL_B_ID}', '${ORG_B_ID}', '${CLINIC_B_ID}', '${LEAD_B_ID}', '${LEAD_A_ID}', NOW(), 'New', 'Referral from clinic B', 'demo', NOW())
  `);
};

// ====================================================================
// REVIEWS
// ====================================================================

describe('V3.0.9 Reviews API', () => {
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

  describe('GET /api/v1/reviews', () => {
    it('list own clinic reviews -> 200', async () => {
      const res = await request(app)
        .get('/api/v1/reviews')
        .set(authHeader(clinicOwnerToken));

      expect(res.status).toBe(200);
      expect(res.body.reviews.length).toBe(1);
      expect(res.body.reviews[0].id).toBe(REVIEW_A_ID);
      expect(res.body.reviews[0].status).toBe('Requested');
    });

    it('founder can list multiple clinics -> 200', async () => {
      const res = await request(app)
        .get('/api/v1/reviews')
        .set(authHeader(founderToken));

      expect(res.status).toBe(200);
      expect(res.body.reviews.length).toBe(1);
    });

    it('missing auth -> 401', async () => {
      const res = await request(app)
        .get('/api/v1/reviews');

      expect401(res);
    });
  });

  describe('GET /api/v1/reviews/:id', () => {
    it('get own review -> 200', async () => {
      const res = await request(app)
        .get(`/api/v1/reviews/${REVIEW_A_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect(res.status).toBe(200);
      expect(res.body.review.id).toBe(REVIEW_A_ID);
    });

    it('cross-clinic review -> 404', async () => {
      const res = await request(app)
        .get(`/api/v1/reviews/${REVIEW_B_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect404(res);
    });

    it('cross-org review -> 404', async () => {
      const res = await request(app)
        .get(`/api/v1/reviews/${REVIEW_B_ID}`)
        .set(authHeader(founderToken));

      expect404(res);
    });

    it('missing auth -> 401', async () => {
      const res = await request(app)
        .get(`/api/v1/reviews/${REVIEW_A_ID}`);

      expect401(res);
    });
  });

  describe('POST /api/v1/reviews', () => {
    it('create valid review -> 201', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set(authHeader(clinicOwnerToken))
        .send({
          appointment_id: APPT_A_ID,
          rating: 4,
          source: 'Google',
        });

      expect(res.status).toBe(201);
      expect(res.body.review.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.review.clinic_id).toBe(DEV_CLINIC_ID);
      expect(res.body.review.rating).toBe(4);
      expect(res.body.review.status).toBe('Requested');
    });

    it('invalid appointment_id -> 404', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set(authHeader(clinicOwnerToken))
        .send({
          appointment_id: '00000000-0000-0000-0000-000000000099',
          rating: 5,
        });

      expect404(res);
    });

    it('appointment from another clinic -> 404', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set(authHeader(clinicOwnerToken))
        .send({
          appointment_id: APPT_B_ID,
          rating: 5,
        });

      expect404(res);
    });

    it('appointment from another org -> 404', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set(authHeader(founderToken))
        .send({
          appointment_id: APPT_B_ID,
          rating: 5,
          clinic_id: CLINIC_B_ID,
        });

      expect404(res);
    });

    it('missing auth -> 401', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .send({ rating: 5 });

      expect401(res);
    });

    it('invalid rating (0) -> 400', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set(authHeader(clinicOwnerToken))
        .send({ rating: 0 });

      expect400(res);
    });

    it('invalid rating (6) -> 400', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set(authHeader(clinicOwnerToken))
        .send({ rating: 6 });

      expect400(res);
    });

    it('client clinic_id cannot override JWT -> 201', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set(authHeader(clinicOwnerToken))
        .send({
          appointment_id: APPT_A_ID,
          rating: 5,
          source: 'Google',
          clinic_id: CLINIC_B_ID,
        });

      expect(res.status).toBe(201);
      expect(res.body.review.clinic_id).toBe(DEV_CLINIC_ID);
    });
  });

  describe('PATCH /api/v1/reviews/:id', () => {
    beforeEach(async () => {
      await tdb.public.none(`UPDATE reviews SET status = 'Requested' WHERE id = '${REVIEW_A_ID}'`);
    });

    it('valid status transition Requested -> Received -> 200', async () => {
      const res = await request(app)
        .patch(`/api/v1/reviews/${REVIEW_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Received' });

      expect(res.status).toBe(200);
      expect(res.body.review.status).toBe('Received');
    });

    it('invalid status transition -> 400', async () => {
      const _res = await request(app)
        .patch(`/api/v1/reviews/${REVIEW_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Received' });

      // First request succeeds. Now Received -> Requested is invalid.
      const res2 = await request(app)
        .patch(`/api/v1/reviews/${REVIEW_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Requested' });

      expect400(res2);
    });

    it('same-status invalid transition -> 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/reviews/${REVIEW_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Requested' });

      expect400(res);
    });

    it('cross-clinic update -> 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/reviews/${REVIEW_B_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Received' });

      expect404(res);
    });

    it('cross-org update -> 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/reviews/${REVIEW_B_ID}`)
        .set(authHeader(founderToken))
        .send({ status: 'Received' });

      expect404(res);
    });

    it('client clinic_id cannot override JWT -> 200', async () => {
      const res = await request(app)
        .patch(`/api/v1/reviews/${REVIEW_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Received', clinic_id: CLINIC_B_ID });

      expect(res.status).toBe(200);
      expect(res.body.review.status).toBe('Received');
    });

    it('PATCH empty body -> 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/reviews/${REVIEW_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({});

      expect400(res);
    });
  });
});

// ====================================================================
// BUSINESS OUTCOMES
// ====================================================================

describe('V3.0.9 Business Outcomes API', () => {
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

  describe('GET /api/v1/business-outcomes', () => {
    it('list own clinic outcomes -> 200', async () => {
      const res = await request(app)
        .get('/api/v1/business-outcomes')
        .set(authHeader(clinicOwnerToken));

      expect(res.status).toBe(200);
      expect(res.body.business_outcomes.length).toBe(1);
      expect(res.body.business_outcomes[0].id).toBe(OUTCOME_A_ID);
    });

    it('missing auth -> 401', async () => {
      const res = await request(app)
        .get('/api/v1/business-outcomes');

      expect401(res);
    });
  });

  describe('GET /api/v1/business-outcomes/:id', () => {
    it('get own outcome -> 200', async () => {
      const res = await request(app)
        .get(`/api/v1/business-outcomes/${OUTCOME_A_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect(res.status).toBe(200);
      expect(res.body.business_outcome.id).toBe(OUTCOME_A_ID);
    });

    it('cross-clinic outcome -> 404', async () => {
      const res = await request(app)
        .get(`/api/v1/business-outcomes/${OUTCOME_B_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect404(res);
    });

    it('cross-org outcome -> 404', async () => {
      const res = await request(app)
        .get(`/api/v1/business-outcomes/${OUTCOME_B_ID}`)
        .set(authHeader(founderToken));

      expect404(res);
    });

    it('missing auth -> 401', async () => {
      const res = await request(app)
        .get(`/api/v1/business-outcomes/${OUTCOME_A_ID}`);

      expect401(res);
    });
  });

  describe('POST /api/v1/business-outcomes', () => {
    it('create valid outcome -> 201', async () => {
      const res = await request(app)
        .post('/api/v1/business-outcomes')
        .set(authHeader(clinicOwnerToken))
        .send({
          appointment_id: APPT_A_ID,
          amount_inr: 7500,
          attribution_source: 'Google Reviews',
          attribution_confidence: 'High',
        });

      expect(res.status).toBe(201);
      expect(res.body.business_outcome.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.business_outcome.clinic_id).toBe(DEV_CLINIC_ID);
      expect(res.body.business_outcome.amount_inr).toBe('7500');
    });

    it('missing amount_inr -> 400', async () => {
      const res = await request(app)
        .post('/api/v1/business-outcomes')
        .set(authHeader(clinicOwnerToken))
        .send({
          appointment_id: APPT_A_ID,
        });

      expect400(res);
    });

    it('negative amount -> 400', async () => {
      const res = await request(app)
        .post('/api/v1/business-outcomes')
        .set(authHeader(clinicOwnerToken))
        .send({ amount_inr: -100 });

      expect400(res);
    });

    it('invalid appointment_id -> 404', async () => {
      const res = await request(app)
        .post('/api/v1/business-outcomes')
        .set(authHeader(clinicOwnerToken))
        .send({
          appointment_id: '00000000-0000-0000-0000-000000000099',
          amount_inr: 5000,
        });

      expect404(res);
    });

    it('appointment from another clinic -> 404', async () => {
      const res = await request(app)
        .post('/api/v1/business-outcomes')
        .set(authHeader(clinicOwnerToken))
        .send({
          appointment_id: APPT_B_ID,
          amount_inr: 5000,
        });

      expect404(res);
    });

    it('invalid attribution confidence -> 400', async () => {
      const res = await request(app)
        .post('/api/v1/business-outcomes')
        .set(authHeader(clinicOwnerToken))
        .send({ amount_inr: 5000, attribution_confidence: 'Very High' });

      expect400(res);
    });

    it('missing auth -> 401', async () => {
      const res = await request(app)
        .post('/api/v1/business-outcomes')
        .send({ amount_inr: 5000 });

      expect401(res);
    });

    it('client clinic_id cannot override JWT -> 201', async () => {
      const res = await request(app)
        .post('/api/v1/business-outcomes')
        .set(authHeader(clinicOwnerToken))
        .send({
          amount_inr: 5000,
          clinic_id: CLINIC_B_ID,
        });

      expect(res.status).toBe(201);
      expect(res.body.business_outcome.clinic_id).toBe(DEV_CLINIC_ID);
    });
  });

  describe('PATCH /api/v1/business-outcomes/:id', () => {
    it('update own outcome -> 200', async () => {
      const res = await request(app)
        .patch(`/api/v1/business-outcomes/${OUTCOME_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ amount_inr: 6000 });

      expect(res.status).toBe(200);
      expect(res.body.business_outcome.amount_inr).toBe('6000');
    });

    it('cross-clinic update -> 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/business-outcomes/${OUTCOME_B_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ amount_inr: 9999 });

      expect404(res);
    });

    it('cross-org update -> 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/business-outcomes/${OUTCOME_B_ID}`)
        .set(authHeader(founderToken))
        .send({ amount_inr: 9999 });

      expect404(res);
    });

    it('PATCH empty body -> 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/business-outcomes/${OUTCOME_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({});

      expect400(res);
    });
  });
});

// ====================================================================
// REFERRALS
// ====================================================================

describe('V3.0.9 Referrals API', () => {
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

  describe('GET /api/v1/referrals', () => {
    it('list own clinic referrals -> 200', async () => {
      const res = await request(app)
        .get('/api/v1/referrals')
        .set(authHeader(clinicOwnerToken));

      expect(res.status).toBe(200);
      expect(res.body.referrals.length).toBe(1);
      expect(res.body.referrals[0].id).toBe(REFERRAL_A_ID);
    });

    it('missing auth -> 401', async () => {
      const res = await request(app)
        .get('/api/v1/referrals');

      expect401(res);
    });
  });

  describe('GET /api/v1/referrals/:id', () => {
    it('get own referral -> 200', async () => {
      const res = await request(app)
        .get(`/api/v1/referrals/${REFERRAL_A_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect(res.status).toBe(200);
      expect(res.body.referral.id).toBe(REFERRAL_A_ID);
    });

    it('cross-clinic referral -> 404', async () => {
      const res = await request(app)
        .get(`/api/v1/referrals/${REFERRAL_B_ID}`)
        .set(authHeader(clinicOwnerToken));

      expect404(res);
    });

    it('cross-org referral -> 404', async () => {
      const res = await request(app)
        .get(`/api/v1/referrals/${REFERRAL_B_ID}`)
        .set(authHeader(founderToken));

      expect404(res);
    });

    it('missing auth -> 401', async () => {
      const res = await request(app)
        .get(`/api/v1/referrals/${REFERRAL_A_ID}`);

      expect401(res);
    });
  });

  describe('POST /api/v1/referrals', () => {
    it('create valid referral -> 201', async () => {
      const res = await request(app)
        .post('/api/v1/referrals')
        .set(authHeader(clinicOwnerToken))
        .send({
          referred_lead_id: LEAD_A_ID,
          outcome: 'New patient inquiry',
        });

      expect(res.status).toBe(201);
      expect(res.body.referral.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.referral.clinic_id).toBe(DEV_CLINIC_ID);
      expect(res.body.referral.status).toBe('New');
    });

    it('invalid referred_lead_id -> 404', async () => {
      const res = await request(app)
        .post('/api/v1/referrals')
        .set(authHeader(clinicOwnerToken))
        .send({
          referred_lead_id: '00000000-0000-0000-0000-000000000099',
        });

      expect404(res);
    });

    it('referred lead from another clinic -> 404', async () => {
      const res = await request(app)
        .post('/api/v1/referrals')
        .set(authHeader(clinicOwnerToken))
        .send({
          referred_lead_id: LEAD_B_ID,
        });

      expect404(res);
    });

    it('referred lead from another org -> 404', async () => {
      const res = await request(app)
        .post('/api/v1/referrals')
        .set(authHeader(founderToken))
        .send({
          referred_lead_id: LEAD_B_ID,
        });

      expect404(res);
    });

    it('missing auth -> 401', async () => {
      const res = await request(app)
        .post('/api/v1/referrals')
        .send({});

      expect401(res);
    });

    it('client clinic_id cannot override JWT -> 201', async () => {
      const res = await request(app)
        .post('/api/v1/referrals')
        .set(authHeader(clinicOwnerToken))
        .send({
          referred_lead_id: LEAD_A_ID,
          clinic_id: CLINIC_B_ID,
        });

      expect(res.status).toBe(201);
      expect(res.body.referral.clinic_id).toBe(DEV_CLINIC_ID);
    });
  });

  describe('PATCH /api/v1/referrals/:id', () => {
    beforeEach(async () => {
      await tdb.public.none(`UPDATE referrals SET status = 'New' WHERE id = '${REFERRAL_A_ID}'`);
    });

    it('valid status transition New -> Converted -> 200', async () => {
      const res = await request(app)
        .patch(`/api/v1/referrals/${REFERRAL_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Converted' });

      expect(res.status).toBe(200);
      expect(res.body.referral.status).toBe('Converted');
    });

    it('invalid status transition -> 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/referrals/${REFERRAL_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Converted' });

      expect(res.status).toBe(200);

      const res2 = await request(app)
        .patch(`/api/v1/referrals/${REFERRAL_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'New' });

      expect400(res2);
    });

    it('same-status invalid transition -> 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/referrals/${REFERRAL_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'New' });

      expect400(res);
    });

    it('cross-clinic update -> 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/referrals/${REFERRAL_B_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Converted' });

      expect404(res);
    });

    it('cross-org update -> 404', async () => {
      const res = await request(app)
        .patch(`/api/v1/referrals/${REFERRAL_B_ID}`)
        .set(authHeader(founderToken))
        .send({ status: 'Converted' });

      expect404(res);
    });

    it('client clinic_id cannot override JWT -> 200', async () => {
      const res = await request(app)
        .patch(`/api/v1/referrals/${REFERRAL_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({ status: 'Converted', clinic_id: CLINIC_B_ID });

      expect(res.status).toBe(200);
      expect(res.body.referral.status).toBe('Converted');
    });

    it('PATCH empty body -> 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/referrals/${REFERRAL_A_ID}`)
        .set(authHeader(clinicOwnerToken))
        .send({});

      expect400(res);
    });
  });
});
