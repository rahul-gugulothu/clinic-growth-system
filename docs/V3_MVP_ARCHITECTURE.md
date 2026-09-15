# V3.0 MVP Architecture Specification

**Status:** DRAFT  
**Date:** 2026-09-14  
**Phase:** Post-prototype freeze — Architecture definition (no implementation)

---

## 1. Executive Summary

The Clinic Growth System prototype is a single-page React application with local Zustand state, 11 deterministic AI tools, and synthetic demo data covering the full clinic-acquisition-to-outcome lifecycle.

The MVP will transition from a local-state prototype to a multi-tenant SaaS with a backend API, PostgreSQL database, role-based authentication, and an AI service layer — while preserving the exact workflows, terminology, and data relationships proven in the prototype.

**Core hypothesis under test:** Clinics can improve patient enquiries, appointment fill-rate, and retention through a unified system that guides acquisition (prospect → audit → outreach → proposal → win → onboard) and patient operations (lead → conversation → appointment → outcome → follow-up → review).

---

## 2. Current Prototype Architecture

### Frontend

| Layer | Technology | Notes |
|---|---|---|
| Framework | React 18 + Vite 5 | SPA, client-side routing |
| Language | TypeScript | `@ts-nocheck` present in `store/index.ts` |
| State | Zustand (persisted to `localStorage`) | `@/store/index.ts` contains all entities and actions |
| Routing | React Router v6 | Nested routes under `/internal/*` and `/clinic/*` |
| UI | Tailwind CSS + shadcn/ui components | Dialog, Input, Button, Badge, Select, Table, Card |
| Icons | lucide-react | Consistent icon set |
| Notifications | sonner (toast) | Non-blocking user feedback |

### Workspaces & Access

| Workspace | Entry Point | Key Constraint |
|---|---|---|
| Internal | `/login` → `/select-workspace` → `/internal/*` | `RequireAuth` wrapper |
| Clinic | `/login` → `/select-workspace` → `/clinic/*` | `RequireAuth` + `RequireClinicWorkspace` wrappers |

`session.currentWorkspace` determines layout. `session.activeClinicId` (clinic workspace only) scopes data.

### Data Model (Prototype — In-Memory / localStorage)

All entities are stored as `Record<ID, Entity>` in a single Zustand store. No foreign-key enforcement at runtime; integrity is maintained by conventions and seed data correctness.

**Entities:**
- Prospect, ClinicAudit, OutreachRecord, Proposal, Clinic, Doctor, Staff
- Lead, Conversation, Message, Appointment, Followup, Review, BusinessOutcome, Referral

**Key Relationships:**
- `Clinic.prospect_id` → `Prospect` (1:1 optional, one clinic per converted prospect)
- `ClinicAudit.prospect_id` / `ClinicAudit.clinic_id` → Prospect/Clinic (one audit per prospect)
- `OutreachRecord.prospect_id` → Prospect
- `Proposal.prospect_id` → Prospect
- `Lead.clinic_id` → Clinic
- `Conversation.lead_id` → Lead
- `Message.conversation_id` → Conversation
- `Appointment.lead_id`, `.doctor_id` → Lead, Doctor
- `Followup.lead_id`, `.appointment_id` → Lead, Appointment (both nullable)
- `Review.clinic_id`, `.appointment_id` → Clinic, Appointment (nullable)
- `BusinessOutcome.clinic_id`, `.appointment_id` → Clinic, Appointment (nullable)
- `Referral.clinic_id`, `.referring_lead_id`, `.referred_lead_id` → Clinic, Lead, Lead

### Workflows (Prototype)

| Workflow | Status | Data Source |
|---|---|---|
| Internal: Prospect → Audit → Outreach → Proposal → Won → Clinic | Implemented | Zustand store |
| Clinic: Lead → Conversation → Appointment → Outcome → Follow-up → Review | Implemented | Zustand store |
| Founder AI: 11 deterministic tools | Implemented | Read-only from store |
| Search (Cmd/Ctrl + K) | Implemented | In-memory filtering |
| Activity Center (bell icon) | Implemented | Read-only derived items |

### AI Tools (Prototype — All Local)

| ID | Name | Required Context | Mutation | Human Review |
|---|---|---|---|---|
| `priority-clinics` | Priority Clinics | None | No | No |
| `prospect-summary` | Prospect Summary | prospectId | No | No |
| `draft-whatsapp` | Draft WhatsApp | prospectId | No | **Yes** |
| `draft-email` | Draft Email | prospectId | No | **Yes** |
| `call-preparation` | Call Preparation | prospectId | No | No |
| `generate-proposal` | Generate Proposal | prospectId | No | **Yes** |
| `pipeline-diagnosis` | Pipeline Diagnosis | None | No | No |
| `work-planner` | Today's Work Planner | None | No | No |
| `weekly-report` | Weekly Founder Report | None | No | No |
| `growth-opportunities` | Growth Opportunities | None | No | No |
| `audit-summary` | Audit Summary | auditId | No | No |

### Access Assumptions (Prototype)

- Single user: `demo@clinicgrowth.local` with role `founder`.
- No real authentication — login page sets `session.email` and `session.currentRole`.
- Single organization — no `Organization` entity exists.
- Single clinic context — `activeClinicId` defaults to first clinic.
- All data is synthetic — `SyntheticDataBanner` displayed on major pages.

### Technical Debt (Prototype)

| Item | Severity |
|---|---|
| Single 638 kB JS bundle — no code splitting | Low |
| No AI session persistence (context resets on reload) | Low |
| Substring-based prospect name resolution in AI | Low |
| ContextSidebar renders redundant outer container | Low |
| `@ts-nocheck` on the global store file | Medium |
| Git repo root misalignment (`C:\Users\Rahul` is repo root; project files untracked) | Medium |
| Hardcoded `NOW_ISO = '2026-09-01T10:00:00Z'` for deterministic demo dates | Low |
| No error boundaries | Low |
| No real error handling in API calls (no API calls exist) | N/A |

---

## 3. Target MVP Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (SPA)                     │
│  React + Vite + TypeScript + Tailwind + shadcn/ui   │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS (REST/JSON: JWT bearer)
┌──────────────────────▼──────────────────────────────┐
│                  API Gateway /                    │
│              Application Server (Node/TS)           │
│  - Auth middleware                                 │
│  - Tenant isolation middleware                     │
│  - Request validation                               │
│  - API routes                                      │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
┌────────────────┐ ┌─────────┐ ┌──────────────────┐
│  AI Service    │ │ Integrations │ │  PostgreSQL DB   │
│ (separate proc) │ │ Service    │ │ (per-tenant or   │
│ - LLM calls    │ │ - WhatsApp │ │  shared w/ RLS)   │
│ - tool executors│ │ - Email    │ └──────────────────┘
│ - output valid │ │ - Calendar │
│ - human approv │ │ - GBP API  │
└────────────────┘ └─────────┘
```

### Layer Responsibilities

| Layer | Responsibilities |
|---|---|
| **Frontend** | UI rendering, client-side routing, state management (Zustand persists to localStorage for current-session cache only), form validation, error display, keyboard shortcuts for search/command palette. Calls API for all data. |
| **API / Application Server** | Auth, authorization, tenant scoping, request validation, business logic orchestration, AI orchestration, integration orchestration, audit logging. Exposes REST/JSON endpoints. |
| **AI Service** | Dedicated service/process for LLM interactions. Receives structured tool definitions, executes against tenant-scoped data, returns structured JSON. Never directly mutates business data. All draft outputs require human approval before persistence. |
| **Database** | Persistent storage for all entities. Row-level security (RLS) or tenant-scoping at query layer. ACID transactions for workflow state changes. |
| **Integrations Service** | WhatsApp Business API, SMTP/email, Google Calendar API, Google Business Profile API. Handles webhooks, retries, dead-letter queues. |

---

## 4. Authentication

### Actors

| Actor | Access | Notes |
|---|---|---|
| **Founder** | Internal workspace (full) | Creates organizations, manages clinics, runs AI tools |
| **Clinic Owner** | Single clinic workspace | Manages their clinic, leads, appointments, staff |
| **Clinic Staff** | Single clinic workspace | Reception, coordinators, doctors — scoped permissions |
| **System** | All (via integrations) | Automated messages, review requests, reminders |

### Organization Model

```
Organization (e.g., "Dr. Kaya Skin Clinic Group")
  ├── Internal users (founder, operators)
  ├── Clinics (one or more physical locations)
  │     └── Clinic-specific users
  └── Shared prospects (if multi-clinic group)
```

### Roles & Permissions

| Role | Organization Scope | Clinic Scope |
|---|---|---|
| `org_admin` | Full CRUD on org settings, clinics, users, prospects | All clinics |
| `founder` | Full internal workspace | All clinics |
| `clinic_owner` | Read org-level data (assigned clinics) | Full CRUD on own clinic |
| `clinic_doctor` | None | Read/write appointments, reviews |
| `clinic_reception` | None | Read/write leads, conversations, follow-ups |
| `clinic_coordinator` | None | Read/write all clinic data except financial |

### Session Model

- JWT access token (15 min expiry) + refresh token (7 days).
- Token claims include: `sub` (user ID), `org_id`, `role`, `clinic_id` (or null for internal).
- `currentWorkspace` is a client-side preference persisted to localStorage.
- Server validates every request against token claims. Workspace switching is a client-side route change; the server always re-validates authorization.

---

## 5. Multi-Tenancy / Data Isolation

### Isolation Strategy

**Tenant = Organization.** Each organization has one or more clinics. Data is scoped at the query layer by `organization_id` (all tables). Clinic-level isolation is achieved by filtering on `clinic_id` in every query that touches clinic-scoped entities.

| Entity | Tenant Key | Clinic Key | Notes |
|---|---|---|---|
| Organization | — | — | Top-level tenant |
| User | organization_id | clinic_id (nullable for internal users) | Internal users have clinic_id = NULL |
| Clinic | organization_id | clinic_id | Bridge between org and clinic data |
| Prospect | organization_id | — | Internal-only entity; not scoped to clinic |
| Audit | organization_id | clinic_id (nullable) | Can be prospect-scoped or clinic-scoped |
| Outreach | organization_id | — | Internal-only |
| Proposal | organization_id | — | Internal-only |
| Lead | organization_id | clinic_id | Always scoped to a clinic |
| Conversation | organization_id | clinic_id (via lead) | Always scoped to a clinic |
| Message | organization_id | clinic_id (via conversation → lead) | |
| Appointment | organization_id | clinic_id (via lead) | |
| Followup | organization_id | clinic_id (via lead) | |
| Review | organization_id | clinic_id | |
| BusinessOutcome | organization_id | clinic_id | |
| Referral | organization_id | clinic_id | |

### Authorization Rules

| Action | Required Permission |
|---|---|
| View any prospect | `founder` or `org_admin` role, same organization |
| Edit prospect | `founder` or `org_admin` role, same organization |
| View clinic data | User belongs to same organization AND (same clinic OR `org_admin`/`founder`) |
| Edit clinic data | Same + `clinic_owner`/`clinic_staff` role |
| Run AI tool | Same as view permission for the target entity |
| Convert prospect to clinic | `founder` or `org_admin` role |
| Switch workspace | Client-side route change; server re-validates on every API call |

### activeClinicId Translation

The prototype's `session.activeClinicId` becomes a server-enforced concept:
- The API server reads `clinic_id` from the JWT for clinic-scoped requests.
- If `clinic_id` is null (internal user), the user can access all clinics in the organization (for cross-clinic reporting).
- If `clinic_id` is set, all queries are filtered by that clinic ID at the SQL level (RLS or middleware filtering).

---

## 6. Database Design

### Tables

| Table | Primary Key | Foreign Keys | Tenant Key | Notes |
|---|---|---|---|---|
| `organizations` | `id` (UUID) | — | — | Billing, settings, timezone |
| `users` | `id` (UUID) | `organization_id`, `clinic_id` (nullable) | `organization_id` | clinic_id NULL = internal user |
| `clinics` | `id` (UUID) | `organization_id`, `prospect_id` (nullable) | `organization_id` | One clinic per converted prospect |
| `doctors` | `id` (UUID) | `organization_id`, `clinic_id` | `organization_id` | |
| `staff` | `id` (UUID) | `organization_id`, `clinic_id` | `organization_id` | |
| `prospects` | `id` (UUID) | `organization_id` | `organization_id` | Internal-only |
| `audits` | `id` (UUID) | `organization_id`, `prospect_id` (nullable), `clinic_id` (nullable) | `organization_id` | |
| `outreach` | `id` (UUID) | `organization_id`, `prospect_id` | `organization_id` | |
| `proposals` | `id` (UUID) | `organization_id`, `prospect_id` | `organization_id` | |
| `leads` | `id` (UUID) | `organization_id`, `clinic_id` | `organization_id` | |
| `conversations` | `id` (UUID) | `organization_id`, `lead_id` | `organization_id` | |
| `messages` | `id` (UUID) | `organization_id`, `conversation_id` | `organization_id` | |
| `appointments` | `id` (UUID) | `organization_id`, `lead_id`, `doctor_id` | `organization_id` | |
| `followups` | `id` (UUID) | `organization_id`, `lead_id`, `appointment_id` | `organization_id` | |
| `reviews` | `id` (UUID) | `organization_id`, `clinic_id`, `appointment_id` | `organization_id` | |
| `business_outcomes` | `id` (UUID) | `organization_id`, `clinic_id`, `appointment_id` | `organization_id` | |
| `referrals` | `id` (UUID) | `organization_id`, `clinic_id` | `organization_id` | |
| `ai_tool_executions` (audit log) | `id` (UUID) | `organization_id`, `user_id` | `organization_id` | Logs every AI tool run |
| `integration_events` (outbox) | `id` (UUID) | `organization_id` | `organization_id` | Queued integration actions |

### Important Fields (Key Columns)

| Table | Key Fields | Indexes |
|---|---|---|
| `organizations` | `id`, `name`, `status` (`trial`/`active`/`suspended`) | PK, `name` |
| `users` | `email`, `role`, `organization_id`, `clinic_id` | PK, `organization_id`, `clinic_id`, unique `(organization_id, email)` |
| `clinics` | `name`, `specialty`, `address`, `city`, `phone`, `status` | PK, `organization_id`, `prospect_id` |
| `prospects` | `clinic_name`, `doctor_name`, `specialty`, `area`, `priority`, `notes` | PK, `organization_id`, `priority` |
| `audits` | `prospect_id`, `overall_opportunity`, `audit_date` | PK, `organization_id`, `prospect_id` |
| `outreach` | `prospect_id`, `channel`, `stage`, `next_action_at` | PK, `organization_id`, `prospect_id`, `stage` |
| `proposals` | `prospect_id`, `status`, `price_inr`, `created_at` | PK, `organization_id`, `prospect_id`, `status` |
| `leads` | `clinic_id`, `source`, `status`, `service_interested` | PK, `organization_id`, `clinic_id`, `status` |
| `conversations` | `lead_id`, `channel`, `status` | PK, `organization_id`, `lead_id`, `status` |
| `messages` | `conversation_id`, `sender`, `sent_at` | PK, `organization_id`, `conversation_id`, `sent_at` |
| `appointments` | `lead_id`, `doctor_id`, `scheduled_at`, `status` | PK, `organization_id`, `lead_id`, `scheduled_at`, `status` |
| `followups` | `lead_id`, `appointment_id`, `type`, `scheduled_at`, `status` | PK, `organization_id`, `lead_id`, `scheduled_at` |
| `reviews` | `clinic_id`, `appointment_id`, `status`, `rating` | PK, `organization_id`, `clinic_id`, `status` |
| `business_outcomes` | `clinic_id`, `appointment_id`, `amount_inr` | PK, `organization_id`, `clinic_id`, `recorded_at` |
| `referrals` | `clinic_id`, `referring_lead_id`, `referred_lead_id` | PK, `organization_id`, `clinic_id` |

### Design Notes

- **No medical records table.** Reviews, appointments, and business outcomes capture business metrics only. No diagnosis, treatment, or PHI fields.
- **UUIDs** for all primary keys to support distributed generation and multi-region replication.
- **Timestamps** stored as `TIMESTAMPTZ` in UTC; display layer handles localization.
- **JSONB columns** for audit `recommendations`, `identified_problems`, and notes — stored as arrays of strings, not parsed at DB level.
- **Soft delete:** All tables include `deleted_at` (nullable). Deleted records are filtered by default in all queries.

---

## 7. API Design

### Logical API Areas

| Area | Base Path | Auth Scope |
|---|---|---|
| Auth | `/api/v1/auth` | None (login) / Any authenticated (logout, refresh, switch-workspace) |
| Organizations | `/api/v1/organizations` | `org_admin` |
| Users | `/api/v1/users` | `org_admin` (CRUD); users can update own profile |
| Clinics | `/api/v1/clinics` | `org_admin`/`founder` (read all); `clinic_owner`/`staff` (read own) |
| Doctors | `/api/v1/doctors` | Clinic-scoped |
| Staff | `/api/v1/staff` | Clinic-scoped |
| Prospects | `/api/v1/prospects` | `org_admin`/`founder` |
| Audits | `/api/v1/audits` | `org_admin`/`founder` |
| Outreach | `/api/v1/outreach` | `org_admin`/`founder` |
| Proposals | `/api/v1/proposals` | `org_admin`/`founder` |
| Leads | `/api/v1/leads` | Clinic-scoped |
| Conversations | `/api/v1/conversations` | Clinic-scoped |
| Messages | `/api/v1/messages` | Clinic-scoped |
| Appointments | `/api/v1/appointments` | Clinic-scoped |
| Followups | `/api/v1/followups` | Clinic-scoped |
| Reviews | `/api/v1/reviews` | Clinic-scoped |
| Outcomes | `/api/v1/outcomes` | Clinic-scoped |
| Referrals | `/api/v1/referrals` | Clinic-scoped |
| AI | `/api/v1/ai` | Matches entity permission; always human-approval for drafts |
| Integrations | `/api/v1/integrations` | `org_admin`/`founder` (config); `clinic_owner`/`staff` (usage) |
| Analytics | `/api/v1/analytics` | `org_admin`/`founder`; clinic-level analytics for clinic users |

### Representative Endpoint Patterns

#### Prospects
- `GET /api/v1/prospects` — list (with filters: priority, area, updated_after)
- `GET /api/v1/prospects/{id}` — read single
- `POST /api/v1/prospects` — create
- `PATCH /api/v1/prospects/{id}` — update
- `GET /api/v1/prospects/{id}/audits` — related audits
- `GET /api/v1/prospects/{id}/outreach` — related outreach
- `GET /api/v1/prospects/{id}/proposals` — related proposals

#### Clinics
- `GET /api/v1/clinics` — list clinics in org
- `GET /api/v1/clinics/{id}` — read single
- `POST /api/v1/onboarding/prospect/{id}` — convert prospect to clinic
- `PATCH /api/v1/clinics/{id}` — update

#### Appointments
- `GET /api/v1/appointments?date=today&clinic_id={id}`
- `GET /api/v1/appointments/{id}`
- `POST /api/v1/appointments`
- `PATCH /api/v1/appointments/{id}` — status transition (validated against `APPOINTMENT_TRANSITIONS`)

#### AI
- `POST /api/v1/ai/tools` — body: `{ tool_id, context }` → returns `{ result_id, data, requires_human_review }`
- `GET /api/v1/ai/results/{result_id}` — retrieve result
- `POST /api/v1/ai/drafts/{result_id}/approve` — approve a draft (creates outbound event)
- `GET /api/v1/ai/history?tool_id=...&limit=50` — execution history

### Authorization Boundary

Every endpoint checks:
1. JWT validity.
2. `organization_id` from token matches resource owner.
3. `role` permits the action on the resource.
4. If clinic-scoped, `clinic_id` from token matches resource's `clinic_id` (unless `org_admin`/`founder`).

### Transition Validation

Status transitions are validated server-side using the same `assertTransition` pattern from the prototype:
- Outreach stages, proposal statuses, lead statuses, appointment statuses, follow-up statuses all enforce their transition maps.

---

## 8. AI Architecture

### Current Prototype AI

- 11 tools are local TypeScript functions.
- All read from the Zustand store (no network).
- Draft tools (`draft-whatsapp`, `draft-email`, `generate-proposal`) return a `requiresHumanReview: true` flag.
- No state mutations.
- No API keys or network calls.

### MVP AI Architecture

```
Frontend → API Gateway → AI Service (separate process)
                                │
                                ├──→ LLM Provider (OpenAI / Anthropic)
                                ├──→ Tool Executor (determines tool_id)
                                └──→ Structured Output Validator (Zod schema)
```

### What AI May Read

| Data Type | Access | Notes |
|---|---|---|
| Prosepects, Audits, Outreach, Proposals | Full read | Internal workspace data |
| Leads, Conversations, Messages, Appointments, Reviews, Outcomes | Full read (clinic-scoped) | Only within the user's clinic |
| Doctors, Staff | Read names/roles | No contact details unless relevant to draft |

### What AI May Never Access

| Data Type | Reason |
|---|---|
| Medical records / diagnosis | No medical data model exists |
| Patient PHI beyond business contact | MVP collects only business contact fields |
| Other organizations' data | Tenant isolation enforced at DB and service layer |
| Unrelated clinics' data | Clinic_id scoping in every query |
| External API credentials | Stored server-side only |

### Human Approval Flow

1. Frontend sends tool request to `/api/v1/ai/tools`.
2. AI service determines the tool, gathers context, calls LLM.
3. LLM output is validated against Zod schema.
4. If `requires_human_review` is true (drafts), the result is returned as a **draft**.
5. Frontend displays the draft with copy/download buttons — no "send" action.
6. User reviews → clicks "Approve Draft" → API creates an `integration_event` for the integrations service to send.
7. All tool executions are logged to `ai_tool_executions` table.

### Known Limitations

- AI tools are deterministic (rule-based), not LLM-based. MVP will introduce LLM calls for drafting and recommendations.
- No context history persistence — each tool call is independent.
- No fine-tuning or custom model endpoints planned for MVP.

---

## 9. Integration Architecture

### WhatsApp

| Aspect | Detail |
|---|---|
| **Purpose** | Outbound outreach drafts, appointment reminders, follow-up reminders |
| **Data exchanged** | Phone number, clinic name, appointment date/time, draft message text |
| **Auth model** | WhatsApp Business API token stored server-side; per-clinic configuration |
| **Webhook** | Incoming message webhook → creates `Message` record; updates `Conversation.last_message_at` |
| **Failure handling** | `integration_events` table with status (`pending`/`sent`/`failed`/`retry`), max 3 retries, then alert |

### Email

| Aspect | Detail |
|---|---|
| **Purpose** | Proposal delivery, general clinic communication |
| **Data exchanged** | Email address, subject, body, attachments (proposal PDF) |
| **Auth model** | SMTP credentials or SendGrid API key |
| **Webhook** | Delivery receipts (optional) |

### Calendar

| Aspect | Detail |
|---|---|
| **Purpose** | Doctor availability, appointment scheduling, follow-up reminders |
| **Data exchanged** | Date/time, location (virtual link), attendees (lead, doctor, staff) |
| **Auth model** | OAuth2 per-clinic Google account |
| **Webhook** | Event changes sync back to appointments table |

### Google Business Profile (GBP)

| Aspect | Detail |
|---|---|
| **Purpose** | Auto-generate response templates for new reviews |
| **Data exchanged** | Review text, rating, reviewer name (business only) |
| **Auth model** | OAuth2 per-clinic Google account |
| **Webhook** | New review notification → creates `Review` record if not exists |

### Design Principles

- Integrations are **outbound by default** — the core MVP works without any integrations.
- All integration actions go through an `integration_events` outbox table for retry/audit.
- Incoming webhooks are idempotent (deduplicate by external ID).
- No patient medical data in any integration payload.

---

## 10. MVP Pilot Scope

### In-Scope (Must Ship)

| Area | Feature |
|---|---|
| **Internal** | Prospects list/profile, Audits, Outreach board, Proposals, Reports, Founder AI (read-only mode), Search, Activity Center |
| **Clinic** | Leads, Lead detail, Conversations, Appointments, Follow-ups, Reviews, Clinic dashboard, Analytics |
| **AI** | All 11 tools, structured result cards, human-review badges for drafts, no-send policy for drafts |
| **Workflow** | Full internal golden path (Prospect → Clinic), Full clinic golden path (Lead → Review) |
| **Data** | Seed/demo data for pilot clinics |
| **Auth** | Login, workspace selection, clinic switching |

### Out-of-Scope for MVP (Remains Prototype-Only)

| Feature | Why Deferred |
|---|---|
| Multi-clinic orgs | Single clinic per org simplifies MVP |
| Referrals page | Not on core golden path |
| Internal Settings | Minimal config; no role management UI |
| Clinic Settings (doctors/staff management) | Static seed data sufficient for pilot |
| Real integrations (WhatsApp/email/calendar/GBP) | Backend infrastructure not ready |
| AI session persistence | LocalStorage only; server-side AI history comes with backend |
| Custom reporting | Reports page uses computed aggregates; no custom report builder |
| Billing / subscription management | Trial status only |
| Audit form modal | Prototype has inline edit; MVP may refine |

### Pilot Success Criteria

1. One founder can complete the full internal golden path.
2. One clinic can complete the full clinic golden path.
3. All AI tools produce deterministic, grounded output.
4. Search and Activity Center work without errors.
5. No data leakage between organizations or clinics.
6. All status transitions are enforced correctly.

---

## 11. Data Migration

### Strategy

The current Zustand store is an in-memory demo. The MVP will use PostgreSQL as the source of truth.

**Migration approach:** No automatic migration needed. The prototype is a demo artifact; pilot customers will start with empty databases and create real data through the MVP UI.

### Data Categories

| Category | Prototype | MVP |
|---|---|---|
| **Seed/Demo data** | JSON in `src/data/seed.ts` | Optional seed fixture (separate SQL file, clearly marked as demo) |
| **Real customer data** | N/A (synthetic only) | Stored in PostgreSQL, tenant-scoped |
| **QA/test data** | Manual seed resets | Admin-only "reset to demo" endpoint, clearly separated from production data |

### Separation Principle

- `SyntheticDataBanner` must remain visible on all pages when demo data is loaded.
- A `data_source` column (`real` | `demo`) should be added to all core tables to track origin.
- No demo data should ever appear in a real customer's database.
- The "Reset demo data" button from `InternalSettingsPage` should remain in the MVP but be admin-only.

---

## 12. Observability

### MVP Requirements

| Area | Requirement | Implementation Notes |
|---|---|---|
| **Application errors** | Capture all 500s, unhandled exceptions | Sentry or equivalent; include user context and request trace |
| **Audit logs** | Log all mutations | `audit_log` table: user_id, action, entity, entity_id, old_values, new_values, timestamp, IP |
| **AI tool execution logs** | Log every tool invocation | `ai_tool_executions` table: user_id, tool_id, context, result_id, duration_ms, success, error |
| **Integration failures** | Log all failed sends | `integration_events` table with retry_count, error_message, next_retry_at |
| **Workflow events** | Key business milestones | Log: proposal accepted, appointment attended, review received, clinic onboarded, outcome recorded |

### Log Retention

- Application errors: 90 days
- Audit logs: 365 days
- AI execution logs: 365 days
- Integration failures: 90 days (successful events: 30 days)
- Workflow events: 365 days

### No Enterprise Complexity

- No distributed tracing (OpenTelemetry) — simple request IDs suffice.
- No alerting system — logs/querying only.
- No metrics dashboards — PostgreSQL query exports.

---

## 13. Security / Compliance

### Authentication

- Passwordless email magic link OR OAuth (Google, Microsoft) for MVP.
- JWT access (15 min) + refresh (7 days), httpOnly cookies.
- Rate limiting on auth endpoints (5 attempts/minute per IP).

### Authorization

- RBAC per role defined above.
- Every API endpoint validates tenant and clinic scope.
- No "super admin" bypass in production — `org_admin` is the highest role.

### Tenant Isolation

- Database: `organization_id` filter on every query.
- API: Middleware reads `organization_id` from JWT and injects into query scope.
- Application: RLS (PostgreSQL Row-Level Security) as defense-in-depth.

### Encryption

- TLS for all transport.
- Database encryption at rest (managed by cloud provider — no custom key management in MVP).
- No sensitive data in logs.

### Secrets Management

- All API keys, DB credentials, JWT secrets stored in cloud provider secrets manager (AWS Secrets Manager / GCP Secret Manager).
- No `.env` files in production containers.
- Integration credentials stored per-organization in the `integration_configs` table (encrypted column).

### Minimal Data Collection

- Collect only: name, email, phone, business address, review text/rating, appointment times.
- No medical notes, treatment plans, or diagnosis text.

### AI Data Boundaries

- AI requests include a `tenant_id` and `user_id` in the execution context.
- AI service validates access before retrieving any entity data.
- AI outputs are logged but not retained beyond the execution record (no chat history persistence in MVP).

### Audit Logging

- All writes to business entities produce an audit log entry.
- AI tool invocations produce an execution log entry.
- Login/logout produce auth events.

### Retention Principles

- Soft-delete all entities (`deleted_at`).
- Users can request data export (GDPR-style).
- Data retained indefinitely until explicit deletion request (no auto-purge in MVP).

---

## 14. Deployment

### Architecture (Simple MVP)

```
┌────────────────────────────────┐
│      CDN (Vite build)         │
│  - index.html                  │
│  - assets/*.js, *.css          │
└───────────┬────────────────────┘
            │ HTTPS
┌───────────▼────────────────────┐
│  API Server (Node.js/Docker)  │
│  - REST endpoints              │
│  - Auth middleware             │
│  - AI orchestration            │
│  - Integration outbox worker   │
└───────────┬────────────────────┘
            │
┌───────────▼────────────────────┐
│  PostgreSQL Database           │
│  - Tenant-scoped tables        │
│  - RLS policies                │
└────────────────────────────────┘
```

### Environment Configuration

| Env Var | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signing key for access tokens |
| `JWT_REFRESH_SECRET` | Signing key for refresh tokens |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | LLM provider key (AI service only) |
| `WHATSAPP_BUSINESS_TOKEN` | For integration prototype (not MVP) |
| `NODE_ENV` | `development` / `production` |

### Backups

- Automated daily snapshots of PostgreSQL.
- Point-in-time recovery enabled.
- No restore testing required for MVP.

### Monitoring

- Container health check on API server.
- Database connection pool metrics.
- Basic uptime check on `/` endpoint.

---

## 15. Migration Plan

### Phase A: Prototype as Demo Artifact
- Prototype remains at `localhost:5173` for reference.
- No changes to prototype source code.
- All prototype pages link to docs explaining "these are demo screens."

### Phase B: Backend + Database
- Create PostgreSQL schema.
- Implement API server with CRUD for all entities.
- Write seed data fixtures (clearly marked as demo).
- Implement tenant scoping middleware.

### Phase C: Authentication + Tenant Isolation
- Implement login page → magic link or OAuth.
- Issue JWT with `organization_id`, `role`, `clinic_id`.
- Enforce tenant + clinic isolation on all endpoints.
- Add `RequireAuth` equivalent in the frontend (token-based).

### Phase D: Real Clinic Workflow
- Connect frontend to real API endpoints (replace Zustand read path).
- Implement all status transitions server-side.
- Migrate search and activity center to backend queries.
- Test full clinic golden path with real users.

### Phase E: AI Service
- Deploy AI service as separate container/process.
- Implement LLM calls for drafting and recommendation tools.
- Add human-approval flow for drafts.
- Add `ai_tool_executions` logging.
- Migrate all 11 tools to server-side execution (frontend calls `/api/v1/ai/tools`).

### Phase F: Real Integrations
- Implement WhatsApp Business API integration.
- Implement email (SMTP/SendGrid).
- Implement Google Calendar webhook.
- Implement GBP review webhook.
- Add `integration_events` outbox + worker for retries.

### Dependencies

Phase B is blocking for C (DB needed for auth), C is blocking for D (auth needed for data), D is blocking for E (real data needed for meaningful AI), E is blocking for F (AI drafts need to be actionable via integrations).

---

## 16. MVP Build Order

1. **Backend foundation** — Express/Fastify server, TypeScript, PostgreSQL connection, logging/error middleware, health checks.
2. **Database schema** — All tables with PK/FK/indexes, seed fixtures, migration framework.
3. **Auth system** — Login page, JWT issuance, token refresh, workspace/clinic context in token.
4. **Internal workflow** — Prospects, Audits, Outreach, Proposals API + frontend wiring (authenticated).
5. **Clinic workflow** — Leads, Conversations, Messages, Appointments, Follow-ups, Reviews, Outcomes API + frontend wiring.
6. **AI service** — Separate service, LLM integration, structured output validation, human-approval flow, audit logging.
7. **Onboarding** — Convert prospect → clinic, create doctors/staff, set activeClinicId.
8. **Search + Activity Center backend** — Query endpoints for search results and attention items.
9. **Integrations** — WhatsApp, email, calendar, GBP (Phase F).
10. **Analytics** — Reports backend, metric consistency verification.
11. **Production hardening** — Error boundaries, rate limiting, input validation, security headers, backup testing.

---

## 17. Decision Log

| # | Decision | Rationale |
|---|---|---|
| 1 | Prospect and Clinic remain separate entities | A prospect is a research target; a clinic is a paying customer. They represent different stages and require different data. |
| 2 | AI remains a layer, not the entire product | The product's value is in workflow structure and data integrity, not AI novelty. |
| 3 | Human approval required for outbound drafts | Prevents accidental sends; aligns with compliance requirements. |
| 4 | No medical-record functionality | MVP scope is business growth, not clinical care. |
| 5 | Internal and Clinic workspaces remain distinct | Different users, different mental models, different data access patterns. |
| 6 | Prototype Zustand is not the final persistence layer | localStorage is unsuitable for multi-user, multi-device access. |
| 7 | UUID primary keys | Distributed generation, future sharding potential. |
| 8 | Soft delete everywhere | Audit requirement; no accidental data loss. |
| 9 | Tenant = Organization | Single organization may own multiple clinics; internal users span all clinics. |
| 10 | Single DB schema with `organization_id` (not separate DBs) | Simpler MVP; RLS provides adequate isolation. Can shard later if needed. |
| 11 | Draft tools always require human review | Even "safe" drafts may contain incorrect data pulled from stale records. |
| 12 | Review/Outcome data is business-only | No PHI beyond "review rating and text" — no clinical notes stored. |
| 13 | Prospects convert to clinics only via onboarding flow | `Clinics.prospect_id` is `NOT NULL`; no direct `POST /clinics` endpoint in MVP. See Q1. |
| 14 | Multi-clinic orgs deferred from MVP | Each org has one clinic; prospects are organization-level only (no `clinic_id` on `prospects`). See Q2. |
| 15 | No application-layer encryption for MVP | Message bodies and business data rely on database-level encryption at rest. See Q3. |
| 16 | OpenAI is the sole LLM provider for MVP | AI Service hardcoded to OpenAI; provider abstraction saved for later phase. See Q4. |
| 17 | Single `clinic_id` per user for MVP | Multi-clinic user access deferred; internal users keep `clinic_id = NULL` (cross-clinic read). See Q5. |
| 18 | AI drafts are frontend-only, not persisted pre-approval | No `drafts` table; only `integration_events` are persisted on approval. See Q6. |

---

## Open Questions

All six open questions have been resolved in **V3.0.2 — MVP Architecture Decisions** (`docs/V3_MVP_DECISIONS.md`). This section is archived for traceability.

| # | Question | Decision | Blocking? |
|---|---|---|---|
| Q1 | Should prospects be convertible to clinics only via the onboarding flow, or should clinics also be creatable directly? | Onboarding only — `clinics.prospect_id` is `NOT NULL` | BLOCKING (Database, API) |
| Q2 | How will multi-clinic organizations handle prospect sharing? | Organization-level prospects only (no `clinic_id` on `prospects` table) | CAN DEFER |
| Q3 | Should message bodies be encrypted at rest? | Database-level encryption at rest only — no application-layer encryption in MVP | CAN DEFER |
| Q4 | What LLM provider(s) to use for MVP? | OpenAI only | BLOCKING (AI Service) |
| Q5 | How to handle clinic users with access to multiple clinics (e.g., regional managers)? | Single `clinic_id` per user; multi-clinic access deferred | CAN DEFER |
| Q6 | Should draft messages be saved as drafts in the database before approval? | No drafts table — drafts are frontend-only; only `integration_events` are persisted on approval | CAN DEFER |

**Decision rationale for each question is documented in full in `docs/V3_MVP_DECISIONS.md`.**

---

*This document is a living architecture specification. It will be updated as implementation decisions are finalized.*