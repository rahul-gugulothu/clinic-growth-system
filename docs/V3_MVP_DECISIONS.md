# V3 MVP Architecture Decisions

**Status:** FINALIZED
**Date:** 2026-09-14
**Milestone:** V3.0.2 — Decision Documentation
**Source:** Six open questions from `docs/V3_MVP_ARCHITECTURE.md` (Section: Open Questions)

---

## Decision 1

Question: Should prospects be convertible to clinics only via the onboarding flow, or should clinics also be creatable directly?

Decision: Prospects convert to clinics ONLY via the onboarding flow (`POST /api/v1/onboarding/prospect/{id}`). Clinics cannot be created directly without a source prospect.

Reason: The data model in Section 4 (Key Relationships, line 51) defines `Clinic.prospect_id` as a 1:1 optional foreign key — "one clinic per converted prospect." Allowing direct clinic creation without a prospect breaks this guarantee and introduces orphaned records. The onboarding endpoint (`POST /api/v1/onboarding/prospect/{id}`, line 339) already exists as the conversion path. Multi-clinic organizations are deferred from MVP (line 490: "Single clinic per org simplifies MVP"), so there is no MVP use case for direct clinic creation. This preserves "Keep Prospect and Clinic as separate entities" (Decision 1, line 737) and the data-integrity principle.

Impact:
- Database: `Clinics.prospect_id` column should be `NOT NULL` (enforced at schema level).
- API: No `POST /api/v1/clinics` create endpoint is needed; the only clinic-creation path is `POST /api/v1/onboarding/prospect/{id}`.
- MVP Build Order (line 725): Onboarding step ("Convert prospect → clinic, create doctors/staff, set activeClinicId") is the sole clinic-creation mechanism.

What becomes locked:
- `Clinic.prospect_id` is `NOT NULL` — every clinic must trace back to a prospect.
- The conversion workflow is gated and auditable.

What can remain flexible later:
- A future "import existing clinic" workflow (for enterprise onboarding) can add a nullable `prospect_id` or a separate import path — this is a backward-compatible schema change (making `prospect_id` nullable) plus a new endpoint.

Dependency classification:
- Database implementation: BLOCKING (affects `clinics` table schema — `prospect_id NOT NULL`).
- Authentication implementation: N/A.
- API implementation: BLOCKING (determines endpoint surface — no `POST /clinics`).
- AI service implementation: CAN DEFER (does not affect AI service).
- Integration implementation: CAN DEFER.

---

## Decision 2

Question: How will multi-clinic organizations handle prospect sharing?

Decision: Prospects remain organization-level entities (shared across all clinics in an organization). No per-clinic prospect scoping. For the MVP, each organization has exactly one clinic, so prospect sharing is trivially satisfied at the organization level.

Reason: The existing data model already defines `prospects` as scoped by `organization_id` only, with no `clinic_id` column (lines 207, 252). This matches the tenant model "Tenant = Organization" (Decision 9, line 745). The MVP explicitly defers multi-clinic organizations (line 490: "Single clinic per org simplifies MVP"), so the shared-prospect question is moot for the first release. Preserving organization-level prospects keeps the query scoping simple (one tenant key on every entity) and avoids premature introduction of prospect assignment or cloning logic.

Impact:
- Database: `prospects` table confirmed as having no `clinic_id` column.
- Query layer: All prospect queries filter on `organization_id` only.
- Future multi-clinic support: Prospect assignment (`prospect_assignments` table) or cloning logic can be added later without schema changes to `prospects`.

What becomes locked:
- Prospects are strictly organization-scoped — the table schema does not include `clinic_id`.

What can remain flexible later:
- The sharing mechanism (assignment, ownership, visibility rules) can be added as a feature layer without touching the `prospects` table.
- A `prospect_clinic_assignments` join table can be introduced to support selective visibility in multi-clinic orgs.

Dependency classification:
- Database implementation: CAN DEFER (schema is already defined with organization_id only; no new migration needed).
- Authentication implementation: CAN DEFER.
- API implementation: CAN DEFER.
- AI service implementation: CAN DEFERR.
- Integration implementation: CAN DEFER.

---

## Decision 3

Question: Should message bodies be encrypted at rest?

Decision: No application-layer encryption for message bodies or other business data in the MVP. Rely on database-level encryption at rest (managed by the cloud provider).

Reason: The architecture already specifies "Database encryption at rest (managed by cloud provider — no custom key management in MVP)" (lines 587-588). The MVP collects only business contact fields — name, email, phone, business address, review text/rating, appointment times (line 598). No medical notes, treatment plans, or diagnosis text are stored (Decision 4, line 740). Application-layer encryption adds operational complexity (per-organization key rotation, key storage, encryption key management, inability to query or index encrypted fields) that contradicts the "Minimize operational complexity" and "Avoid enterprise-scale architecture prematurely" decision principles. Database-level encryption at rest provides sufficient protection for business-contact data without MVP complexity.

Impact:
- Database: No schema changes for encryption (no encrypted columns, no key management tables).
- Security: Standard cloud-provider encryption at rest for PostgreSQL.
- Secrets Management (line 592-594): Per-organization integration credentials are encrypted at the column level, but message bodies are not separately encrypted.

What becomes locked:
- The security posture relies on database-level encryption at rest for all business data including message bodies.

What can remain flexible later:
- Application-layer encryption (or per-record encryption for specific message fields) can be added in a future compliance phase (e.g., HIPAA readiness) by introducing an encryption/decryption layer in the database access layer. This is a deployment/code-level change, not a schema change.

Dependency classification:
- Database implementation: CAN DEFER (no schema or migration changes needed).
- Authentication implementation: CAN DEFER.
- API implementation: CAN DEFER.
- AI service implementation: CAN DEFER.
- Integration implementation: CAN DEFER.

---

## Decision 4

Question: What LLM provider(s) to use for MVP?

Decision: Use OpenAI as the sole LLM provider for the MVP AI service. Anthropic and others are deferred.

Reason: The architecture presents "LLM Provider (OpenAI / Anthropic)" as options (line 384). For the smallest viable MVP, choosing a single provider eliminates routing logic, fallback handling, and multi-provider configuration complexity — aligning with "Minimize operational complexity" and "Smallest viable MVP." OpenAI GPT-4o is the most cost-effective for drafting and recommendation workloads at scale, has strong API reliability, and supports structured output / function calling needed for tool execution and Zod validation. The env var section lists `OPENAI_API_KEY` first (line 654). The AI service is a separate process (lines 123-140), so the provider choice is an internal implementation detail that does not affect API contracts. The structured output validator (Zod, line 138) abstracts the model response format, making future provider swaps non-breaking.

Impact:
- AI service: Hardcoded to OpenAI API client for MVP.
- Environment: `OPENAI_API_KEY` env var is the only required LLM key.
- API: `/api/v1/ai/tools` and `/api/v1/ai/results/{result_id}` endpoints remain provider-agnostic.

What becomes locked:
- The AI service is hardcoded to OpenAI for MVP.

What can remain flexible later:
- The provider abstraction can be introduced later (a `provider` config field routed to different API clients). The AI service's separate-process architecture makes this an internal refactor. The frontend never sees provider selection — it always calls `/api/v1/ai/tools`.

Dependency classification:
- Database implementation: CAN DEFER (does not affect DB).
- Authentication implementation: CAN DEFER.
- API implementation: CAN DEFER (AI endpoints are provider-agnostic at the contract level).
- AI service implementation: BLOCKING (determines which API client, which env var, which rate-limit model).
- Integration implementation: CAN DEFER.

---

## Decision 5

Question: How to handle clinic users with access to multiple clinics (e.g., regional managers)?

Decision: Each user is assigned exactly one `clinic_id` (or `NULL` for internal users). Multi-clinic user access is deferred from MVP.

Reason: The JWT token model already specifies `clinic_id` (singular, nullable) in token claims (line 190: "clinic_id (or null for internal)"). The `users` table defines `clinic_id` as a single nullable foreign key (line 248). Internal users with `clinic_id = NULL` already have cross-clinic read access (line 237). Supporting multi-clinic users would require JWT changes (array of clinic IDs), RBAC complexity (per-clinic role resolution), and query-layer changes (filtering by an array instead of a scalar). The MVP defers multi-clinic organizations entirely (line 490: "Single clinic per org simplifies MVP"), so there is no MVP use case for multi-clinic user access.

Impact:
- Database: `users.clinic_id` confirmed as a single nullable foreign key.
- JWT: Token carries `clinic_id` (scalar, nullable).
- Authorization: Single-clinic scope resolution per request (line 360: "If clinic-scoped, `clinic_id` from token matches resource's `clinic_id`").

What becomes locked:
- The single `clinic_id` per user model is fixed for MVP.

What can remain flexible later:
- JWT can be extended to carry `allowed_clinic_ids` array (or a `user_clinics` join table) in a future release. The existing `clinic_id` column can be retained as the "primary clinic" for backward compatibility.

Dependency classification:
- Database implementation: CAN DEFER (schema is already defined with single `clinic_id`).
- Authentication implementation: CAN DEFER (JWT model is already defined with single `clinic_id`).
- API implementation: CAN DEFER (authorization model is already defined for single-clinic scope).
- AI service implementation: CAN DEFER.
- Integration implementation: CAN DEFER.

---

## Decision 6

Question: Should draft messages be saved as drafts in the database before approval?

Decision: Drafts are NOT persisted to a database drafts table. They are returned as AI tool results and reviewed/approved in-session via frontend state (with localStorage as a transient session cache). On approval, an `integration_event` is created.

Reason: The AI architecture explicitly states the AI service "Never directly mutates business data" (line 149). The human-approval flow (lines 409-415) describes: frontend sends tool request → AI service returns result → frontend displays draft → user approves → API creates `integration_event`. AI tool executions are logged to `ai_tool_executions` (audit log only — line 264). There is no `drafts` table in the schema. Saving drafts to the database would require a new table, new endpoints (`POST /drafts`, `PATCH /drafts/{id}`), and would blur the line between ephemeral AI results and persisted business data — violating "AI remains a layer, not the entire product" (Decision 2, line 738). The existing endpoint set (`/api/v1/ai/tools`, `/api/v1/ai/results/{result_id}`, `/api/v1/ai/drafts/{result_id}/approve` — lines 349-351) fully supports an in-session approval flow. The frontend already uses Zustand persisted to localStorage as a "current-session cache only" (line 147).

Impact:
- Database: No `drafts` table added to schema. AI results are transient; only the approval action (`integration_event`) is persisted.
- API: No draft CRUD endpoints needed. Only `/api/v1/ai/tools`, `/api/v1/ai/results/{result_id}`, and `/api/v1/ai/drafts/{result_id}/approve` are required.
- Frontend: Drafts live in frontend state; localStorage provides session resilience for the current browser session.

What becomes locked:
- The AI draft flow does NOT persist drafts to a table before approval. The `ai_tool_executions` table serves as the only persistence for AI tool runs (audit/log purposes only).

What can remain flexible later:
- A "save draft for later" UX feature can be added in a future phase by introducing a `drafts` table and `POST /drafts` endpoint. This is an additive change that does not affect the existing approval flow.

Dependency classification:
- Database implementation: CAN DEFER (no new table or migration needed).
- Authentication implementation: CAN DEFER.
- API implementation: CAN DEFER (clarifies that no draft-save endpoints are needed, but this is a subtraction from scope, not an addition).
- AI service implementation: CAN DEFER (the existing `/api/v1/ai/drafts/{result_id}/approve` endpoint already supports the flow).
- Integration implementation: CAN DEFER.

---

## Summary Table

| Q# | Question (short) | Decision | Blocking? |
|---|---|---|---|
| Q1 | Prospect → Clinic conversion path | Via onboarding only; `clinic_id NOT NULL` | Yes — Database, API |
| Q2 | Multi-clinic prospect sharing | Org-level prospects only (no `clinic_id`) | No — CAN DEFER |
| Q3 | Message body encryption | Database-level encryption only | No — CAN DEFER |
| Q4 | LLM provider | OpenAI only | Yes — AI Service |
| Q5 | Multi-clinic user access | Single `clinic_id` per user | No — CAN DEFER |
| Q6 | Draft persistence | Frontend-only drafts, no DB drafts table | No — CAN DEFER |

## Dependency Resolution Matrix

| Implementation Phase | Blocking Questions | Resolved By This Milestone |
|---|---|---|
| A. Database implementation | Q1 (clinics table: `prospect_id NOT NULL`) | YES |
| B. Authentication implementation | — (Q5 uses already-defined JWT model) | YES |
| C. API implementation | Q1 (no `POST /clinics`) | YES |
| D. AI service implementation | Q4 (OpenAI only) | YES |
| E. Integration implementation | Q6 (no draft endpoints; only approve endpoint) | YES — clarifies scope removal |
