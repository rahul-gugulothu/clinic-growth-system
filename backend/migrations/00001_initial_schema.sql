-- V3.0.3 Initial PostgreSQL Schema
-- Clinic Growth System MVP
--
-- Authoritative source: docs/V3_MVP_ARCHITECTURE.md Section 6
-- Decisions: docs/V3_MVP_DECISIONS.md
-- Status enums mirror: src/types/status.ts and src/types/entities.ts
--
-- All entities use UUID primary keys.
-- Every tenant-owned table includes organization_id for tenant-level isolation.
-- All tables include deleted_at (nullable) for soft deletes.
-- Core entity tables also include data_source ('real' | 'demo').
-- All timestamps are TIMESTAMPTZ (UTC).
--
-- Q1: clinics.prospect_id is NOT NULL (onboarding-only creation).

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE organization_status AS ENUM ('trial', 'active', 'suspended');
CREATE TYPE user_role AS ENUM ('org_admin', 'founder', 'clinic_owner', 'clinic_doctor', 'clinic_reception', 'clinic_coordinator');
CREATE TYPE outreach_stage AS ENUM ('Not contacted', 'Contacted', 'Responded', 'Follow-up due', 'Call', 'Proposal', 'Won', 'Lost');
CREATE TYPE proposal_status AS ENUM ('Draft', 'Sent', 'Accepted', 'Lost');
CREATE TYPE audit_opportunity AS ENUM ('Low', 'Medium', 'High');
CREATE TYPE priority_enum AS ENUM ('Low', 'Medium', 'High');
CREATE TYPE clinic_status AS ENUM ('Onboarding', 'Active', 'Paused', 'Churned');
CREATE TYPE lead_status AS ENUM ('New', 'Contacted', 'Qualified', 'Booked', 'Attended', 'Lost');
CREATE TYPE appointment_status AS ENUM ('Booked', 'Attended', 'NoShow', 'Cancelled');
CREATE TYPE followup_status AS ENUM ('Scheduled', 'Completed', 'Missed', 'Cancelled');
CREATE TYPE review_status AS ENUM ('Requested', 'Received', 'Declined');
CREATE TYPE doctor_role AS ENUM ('Owner', 'Consultant', 'Resident');
CREATE TYPE person_status AS ENUM ('Active', 'Inactive');
CREATE TYPE staff_role AS ENUM ('Reception', 'Coordinator', 'Manager');
CREATE TYPE message_sender AS ENUM ('clinic', 'lead', 'system');
CREATE TYPE conversation_status AS ENUM ('Open', 'Closed');
CREATE TYPE reminder_status AS ENUM ('Pending', 'Sent', 'Skipped');
CREATE TYPE followup_type AS ENUM ('Reminder', 'Recovery', 'Reschedule', 'Review Request');
CREATE TYPE channel_type AS ENUM ('Email', 'Phone', 'WhatsApp', 'InPerson');
CREATE TYPE review_source AS ENUM ('Google', 'Practo', 'Justdial', 'Other');
CREATE TYPE confidence_level AS ENUM ('Low', 'Medium', 'High');
CREATE TYPE referral_status AS ENUM ('New', 'Converted', 'Lost');
CREATE TYPE content_quality AS ENUM ('Low', 'Medium', 'High');
CREATE TYPE data_source AS ENUM ('real', 'demo');
CREATE TYPE integration_event_status AS ENUM ('pending', 'sent', 'failed', 'retry');

-- ============================================================================
-- TABLES (ordered by FK dependency)
-- ============================================================================

-- organizations: top-level tenant, no FK dependencies
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    status          organization_status NOT NULL DEFAULT 'trial',
    timezone        TEXT NOT NULL DEFAULT 'UTC',
    data_source     data_source NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_organizations_name ON organizations(name);

-- prospects: organization-level (no clinic_id — Q2 decision)
CREATE TABLE prospects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    clinic_name     TEXT NOT NULL,
    doctor_name     TEXT NOT NULL,
    specialty       TEXT NOT NULL,
    area            TEXT NOT NULL,
    phone           TEXT,
    website         TEXT,
    google_rating   NUMERIC(3,2),
    review_count    INTEGER,
    instagram_url   TEXT,
    booking_available BOOLEAN NOT NULL DEFAULT FALSE,
    whatsapp_available BOOLEAN NOT NULL DEFAULT FALSE,
    visible_advertising TEXT,
    content_quality content_quality,
    obvious_problem TEXT,
    priority        priority_enum,
    source_urls     TEXT[],
    notes           TEXT,
    data_source     data_source NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_prospects_organization_id ON prospects(organization_id);
CREATE INDEX idx_prospects_priority ON prospects(priority);

-- clinics: depends on organizations + prospects (Q1: prospect_id NOT NULL)
CREATE TABLE clinics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    prospect_id     UUID NOT NULL REFERENCES prospects(id),
    name            TEXT NOT NULL,
    specialty       TEXT NOT NULL,
    address         TEXT NOT NULL,
    city            TEXT NOT NULL,
    phone           TEXT NOT NULL,
    website         TEXT,
    whatsapp_number TEXT,
    working_hours   TEXT,
    status          clinic_status NOT NULL DEFAULT 'Onboarding',
    data_source     data_source NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_clinics_organization_id ON clinics(organization_id);
CREATE INDEX idx_clinics_prospect_id ON clinics(prospect_id);
CREATE UNIQUE INDEX uq_clinics_prospect_id ON clinics(prospect_id);

-- users: depends on organizations + clinics (clinic_id nullable — Q5: single clinic per user)
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL,
    role            user_role NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    clinic_id       UUID REFERENCES clinics(id),
    data_source     data_source NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_clinic_id ON users(clinic_id);
CREATE UNIQUE INDEX uq_users_org_email ON users(organization_id, email);

-- doctors: depends on organizations + clinics
CREATE TABLE doctors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    clinic_id       UUID NOT NULL REFERENCES clinics(id),
    name            TEXT NOT NULL,
    specialty       TEXT NOT NULL,
    role            doctor_role NOT NULL,
    status          person_status NOT NULL DEFAULT 'Active',
    data_source     data_source NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_doctors_organization_id ON doctors(organization_id);
CREATE INDEX idx_doctors_clinic_id ON doctors(clinic_id);

-- staff: depends on organizations + clinics
CREATE TABLE staff (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    clinic_id       UUID NOT NULL REFERENCES clinics(id),
    name            TEXT NOT NULL,
    role            staff_role NOT NULL,
    email           TEXT,
    phone           TEXT,
    status          person_status NOT NULL DEFAULT 'Active',
    data_source     data_source NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_staff_organization_id ON staff(organization_id);
CREATE INDEX idx_staff_clinic_id ON staff(clinic_id);

-- audits: depends on organizations + prospects + clinics
CREATE TABLE audits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    prospect_id     UUID REFERENCES prospects(id),
    clinic_id       UUID REFERENCES clinics(id),
    audit_date      TIMESTAMPTZ NOT NULL,
    discovery       TEXT NOT NULL,
    google_presence TEXT NOT NULL,
    website         TEXT NOT NULL,
    reviews         TEXT NOT NULL,
    enquiry_process TEXT NOT NULL,
    whatsapp        TEXT,
    booking         TEXT,
    follow_up       TEXT,
    content         TEXT,
    competitors     TEXT,
    identified_problems JSONB,
    recommendations JSONB,
    overall_opportunity audit_opportunity,
    data_source     data_source NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_audits_organization_id ON audits(organization_id);
CREATE INDEX idx_audits_prospect_id ON audits(prospect_id);
CREATE INDEX idx_audits_clinic_id ON audits(clinic_id);

-- outreach: depends on organizations + prospects
CREATE TABLE outreach (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    prospect_id     UUID NOT NULL REFERENCES prospects(id),
    channel         channel_type NOT NULL,
    contact_date    TIMESTAMPTZ NOT NULL,
    last_contact_at TIMESTAMPTZ NOT NULL,
    next_action     TEXT,
    next_action_at  TIMESTAMPTZ,
    owner           TEXT,
    response        TEXT,
    stage           outreach_stage NOT NULL,
    data_source     data_source NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_outreach_organization_id ON outreach(organization_id);
CREATE INDEX idx_outreach_prospect_id ON outreach(prospect_id);
CREATE INDEX idx_outreach_stage ON outreach(stage);

-- proposals: depends on organizations + prospects
CREATE TABLE proposals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    prospect_id     UUID NOT NULL REFERENCES prospects(id),
    problem         TEXT NOT NULL,
    proposed_service TEXT NOT NULL,
    expected_outcomes TEXT,
    price_inr       NUMERIC(12,2) NOT NULL,
    timeline        TEXT,
    status          proposal_status NOT NULL DEFAULT 'Draft',
    accepted_at     TIMESTAMPTZ,
    data_source     data_source NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_proposals_organization_id ON proposals(organization_id);
CREATE INDEX idx_proposals_prospect_id ON proposals(prospect_id);
CREATE INDEX idx_proposals_status ON proposals(status);

-- leads: depends on organizations + clinics + staff
CREATE TABLE leads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    clinic_id       UUID NOT NULL REFERENCES clinics(id),
    source          TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    service_interested TEXT,
    status          lead_status NOT NULL DEFAULT 'New',
    assigned_staff_id UUID REFERENCES staff(id),
    last_contact_at TIMESTAMPTZ,
    next_action     TEXT,
    data_source     data_source NOT NULL DEFAULT 'demo',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_leads_organization_id ON leads(organization_id);
CREATE INDEX idx_leads_clinic_id ON leads(clinic_id);
CREATE INDEX idx_leads_status ON leads(status);

-- conversations: depends on organizations + leads + staff
CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    lead_id         UUID NOT NULL REFERENCES leads(id),
    channel         channel_type NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,
    assigned_staff_id UUID REFERENCES staff(id),
    status          conversation_status NOT NULL DEFAULT 'Open',
    data_source     data_source NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_conversations_organization_id ON conversations(organization_id);
CREATE INDEX idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX idx_conversations_status ON conversations(status);

-- messages: depends on organizations + conversations
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    sender          message_sender NOT NULL,
    body            TEXT NOT NULL,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data_source     data_source NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_messages_organization_id ON messages(organization_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_sent_at ON messages(sent_at);

-- appointments: depends on organizations + leads + doctors
CREATE TABLE appointments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    lead_id         UUID NOT NULL REFERENCES leads(id),
    doctor_id       UUID NOT NULL REFERENCES doctors(id),
    scheduled_at    TIMESTAMPTZ NOT NULL,
    status          appointment_status NOT NULL DEFAULT 'Booked',
    reminder_status reminder_status NOT NULL DEFAULT 'Pending',
    attended_at     TIMESTAMPTZ,
    data_source     data_source NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_appointments_organization_id ON appointments(organization_id);
CREATE INDEX idx_appointments_lead_id ON appointments(lead_id);
CREATE INDEX idx_appointments_doctor_id ON appointments(doctor_id);
CREATE INDEX idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX idx_appointments_status ON appointments(status);

-- followups: depends on organizations + leads + appointments
CREATE TABLE followups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    lead_id         UUID REFERENCES leads(id),
    appointment_id  UUID REFERENCES appointments(id),
    type            followup_type NOT NULL,
    scheduled_at    TIMESTAMPTZ NOT NULL,
    channel         channel_type NOT NULL,
    status          followup_status NOT NULL DEFAULT 'Scheduled',
    outcome         TEXT,
    data_source     data_source NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_followups_organization_id ON followups(organization_id);
CREATE INDEX idx_followups_lead_id ON followups(lead_id);
CREATE INDEX idx_followups_scheduled_at ON followups(scheduled_at);

-- reviews: depends on organizations + clinics + appointments
CREATE TABLE reviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    clinic_id       UUID NOT NULL REFERENCES clinics(id),
    appointment_id  UUID REFERENCES appointments(id),
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          review_status NOT NULL DEFAULT 'Requested',
    rating          INTEGER CHECK (rating >= 1 AND rating <= 5),
    source          review_source NOT NULL DEFAULT 'Other',
    data_source     data_source NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_reviews_organization_id ON reviews(organization_id);
CREATE INDEX idx_reviews_clinic_id ON reviews(clinic_id);
CREATE INDEX idx_reviews_status ON reviews(status);
CREATE INDEX idx_reviews_rating ON reviews(rating);

-- business_outcomes: depends on organizations + clinics + appointments
CREATE TABLE business_outcomes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    clinic_id       UUID NOT NULL REFERENCES clinics(id),
    appointment_id  UUID REFERENCES appointments(id),
    amount_inr      NUMERIC(12,2) NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attribution_source TEXT,
    attribution_confidence confidence_level,
    data_source     data_source NOT NULL DEFAULT 'demo',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_business_outcomes_organization_id ON business_outcomes(organization_id);
CREATE INDEX idx_business_outcomes_clinic_id ON business_outcomes(clinic_id);
CREATE INDEX idx_business_outcomes_recorded_at ON business_outcomes(recorded_at);

-- referrals: depends on organizations + clinics + leads
CREATE TABLE referrals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    clinic_id       UUID NOT NULL REFERENCES clinics(id),
    referring_lead_id UUID REFERENCES leads(id),
    referred_lead_id UUID REFERENCES leads(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          referral_status NOT NULL DEFAULT 'New',
    outcome         TEXT,
    data_source     data_source NOT NULL DEFAULT 'demo',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_referrals_organization_id ON referrals(organization_id);
CREATE INDEX idx_referrals_clinic_id ON referrals(clinic_id);

-- ============================================================================
-- SUPPLEMENTARY TABLES (logging / audit / outbox — per architecture prose)
-- ============================================================================

-- audit_log: Section 12 — log all mutations
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    user_id         UUID REFERENCES users(id),
    action          TEXT NOT NULL,
    entity          TEXT NOT NULL,
    entity_id       UUID,
    old_values      JSONB,
    new_values      JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_log_organization_id ON audit_log(organization_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- ai_tool_executions: Section 6 — logs every AI tool run
CREATE TABLE ai_tool_executions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    user_id         UUID REFERENCES users(id),
    tool_id         TEXT NOT NULL,
    context         JSONB,
    result_id       UUID,
    duration_ms     INTEGER,
    success         BOOLEAN NOT NULL,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_tool_executions_organization_id ON ai_tool_executions(organization_id);
CREATE INDEX idx_ai_tool_executions_tool_id ON ai_tool_executions(tool_id);
CREATE INDEX idx_ai_tool_executions_created_at ON ai_tool_executions(created_at);

-- integration_events: Section 6 — queued integration actions (outbox)
CREATE TABLE integration_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    clinic_id       UUID REFERENCES clinics(id),
    provider        TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL,
    status          integration_event_status NOT NULL DEFAULT 'pending',
    retry_count     INTEGER NOT NULL DEFAULT 0,
    error_message   TEXT,
    next_retry_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at         TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_integration_events_organization_id ON integration_events(organization_id);
CREATE INDEX idx_integration_events_status ON integration_events(status);
CREATE INDEX idx_integration_events_next_retry_at ON integration_events(next_retry_at);

-- integration_configs: Section 13 — per-organization credentials (encrypted)
CREATE TABLE integration_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    provider        TEXT NOT NULL,
    config_key      TEXT NOT NULL,
    config_value_encrypted TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_integration_configs_organization_id ON integration_configs(organization_id);
CREATE UNIQUE INDEX uq_integration_configs_org_provider_key ON integration_configs(organization_id, provider, config_key);

-- Constraint: users.clinic_id must be non-NULL only for clinic-scoped roles (Q5)
ALTER TABLE users
    ADD CONSTRAINT chk_users_clinic_id_required
    CHECK (
        role IN ('org_admin', 'founder') OR
        (role IN ('clinic_owner', 'clinic_doctor', 'clinic_reception', 'clinic_coordinator') AND clinic_id IS NOT NULL)
    );

-- ============================================================================
-- TRIGGERS (updated_at auto-update)
-- These rely on PL/pgSQL, supported by real PostgreSQL but not pg-mem.
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_prospects_updated_at BEFORE UPDATE ON prospects FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_clinics_updated_at BEFORE UPDATE ON clinics FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_doctors_updated_at BEFORE UPDATE ON doctors FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_staff_updated_at BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_audits_updated_at BEFORE UPDATE ON audits FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_outreach_updated_at BEFORE UPDATE ON outreach FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_proposals_updated_at BEFORE UPDATE ON proposals FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_followups_updated_at BEFORE UPDATE ON followups FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_business_outcomes_updated_at BEFORE UPDATE ON business_outcomes FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_referrals_updated_at BEFORE UPDATE ON referrals FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_integration_configs_updated_at BEFORE UPDATE ON integration_configs FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_integration_events_updated_at BEFORE UPDATE ON integration_events FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
