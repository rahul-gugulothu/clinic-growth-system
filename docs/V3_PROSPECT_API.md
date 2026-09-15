# V3.0.5 Prospect API

**Status:** COMPLETE
**Date:** 2026-09-15
**Phase:** V3.0.5 (Prospect CRUD API)

---

## 1. Overview

V3.0.5 implements the first production-style business API: Prospect management. It establishes the canonical pattern for all future V3 API endpoints:

**Route → requireAuth → tenant extraction → Zod validation → service → tenant-scoped DB query → consistent response**

This milestone does NOT implement clinics, leads, appointments, AI, or frontend API migration.

---

## 2. Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/prospects` | requireAuth | List prospects for the authenticated user's organization |
| GET | `/api/v1/prospects/:id` | requireAuth | Get a single prospect (404 if not in org) |
| POST | `/api/v1/prospects` | requireAuth | Create a prospect (organization from JWT) |
| PATCH | `/api/v1/prospects/:id` | requireAuth | Update a prospect's editable fields |

All endpoints require a valid `Authorization: Bearer <access_token>` header.

---

## 3. Request/Response Shapes

### GET /api/v1/prospects

List prospects scoped to the authenticated user's organization.

**Query Parameters:**
| Param | Type | Default | Max | Description |
|---|---|---|---|---|
| `limit` | number | 50 | 100 | Maximum results to return |
| `offset` | number | 0 | — | Results to skip |

**Response (200):**
```json
{
  "prospects": [
    {
      "id": "00000000-0000-0000-0000-000000000010",
      "organization_id": "00000000-0000-0000-0000-000000000001",
      "clinic_name": "Kaya Skin Clinic",
      "doctor_name": "Dr. Anaya Kaya",
      "specialty": "Aesthetic Dermatology",
      "area": "Bandra West",
      "phone": null,
      "website": null,
      "google_rating": null,
      "review_count": null,
      "instagram_url": null,
      "booking_available": false,
      "whatsapp_available": false,
      "visible_advertising": null,
      "content_quality": null,
      "obvious_problem": null,
      "priority": null,
      "source_urls": null,
      "notes": null,
      "data_source": "demo",
      "created_at": "2026-01-01T00:00:00.000Z",
      "updated_at": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

### GET /api/v1/prospects/:id

**Response (200):**
```json
{
  "prospect": {
    "id": "...",
    "organization_id": "...",
    ...
  }
}
```

**Errors:**
- 400: Invalid UUID format in `:id`
- 404: Prospect not found (or belongs to a different organization)

### POST /api/v1/prospects

Create a new prospect. The `organization_id` is **always derived from the authenticated user's JWT** — never from the request body.

**Request Body (required fields first):**
```json
{
  "clinic_name": "New Skin Clinic",
  "doctor_name": "Dr. New",
  "specialty": "Dermatology",
  "area": "Bandra",
  "phone": "+91 99999 99999",
  "website": "https://example.com",
  "google_rating": 4.5,
  "review_count": 100,
  "instagram_url": "https://instagram.com/clinic",
  "booking_available": true,
  "whatsapp_available": false,
  "visible_advertising": "Instagram ads",
  "content_quality": "High",
  "obvious_problem": "Slow response",
  "priority": "High",
  "source_urls": ["https://g.page/clinic"],
  "notes": "Some notes"
}
```

**Response (201):**
```json
{
  "prospect": {
    "id": "c883f6ff-896b-4375-b76f-841c171ba477",
    "organization_id": "00000000-0000-0000-0000-000000000001",
    "clinic_name": "New Skin Clinic",
    ...
    "data_source": "demo",
    "created_at": "2026-09-15T...",
    "updated_at": "2026-09-15T..."
  }
}
```

**Validation:**
- `clinic_name`, `doctor_name`, `specialty`, `area` — required, non-empty strings
- `website`, `instagram_url` — must be valid URLs if provided
- `google_rating` — number between 0 and 5
- `review_count` — non-negative integer
- `content_quality` — `'Low'`, `'Medium'`, or `'High'`
- `priority` — `'Low'`, `'Medium'`, or `'High'`
- `source_urls` — array of valid URLs
- `organization_id` in request body is **silently stripped** (ignored)

### PATCH /api/v1/prospects/:id

Update editable fields. The `organization_id` **cannot** be changed through PATCH.

**Request Body:** Any subset of the editable fields (all optional). Must contain at least one field.

**Response (200):**
```json
{
  "prospect": { ... }
}
```

**Errors:**
- 400: Invalid UUID, no fields to update, or invalid field values
- 404: Prospect not found (or belongs to a different organization)

---

## 4. Authentication

All endpoints require a valid JWT access token in the `Authorization: Bearer` header.

The access token is issued by `POST /api/v1/auth/dev/login` (dev) or will be issued by OAuth (production). The JWT contains:
- `sub`: user ID (UUID)
- `org_id`: organization ID (UUID)
- `role`: user role
- `clinic_id`: clinic ID or null

The `organization_id` used for all prospect queries is **derived from the JWT's `org_id` claim via the authenticated server context**, not from any client-supplied value.

---

## 5. Organization Scoping (Tenant Safety)

**Critical rule:** `organization_id` always comes from the authenticated server context, never from the client.

### Implementation

| Layer | How organization_id is sourced |
|---|---|
| Route handler | `getTenantOrganizationId(req)` — reads from `req.auth` (set by `requireAuth`) |
| Service layer | `organizationId` parameter — passed from route handler, never from request body/params/query |
| Database query | `WHERE organization_id = $1` (parameterized, always from JWT) |

### What client-supplied values are rejected

- **POST body:** `organization_id` is not in the Zod schema → silently stripped
- **PATCH body:** `organization_id` is not in the Zod schema → silently stripped
- **Query params:** ignored (not used in any query)
- **URL params:** `organization_id` not in path — only `id` (prospect UUID) is in the path

### Cross-organization behavior

Cross-organization access returns **404 Not Found**, not 403 Forbidden. This prevents information leakage — a user cannot determine whether a prospect exists in another organization.

The SQL query always includes `organization_id` in the WHERE clause:
```sql
SELECT ... FROM prospects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
```

If a user from Org A requests a prospect owned by Org B, the query returns zero rows → 404.

### What must NOT happen (verified by tests)

- Client cannot override organization by sending `organization_id` in POST body
- Client cannot override organization by sending `organization_id` in PATCH body
- Client cannot list prospects from another organization
- Client cannot read prospects from another organization
- Client cannot update prospects from another organization

---

## 6. Data Model

### Database Schema

The `prospects` table (from `migrations/00001_initial_schema.sql`):

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | UUID (PK) | NO | `gen_random_uuid()` |
| `organization_id` | UUID (FK) | NO | — |
| `clinic_name` | TEXT | NO | — |
| `doctor_name` | TEXT | NO | — |
| `specialty` | TEXT | NO | — |
| `area` | TEXT | NO | — |
| `phone` | TEXT | YES | — |
| `website` | TEXT | YES | — |
| `google_rating` | NUMERIC(3,2) | YES | — |
| `review_count` | INTEGER | YES | — |
| `instagram_url` | TEXT | YES | — |
| `booking_available` | BOOLEAN | NO | `FALSE` |
| `whatsapp_available` | BOOLEAN | NO | `FALSE` |
| `visible_advertising` | TEXT | YES | — |
| `content_quality` | `content_quality` enum | YES | — |
| `obvious_problem` | TEXT | YES | — |
| `priority` | `priority_enum` enum | YES | — |
| `source_urls` | TEXT[] | YES | — |
| `notes` | TEXT | YES | — |
| `data_source` | `data_source` enum | NO | `'demo'` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |
| `deleted_at` | TIMESTAMPTZ | YES | — |

### Enums

```sql
content_quality: ('Low', 'Medium', 'High')
priority_enum: ('Low', 'Medium', 'High')
data_source: ('real', 'demo')
```

### Soft Delete

Prospects use soft-delete via `deleted_at`. All queries filter with `WHERE deleted_at IS NULL`. A deleted prospect returns 404 to all callers.

---

## 7. Architecture

### Layer separation

```
Route (src/routes/prospects.ts)
  → Zod validation (createProspectSchema, updateProspectSchema)
  → Service (src/services/prospects.ts)
    → Database (getClient() from src/db/index.ts)
```

Routes contain **no raw SQL** — all database logic is in the service layer.

Services return typed records (`ProspectRecord`). Routes serialize these to JSON.

### Route middleware

```
POST /prospects/* → requireAuth → handler
```

`requireAuth` verifies the access token and sets `req.auth` with the user's `AuthContext`. Routes then call `getTenantOrganizationId(req)` to get the organization ID.

### Error handling

All errors are thrown as typed `AppError` subclasses:
- `BadRequestError` (400) — validation failures, empty update body
- `UnauthorizedError` (401) — missing/invalid token
- `NotFoundError` (404) — prospect doesn't exist or belongs to another org

Errors are caught by the central error handler (`src/middleware/errorHandler.ts`) which returns:
```json
{
  "error": {
    "message": "...",
    "status": 404
  }
}
```

---

## 8. Testing

Tests in `tests/prospects.test.ts` using vitest + supertest + pg-mem.

### Test coverage

| Category | Tests |
|---|---|
| Authentication | Missing token → 401, invalid token → 401 |
| GET /prospects (list) | Valid list → 200, Org A can't see Org B, Org B sees own records |
| GET /prospects/:id | Valid read → 200, Org A can't GET Org B → 404, Org B can GET own, nonexistent → 404, invalid UUID → 400 |
| POST /prospects | Valid create → 201, client-supplied org_id ignored, create stores JWT org_id, missing required → 400, invalid types → 400, invalid URL → 400, full fields create → 201 |
| PATCH /prospects/:id | Valid update → 200, Org A can't PATCH Org B → 404, PATCH org_id ignored, nonexistent → 404, invalid UUID → 400, empty body → 400, nullable field set to null → 200 |

### Test database

Tests use `pg-mem` (in-memory PostgreSQL) with the full schema. The `gen_random_uuid()` function is shimmed via `tests/helpers.ts` using `crypto.randomUUID()` with `impure: true` to prevent pg-mem's function-result caching.

---

## 9. Remaining Limitations

1. **No search/filtering:** The list endpoint only supports pagination (limit/offset). Future work should add search by clinic_name, doctor_name, specialty, area, priority, content_quality.
2. **No soft-delete API:** Prospects can only be soft-deleted via direct DB access. A DELETE endpoint is not implemented.
3. **No audit logging for create/update:** Unlike auth events, prospect creation and updates do not log to `audit_log`. This can be added in a future milestone.
4. **Rate limiting:** Currently not applied to prospect endpoints. Auth-sensitive endpoints are rate-limited (V3.0.4-C), but business API rate limiting is not yet implemented.
5. **pg-mem limitations:** Tests run against in-memory PostgreSQL which strips PL/pgSQL triggers and has issues with IPv6 `inet` parsing (audit_log failures are caught silently).
