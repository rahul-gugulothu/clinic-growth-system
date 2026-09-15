# V3.0.3 Backend Foundation

**Status:** COMPLETE  
**Date:** 2026-09-14  
**Phase:** MVP Implementation — Backend foundation (Phase A & B)  

---

## 1. Backend Stack

| Layer | Technology | Version | Reason |
|---|---|---|---|
| Runtime | Node.js | >=20 | Required by TypeScript ESM + pg |
| Framework | Express | ^4.21.2 | Chosen per architecture ("Express/Fastify"). Simpler than Fastify for MVP. |
| Language | TypeScript | ^5.6.3 | Matches frontend. `"module": "NodeNext"` for ESM compatibility. |
| Module System | ESM | `"type": "module"` | Native ES modules via Node.js |
| DB Driver | pg (node-postgres) | ^8.12.0 | Standard PostgreSQL driver for Node.js |
| Migrations | node-pg-migrate | ^7.0.1 | Minimal, established PG migration tool. Reads DATABASE_URL from env. |
| Logging | pino | ^10.2.0 | Structured, JSON-first logging for observability |
| Config Validation | zod | ^3.23.8 | Already a frontend dependency; validates env at startup |
| Test Runner | vitest | ^2.1.0 | Compatible with Vite ecosystem |
| In-Memory DB (tests) | pg-mem | ^2.2.2 | No Docker/PostgreSQL available in dev env; allows schema constraint testing |
| HTTP Testing | supertest | ^7.2.2 | Standard Express HTTP testing |

**Framework choice:** Architecture specified "Express/Fastify server." Express was chosen as the simpler option — fewer abstractions, less boilerplate, well-understood for MVP.

---

## 2. Directory Structure

```
backend/
├── .env.example              # Template for environment variables (no secrets)
├── .gitignore                # Excludes node_modules, dist, .env, coverage
├── eslint.config.js          # ESLint flat config (TypeScript ESLint v8)
├── migrations/
│   ├── 00001_initial_schema.sql    # Full DDL: types, enums, tables, indexes, constraints
│   └── 00002_seed_dev_data.sql     # Minimal dev seed (org, prospect, clinic, users, doctors, staff)
├── package.json              # Dependencies, scripts, node-pg-migrate config
├── tsconfig.json             # TypeScript config (NodeNext, strict, path aliases)
├── vitest.config.ts          # Test configuration
├── src/
│   ├── app.ts               # Express app factory (middleware, routes, error handler)
│   ├── server.ts             # Server entry: listen, graceful shutdown, signal handlers
│   ├── config/
│   │   └── index.ts          # Zod-validated environment configuration
│   ├── db/
│   │   └── index.ts          # pg.Pool factory, health check, graceful shutdown
│   ├── middleware/
│   │   ├── errorHandler.ts   # Centralized error handler (AppError → JSON response)
│   │   └── requestLogger.ts  # Structured request logging
│   ├── routes/
│   │   └── health.ts         # GET /api/v1/health — app + database health check
│   ├── types/
│   │   └── index.ts          # AppError class hierarchy (BadRequest, NotFound, InternalServerError)
│   └── utils/
│       └── logger.ts         # pino logger instance with dev/prod config
└── tests/
    ├── helpers.ts            # pg-mem test database factory (loads migrations, strips triggers)
    ├── setup.ts              # Global test setup (NODE_ENV, DATABASE_URL placeholder)
    ├── health.test.ts        # Health endpoint tests (3 tests: healthy, degraded, no secrets)
    ├── db.test.ts            # Database connection tests (5 tests: pool, timestamp, uuid, tables, seed)
    ├── schema.test.ts        # Schema validation (9 tests: tables, PKs, FKs, enums, indexes, soft delete)
    └── relations.test.ts     # FK & constraint integrity (30 tests: prospect→clinic, all FK chains)
```

---

## 3. Database

**Technology:** PostgreSQL (13+ for `gen_random_uuid()`)  
**Test Database:** pg-mem (in-memory PostgreSQL, v2.9.1)

The backend connects to PostgreSQL via a `pg.Pool`. Connection details come from `DATABASE_URL`.

### Migration Tool

**Tool:** `node-pg-migrate` v7  
**Migration directory:** `backend/migrations/`  
**Config:** `node-pg-migrate` key in `package.json` — reads `DATABASE_URL` from env  
**Migration files:** SQL format (`.sql`), executed in numeric order  

```bash
npm run migrate:up      # Apply pending migrations
npm run migrate:down    # Rollback one migration
npm run migrate:reset   # Drop and re-apply all
npm run migrate:status  # List migration status
```

### Schema Overview

**17 core entity tables:**

| Table | PK | FKs | Tenant Key | Soft Delete |
|---|---|---|---|---|
| `organizations` | `id` (UUID) | — | — | yes |
| `users` | `id` (UUID) | `organization_id`, `clinic_id` (nullable) | `organization_id` | yes |
| `prospects` | `id` (UUID) | `organization_id` | `organization_id` | yes |
| `clinics` | `id` (UUID) | `organization_id`, `prospect_id` (NOT NULL) | `organization_id` | yes |
| `doctors` | `id` (UUID) | `organization_id`, `clinic_id` | `organization_id` | yes |
| `staff` | `id` (UUID) | `organization_id`, `clinic_id` | `organization_id` | yes |
| `audits` | `id` (UUID) | `organization_id`, `prospect_id` (nullable), `clinic_id` (nullable) | `organization_id` | yes |
| `outreach` | `id` (UUID) | `organization_id`, `prospect_id` | `organization_id` | yes |
| `proposals` | `id` (UUID) | `organization_id`, `prospect_id` | `organization_id` | yes |
| `leads` | `id` (UUID) | `organization_id`, `clinic_id`, `assigned_staff_id` (nullable) | `organization_id` | yes |
| `conversations` | `id` (UUID) | `organization_id`, `lead_id`, `assigned_staff_id` (nullable) | `organization_id` | yes |
| `messages` | `id` (UUID) | `organization_id`, `conversation_id` | `organization_id` | yes |
| `appointments` | `id` (UUID) | `organization_id`, `lead_id`, `doctor_id` | `organization_id` | yes |
| `followups` | `id` (UUID) | `organization_id`, `lead_id` (nullable), `appointment_id` (nullable) | `organization_id` | yes |
| `reviews` | `id` (UUID) | `organization_id`, `clinic_id`, `appointment_id` (nullable) | `organization_id` | yes |
| `business_outcomes` | `id` (UUID) | `organization_id`, `clinic_id`, `appointment_id` (nullable) | `organization_id` | yes |
| `referrals` | `id` (UUID) | `organization_id`, `clinic_id`, `referring_lead_id` (nullable), `referred_lead_id` (nullable) | `organization_id` | yes |

**4 supplementary tables (non-core):**

| Table | Purpose |
|---|---|
| `audit_log` | Mutation audit trail (user_id, action, entity, entity_id, old/new values, IP) |
| `ai_tool_executions` | Logs every AI tool run (tool_id, context, result_id, duration_ms, success/error) |
| `integration_events` | Outbox queue for WhatsApp/email/calendar integration (status, retry_count, next_retry_at) |
| `integration_configs` | Per-organization integration credentials (encrypted column) |

**25 enum types** mirror prototype `src/types/status.ts` and `src/types/entities.ts` exactly.

---

## 4. Tenant Strategy

**Tenant = Organization.** Every tenant-owned table includes `organization_id` (UUID, NOT NULL, FK to `organizations.id`).

**Sub-scope = Clinic.** `clinic_id` on `users`, `doctors`, `staff`, `leads`, `reviews`, `business_outcomes`, `referrals`, and `integration_events` provides clinic-level filtering within a tenant. The `audits` table supports both `prospect_id` and `clinic_id` (nullable, for audit attribution).

**Prospects are organization-level** (Q2 decision) — the `prospects` table has no `clinic_id`.

**Clinic creation is onboarding-only** (Q1 decision) — `clinics.prospect_id` is `NOT NULL` with a unique constraint (one clinic per prospect).

**Soft delete** — all core tables include `deleted_at` (nullable). Application queries must filter `WHERE deleted_at IS NULL`.

**Data source tracking** — all 17 core entity tables include `data_source` (`'real' | 'demo'`) to distinguish production data from seeded demo data.

---

## 5. Locked Architecture Decisions (From V3.0.2)

| Decision | Lock |
|---|---|
| Q1: Clinic creation onboarding-only | `clinics.prospect_id NOT NULL`, unique constraint |
| Q2: Prospects organization-level | No `clinic_id` on `prospects` table |
| Q3: Database-level encryption only | No application-layer encryption in migration |
| Q4: OpenAI as sole LLM provider | N/A (AI service not implemented yet) |
| Q5: Single `clinic_id` per user | `users.clinic_id` nullable; CHECK constraint enforces non-null for clinic-scoped roles |
| Q6: Frontend-only drafts | No `drafts` table |

---

## 6. Environment Variables

```
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/DBNAME  (required)
PORT=3001
NODE_ENV=development
LOG_LEVEL=info
```

Copy `.env.example` to `.env` and fill in real values. Never commit `.env`.

---

## 7. Health Endpoint

**Route:** `GET /api/v1/health`

Returns:
```json
{
  "status": "healthy",                    // "healthy" or "degraded"
  "timestamp": "2026-09-14T12:34:56.789Z",
  "checks": {
    "database": {
      "connected": true,                 // true/false
      "latencyMs": 3                     // ping round-trip time
    }
  }
}
```

- HTTP 200 when database is connected (`status: "healthy"`)
- HTTP 503 when database is disconnected (`status: "degraded"`)
- Exposes no sensitive connection details

---

## 8. Logging / Error Handling

**Logger:** pino (structured JSON in production, pretty-printed in development)

**Request logging** — `requestLogger` middleware logs every incoming request with method, URL, IP, and duration.

**Error handling:**
- `AppError` base class with `statusCode` and `isOperational` flags
- `BadRequestError` (400), `NotFoundError` (404), `InternalServerError` (500) subclasses
- `errorHandler` middleware catches all errors, logs appropriately (warn for operational, error for programming), and returns structured JSON:
  ```json
  { "error": { "message": "...", "status": 500 } }
  ```
- Unhandled promise rejections and uncaught exceptions are caught at the process level and trigger graceful shutdown.

**Graceful shutdown:**
- `SIGTERM` / `SIGINT` → stop accepting new requests, close server, close DB pool
- 10-second forced shutdown timeout

---

## 9. Seed Strategy

**File:** `backend/migrations/00002_seed_dev_data.sql`

**Scope:** Minimal development-only data — exactly enough to verify:
- 1 organization (`Demo Dermatology Group`)
- 1 prospect (`Kaya Skin Clinic`)
- 1 clinic (converted from the prospect)
- 2 users (1 founder with `clinic_id = NULL`, 1 clinic_owner with valid `clinic_id`)
- 2 doctors (Owner, Consultant)
- 1 staff (Reception)

**All seeded rows** use fixed UUIDs and `data_source = 'demo'`.

This is NOT a copy of the frontend prototype dataset. No patient/medical data is seeded.

---

## 10. Local Development

```bash
# 1. Navigate to backend
cd backend

# 2. Install dependencies (if not already done)
npm install

# 3. Copy env template
cp .env.example .env
# Edit .env with real DATABASE_URL

# 4. Run database migrations
npm run migrate:up

# 5. Start development server
npm run dev

# 6. In tests, run:
npm test          # Run all tests
npm run typecheck # Type check
npm run lint      # Lint
npm run build     # Build for production
```

### Development Notes

- The backend runs on port 3001 by default (frontend runs on 5173 via Vite dev server)
- Tests use pg-mem (in-memory PostgreSQL) — no external PostgreSQL instance required
- The migration SQL includes PL/pgSQL triggers (`updated_at`), which pg-mem does not support. The test helper (`tests/helpers.ts`) strips the trigger section before loading into pg-mem. The migration file is valid for real PostgreSQL.

---

## 11. Test Commands

```bash
npm test              # All tests (vitest run)
npm run typecheck     # TypeScript type check
npm run lint          # ESLint
npm run build         # Production build (dist/)
```

### Test Coverage

| File | Tests | Coverage Area |
|---|---|---|
| `tests/health.test.ts` | 3 | Health endpoint (healthy, degraded, no secrets exposed) |
| `tests/db.test.ts` | 5 | Pool connection, timestamp, UUID generation, table access, seed data |
| `tests/schema.test.ts` | 9 | All 21 tables exist, UUID PKs, organization_id, deleted_at, data_source, 25 enums, 8 indexes, no drafts table |
| `tests/relations.test.ts` | 30 | FK integrity (prospect→clinic, audit→prospect/clinic, doctor/staff→clinic, lead→clinic/org, conversation→lead, message→conversation, appointment→lead/doctor, followup nullable FKs, review/outcome→clinic/appointment, referral→clinic/leads, user→org/clinic), CHECK constraint, NOT NULL constraint, unique constraint |

**Total: 47 tests, all passing.**

---

## 12. Known Limitations

1. **pg-mem vs. real PostgreSQL differences:**
   - pg-mem does not support PL/pgSQL triggers. The test helper strips the trigger section from migration SQL. Schema validation is unaffected (tables, columns, constraints, indexes are all created correctly).
   - pg-mem does not expose `pg_enum`, `pg_indexes`, or `information_schema.key_column_usage.referenced_table_name`. Tests verify these via behavioral methods (udt_name queries, table API for indices) or by attempting invalid inserts.
   - `gen_random_uuid()` is shimmed in the test helper (pg-mem doesn't implement pgcrypto). Real PostgreSQL 13+ provides this natively.

2. **No authentication implemented.** The `users` table and `user_role` enum exist, but no login endpoints, no JWT issuance. This is deferred to V3.0.4.

3. **No business API routes.** Only `/api/v1/health` is implemented. All CRUD endpoints (prospects, clinics, leads, etc.) are deferred.

4. **No real database available.** Tests use pg-mem only. Migration validation against a real PostgreSQL instance has not been performed (Docker daemon not available in this environment).

5. **Frontend not connected.** The prototype frontend (Zustand/localStorage) runs independently. No API integration has been wired.

6. **TypeScript path aliases** (`@/*`, `@db`) are defined in `tsconfig.json` but not yet used in source code — all imports use relative paths for NodeNext ESM compatibility.

---

## 13. What's NOT in this milestone

- Authentication (no login, no JWT, no sessions)
- Business API routes (no CRUD endpoints)
- Frontend/backend wiring (no API calls from React)
- AI service (no OpenAI integration, no `/api/v1/ai/tools`)
- External integrations (no WhatsApp, email, calendar, GBP)
- Multi-clinic organization support (deferred per Q2)
- Application-layer encryption (deferred per Q3)
