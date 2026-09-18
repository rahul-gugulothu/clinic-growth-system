-- V3.0.3 Development Seed Data
--
-- This migration inserts minimal development-only data.
-- All inserted rows are explicitly marked data_source = 'demo'.
-- This is NOT a copy of the frontend prototype dataset.
-- Sufficient only to verify: organization, user, prospect, clinic, doctor, staff.

-- 1. Organization
INSERT INTO organizations (id, name, status, timezone, data_source, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Demo Dermatology Group', 'trial', 'Asia/Kolkata', 'demo', NOW(), NOW());

-- 2. Prospect (organization-level, no clinic_id — Q2 decision)
INSERT INTO prospects (id, organization_id, clinic_name, doctor_name, specialty, area, phone, website,
                       google_rating, review_count, instagram_url, booking_available, whatsapp_available,
                       visible_advertising, content_quality, obvious_problem, priority, source_urls, notes,
                       data_source, created_at, updated_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'Kaya Skin Clinic',
    'Dr. Anaya Kaya',
    'Aesthetic Dermatology',
    'Bandra West',
    '+91 98200 11111',
    'https://drkaya.example.com',
    4.6,
    312,
    'https://instagram.com/drkaya',
    TRUE,
    TRUE,
    'Instagram ads, Google local',
    'High',
    'No WhatsApp auto-confirm; review velocity slowing.',
    'High',
    ARRAY['https://g.page/drkaya'],
    'Verified facts: booking form on website, GBP active, 312 reviews. Observation: enquiry response time unknown — requires mystery shop.',
    'demo',
    NOW(),
    NOW()
  );

-- 3. Clinic (converted from prospect — Q1: prospect_id NOT NULL)
INSERT INTO clinics (id, organization_id, prospect_id, name, specialty, address, city, phone, website,
                     whatsapp_number, working_hours, status, data_source, created_at, updated_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000010',
    'Kaya Skin Clinic',
    'Aesthetic Dermatology',
    '12 Linking Road, Bandra West',
    'Mumbai',
    '+91 98200 11111',
    'https://drkaya.example.com',
    '+91 98200 11111',
    'Mon-Sat, 10:00-19:00',
    'Active',
    'demo',
    NOW(),
    NOW()
  );

-- 4. Users — inserted AFTER clinic exists so clinic-scoped roles have valid clinic_id (Q5)
--    Founder (internal, clinic_id = NULL)
INSERT INTO users (id, email, role, organization_id, clinic_id, data_source, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000002', 'founder@cliniciogrowth.local', 'founder',
   '00000000-0000-0000-0000-000000000001', NULL, 'demo', NOW(), NOW());

--    Clinic owner (scoped to one clinic — Q5)
INSERT INTO users (id, email, role, organization_id, clinic_id, data_source, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000003', 'owner@drkaya.demo.local', 'clinic_owner',
   '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'demo', NOW(), NOW());

--    Clinic staff (reception — scoped to one clinic — Q5)
INSERT INTO users (id, email, role, organization_id, clinic_id, data_source, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000004', 'reception@drkaya.demo.local', 'clinic_reception',
   '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'demo', NOW(), NOW());

-- 5. Doctors (clinic-scoped)
INSERT INTO doctors (id, organization_id, clinic_id, name, specialty, role, status, data_source, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020',
   'Dr. Anaya Kaya', 'Aesthetic Dermatology', 'Owner', 'Active', 'demo', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020',
   'Dr. Rohan Mehta', 'Dermatology', 'Consultant', 'Active', 'demo', NOW(), NOW());

-- 6. Staff (clinic-scoped)
INSERT INTO staff (id, organization_id, clinic_id, name, role, email, phone, status, data_source, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020',
   'Priya S.', 'Reception', 'priya@drkaya.demo.local', '+91 98000 11111', 'Active', 'demo', NOW(), NOW());
