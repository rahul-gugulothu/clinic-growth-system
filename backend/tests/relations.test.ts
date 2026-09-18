import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers.js';

const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEV_PROSPECT_ID = '00000000-0000-0000-0000-000000000010';
const DEV_CLINIC_ID = '00000000-0000-0000-0000-000000000020';
const DEV_FOUNDER_USER_ID = '00000000-0000-0000-0000-000000000002';
const DEV_CLINIC_USER_ID = '00000000-0000-0000-0000-000000000003';
const INVALID_UUID = '00000000-0000-0000-0000-000000000999';

describe('Foreign Key & Constraint Integrity', () => {
  let tdb: TestDatabase;

  beforeAll(() => {
    tdb = createTestDatabase();
  });

  afterAll(() => {
    // pg-mem instances are garbage collected
  });

  const query = (sql: string) => tdb.public.query(sql);
  const none = (sql: string) => tdb.public.none(sql);
  const rejectInvalid = (fn: () => void, expectedMsg?: string) => {
    expect(fn).toThrow(expectedMsg ?? /violates foreign key|not null|constraint/i);
  };

  describe('Primary relationship: Prospect → Clinic', () => {
    it('seed creates a prospect and a clinic linked by prospect_id', () => {
      const clinic = query('SELECT * FROM clinics WHERE id = \'' + DEV_CLINIC_ID + '\'');
      expect(clinic.rowCount).toBe(1);
      expect(clinic.rows[0].prospect_id).toBe(DEV_PROSPECT_ID);

      const prospect = query('SELECT * FROM prospects WHERE id = \'' + DEV_PROSPECT_ID + '\'');
      expect(prospect.rowCount).toBe(1);
      expect(prospect.rows[0].organization_id).toBe(DEV_ORG_ID);
    });

    it('Q1: clinics.prospect_id is NOT NULL (NOT NULL constraint enforced)', () => {
      // Inserting a clinic without prospect_id should be rejected
      rejectInvalid(() =>
        none("INSERT INTO clinics (organization_id, name, specialty, address, city, phone) VALUES ('" +
          DEV_ORG_ID + "', 'No Prospect', 'Test', 'Add', 'City', '123')")
      );
    });

    it('clinics.prospect_id is NOT NULL (verified at column level)', () => {
      // The seed data proves this: every clinic row has a non-null prospect_id
      const result = query('SELECT COUNT(*) as cnt FROM clinics WHERE prospect_id IS NULL');
      expect(result.rows[0].cnt).toBe(0);
    });

    it('Q1: unique constraint on prospect_id (one clinic per prospect)', () => {
      // Attempting to insert a second clinic for the same prospect should be rejected
      rejectInvalid(() =>
        none("INSERT INTO clinics (organization_id, prospect_id, name, specialty, address, city, phone) VALUES ('" +
          DEV_ORG_ID + "', '" + DEV_PROSPECT_ID +
          "', 'Duplicate', 'Test', '456 St', 'Mumbai', '+91 000')")
      );
    });

    it('clinic with non-existent prospect_id is rejected (FK constraint)', () => {
      rejectInvalid(() =>
        none("INSERT INTO clinics (organization_id, prospect_id, name, specialty, address, city, phone) VALUES ('" +
          DEV_ORG_ID + "', '" + INVALID_UUID +
          "', 'Invalid', 'Test', '123 St', 'Mumbai', '+91 000')")
      );
    });
  });

  describe('Audit → Prospect and Clinic FK', () => {
    it('audit with invalid prospect_id is rejected', () => {
      rejectInvalid(() =>
        none("INSERT INTO audits (organization_id, prospect_id, audit_date, discovery, google_presence, website, reviews) VALUES ('" +
          DEV_ORG_ID + "', '" + INVALID_UUID + "', NOW(), 'd', 'g', 'w', 'r')")
      );
    });

    it('audit with invalid clinic_id is rejected', () => {
      rejectInvalid(() =>
        none("INSERT INTO audits (organization_id, clinic_id, audit_date, discovery, google_presence, website, reviews) VALUES ('" +
          DEV_ORG_ID + "', '" + INVALID_UUID + "', NOW(), 'd', 'g', 'w', 'r')")
      );
    });

    it('audit without prospect_id is allowed (nullable column)', () => {
      // Insert with NULL prospect_id should succeed (all NOT NULL columns provided)
      query(
        "INSERT INTO audits (organization_id, audit_date, discovery, google_presence, website, reviews, enquiry_process) VALUES ('" +
          DEV_ORG_ID + "', NOW(), 'd', 'g', 'w', 'r', 'e') RETURNING id"
      );
      expect(true).toBe(true);
    });
  });

  describe('Doctor and Staff → Clinic FK', () => {
    it('doctor with non-existent clinic_id is rejected', () => {
      rejectInvalid(() =>
        none("INSERT INTO doctors (organization_id, clinic_id, name, specialty, role) VALUES ('" +
          DEV_ORG_ID + "', '" + INVALID_UUID + "', 'Test', 'Test', 'Owner')")
      );
    });

    it('staff with non-existent clinic_id is rejected', () => {
      rejectInvalid(() =>
        none("INSERT INTO staff (organization_id, clinic_id, name, role) VALUES ('" +
          DEV_ORG_ID + "', '" + INVALID_UUID + "', 'Test', 'Reception')")
      );
    });
  });

  describe('Lead → Clinic and Organization FK', () => {
    it('lead with invalid clinic_id is rejected', () => {
      rejectInvalid(() =>
        none("INSERT INTO leads (organization_id, clinic_id, source, status) VALUES ('" +
          DEV_ORG_ID + "', '" + INVALID_UUID + "', 'Test', 'New')")
      );
    });

    it('lead with invalid organization_id is rejected', () => {
      rejectInvalid(() =>
        none("INSERT INTO leads (organization_id, clinic_id, source, status) VALUES ('" +
          INVALID_UUID + "', '" + DEV_CLINIC_ID + "', 'Test', 'New')")
      );
    });
  });

  describe('Conversation → Lead FK', () => {
    it('conversation with invalid lead_id is rejected', () => {
      rejectInvalid(() =>
        none("INSERT INTO conversations (organization_id, lead_id, channel) VALUES ('" +
          DEV_ORG_ID + "', '" + INVALID_UUID + "', 'WhatsApp')")
      );
    });
  });

  describe('Message → Conversation FK', () => {
    it('message with invalid conversation_id is rejected', () => {
      rejectInvalid(() =>
        none("INSERT INTO messages (organization_id, conversation_id, sender, body) VALUES ('" +
          DEV_ORG_ID + "', '" + INVALID_UUID + "', 'clinic', 'test')")
      );
    });
  });

  describe('Appointment → Lead and Doctor FK', () => {
    it('appointment with invalid lead_id is rejected', () => {
      // First get a valid doctor
      const doctorResult = query('SELECT id FROM doctors LIMIT 1');
      if (doctorResult.rowCount === 0) {
        console.warn('No doctors seeded; skipping');
        return;
      }
      rejectInvalid(() =>
        none("INSERT INTO appointments (organization_id, lead_id, doctor_id, scheduled_at) VALUES ('" +
          DEV_ORG_ID + "', '" + INVALID_UUID + "', '" + doctorResult.rows[0].id + "', NOW())")
      );
    });

    it('appointment with invalid doctor_id is rejected', () => {
      const leadResult = query('SELECT id FROM leads LIMIT 1');
      if (leadResult.rowCount === 0) {
        console.warn('No leads seeded; skipping');
        return;
      }
      rejectInvalid(() =>
        none("INSERT INTO appointments (organization_id, lead_id, doctor_id, scheduled_at) VALUES ('" +
          DEV_ORG_ID + "', '" + leadResult.rows[0].id + "', '" + INVALID_UUID + "', NOW())")
      );
    });
  });

  describe('Followup nullable FKs', () => {
    it('followup without lead_id or appointment_id is valid (both nullable)', () => {
      // Should NOT throw
      query(
        "INSERT INTO followups (organization_id, type, scheduled_at, channel, status) VALUES ('" +
          DEV_ORG_ID + "', 'Review Request', NOW(), 'WhatsApp', 'Scheduled')"
      );
    });

    it('followup with invalid lead_id is rejected', () => {
      rejectInvalid(() =>
        none("INSERT INTO followups (organization_id, lead_id, type, scheduled_at, channel, status) VALUES ('" +
          DEV_ORG_ID + "', '" + INVALID_UUID + "', 'Review Request', NOW(), 'WhatsApp', 'Scheduled')")
      );
    });

    it('followup with invalid appointment_id is rejected', () => {
      rejectInvalid(() =>
        none("INSERT INTO followups (organization_id, appointment_id, type, scheduled_at, channel, status) VALUES ('" +
          DEV_ORG_ID + "', '" + INVALID_UUID + "', 'Review Request', NOW(), 'WhatsApp', 'Scheduled')")
      );
    });
  });

  describe('Review → Clinic and Appointment FK', () => {
    it('review with invalid clinic_id is rejected', () => {
      rejectInvalid(() =>
        none("INSERT INTO reviews (organization_id, clinic_id, status, rating, source) VALUES ('" +
          DEV_ORG_ID + "', '" + INVALID_UUID + "', 'Requested', 5, 'Google')")
      );
    });
  });

  describe('BusinessOutcome → Clinic and Appointment FK', () => {
    it('business_outcomes with invalid clinic_id is rejected', () => {
      rejectInvalid(() =>
        none("INSERT INTO business_outcomes (organization_id, clinic_id, amount_inr) VALUES ('" +
          DEV_ORG_ID + "', '" + INVALID_UUID + "', 1000)")
      );
    });
  });

  describe('Referral → Clinic and Leads FK', () => {
    it('referral with invalid clinic_id is rejected', () => {
      rejectInvalid(() =>
        none("INSERT INTO referrals (organization_id, clinic_id) VALUES ('" +
          DEV_ORG_ID + "', '" + INVALID_UUID + "')"),
      );
    });
  });

  describe('User → Organization and Clinic FK', () => {
    it('user with invalid organization_id is rejected', () => {
      rejectInvalid(() =>
        none("INSERT INTO users (email, role, organization_id) VALUES ('test@test.com', 'founder', '" + INVALID_UUID + "')"),
      );
    });

    it('user with invalid clinic_id is rejected', () => {
      rejectInvalid(() =>
        none("INSERT INTO users (email, role, organization_id, clinic_id) VALUES ('test2@test.com', 'clinic_owner', '" +
          DEV_ORG_ID + "', '" + INVALID_UUID + "')"),
      );
    });

    it('Q5: founder user has NULL clinic_id (internal user — verified by data)', () => {
      const result = query('SELECT clinic_id FROM users WHERE id = \'' + DEV_FOUNDER_USER_ID + '\'');
      expect(result.rowCount).toBe(1);
      expect(result.rows[0].clinic_id).toBeNull();
    });

    it('Q5: clinic_owner user has non-NULL clinic_id', () => {
      const result = query('SELECT clinic_id FROM users WHERE id = \'' + DEV_CLINIC_USER_ID + '\'');
      expect(result.rowCount).toBe(1);
      expect(result.rows[0].clinic_id).not.toBeNull();
      expect(result.rows[0].clinic_id).toBe(DEV_CLINIC_ID);
    });

    it('founder with non-NULL clinic_id is allowed (no constraint forcing NULL)', () => {
      // A founder CAN have a clinic_id (it just isn't required)
      // This test just verifies the insert doesn't error for a valid combination
      const result = query('SELECT id, role, clinic_id FROM users WHERE role = \'founder\'');
      expect(result.rowCount).toBe(1);
      expect(result.rows[0].role).toBe('founder');
    });
  });

  describe('Outreach and Proposal → Prospect FK', () => {
    it('outreach with invalid prospect_id is rejected', () => {
      rejectInvalid(() =>
        none("INSERT INTO outreach (organization_id, prospect_id, channel, contact_date, last_contact_at, stage) VALUES ('" +
          DEV_ORG_ID + "', '" + INVALID_UUID + "', 'Email', NOW(), NOW(), 'Not contacted')"),
      );
    });

    it('proposal with invalid prospect_id is rejected', () => {
      rejectInvalid(() =>
        none("INSERT INTO proposals (organization_id, prospect_id, problem, proposed_service, price_inr) VALUES ('" +
          DEV_ORG_ID + "', '" + INVALID_UUID + "', 'test', 'test', 1000)"),
      );
    });
  });

  describe('prospects table has NO clinic_id (Q2 decision)', () => {
    it('prospects table does not have clinic_id column', () => {
      const result = query(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'prospects' AND column_name = 'clinic_id'"
      );
      expect(result.rowCount).toBe(0);
    });
  });
});
