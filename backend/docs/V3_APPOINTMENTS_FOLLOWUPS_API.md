# V3.0.8 — Appointments & Follow-ups API

## Overview

CRUD endpoints for managing clinic appointments and patient follow-up reminders.

Both APIs enforce strict tenant isolation:

- **organization_id** is always taken from the JWT (`org_id` claim).
- **clinic_id** is taken from the JWT (`clinic_id` claim) for clinic-scoped users.
- **founders** and **org_admins** can read/write across all clinics in their organization.
- **clinic-scoped users** (e.g. `clinic_owner`, `doctor`) can only access records whose lead or appointment belongs to their clinic.
- Client-supplied `organization_id`, `clinic_id`, `id` fields are silently stripped from request bodies — they can never override the server-authority JWT values.

All queries are scoped by `organization_id = $JWT.org_id` and soft-deleted records (`deleted_at IS NULL`) are excluded.

---

## Authentication

All endpoints require a Bearer access token.

```
Authorization: Bearer <jwt>
```

### JWT Claims

| Claim       | TypeScript field      | Description                              |
|-------------|-----------------------|------------------------------------------|
| `sub`       | `userId`              | Authenticated user UUID                  |
| `org_id`    | `organizationId`      | Organization the user belongs to         |
| `role`      | `role`                | `founder`, `org_admin`, `clinic_owner`, `doctor`, `staff` |
| `clinic_id` | `clinicId`            | Clinic UUID (nullable for founders)      |

### Authorization Rules

| Action                                   | Founder / Org Admin | Clinic-scoped user        |
|------------------------------------------|---------------------|---------------------------|
| List / Get records in own org            | ✓                   | ✓ (only own clinic records) |
| Create appointment / follow-up           | ✓                   | ✓ (must belong to own clinic) |
| Update any record in own org             | ✓                   | ✓ (only own clinic records) |
| Access record in another org             | ✗ (404)             | ✗ (404)                   |

---

## Appointments API

**Base path:** `/api/v1/appointments`

### Status Enum

| Value    | Description                          |
|----------|--------------------------------------|
| `Booked` | Appointment is scheduled             |
| `Attended` | Patient attended                    |
| `NoShow` | Patient did not attend              |
| `Cancelled` | Appointment was cancelled         |

### Reminder Status Enum

| Value     | Description                |
|-----------|----------------------------|
| `Pending` | Reminder not yet sent      |
| `Sent`    | Reminder was sent          |
| `Skipped` | Reminder was skipped       |

### Status Transition Rules

```
Booked → Attended    ✓
Booked → NoShow      ✓
Booked → Cancelled   ✓
Attended → (terminal) — no further transitions
NoShow → Cancelled   ✓
Cancelled → (terminal) — no further transitions
```

### Appointment Object

| Field            | Type                          | Description                          |
|------------------|-------------------------------|--------------------------------------|
| `id`             | UUID                          | Unique identifier                    |
| `organization_id`| UUID                          | Owning organization (from JWT)       |
| `lead_id`        | UUID                          | Associated lead                      |
| `doctor_id`      | UUID                          | Associated doctor                    |
| `scheduled_at`   | ISO 8601 datetime             | Appointment time                     |
| `status`         | `Booked` \| `Attended` \| `NoShow` \| `Cancelled` | Current status |
| `reminder_status`| `Pending` \| `Sent` \| `Skipped` | Reminder state                |
| `attended_at`    | ISO 8601 datetime \| null     | When patient attended                |
| `data_source`    | `real` \| `demo`              | Data origin                          |
| `created_at`     | ISO 8601 datetime             | Creation timestamp                   |
| `updated_at`     | ISO 8601 datetime             | Last update timestamp                |

### GET /api/v1/appointments

List appointments for the authenticated organization (and clinic if scoped).

**Query Parameters:**

| Parameter | Type   | Default | Description           |
|-----------|--------|---------|-----------------------|
| `page`    | int    | 1       | Page number (>= 1)    |
| `limit`   | int    | 20      | Results per page      |

**Response:** `200 OK`
```json
{
  "appointments": [ { "id": "...", "organization_id": "...", ... } ],
  "pagination": { "page": 1, "limit": 20, "total": 42, "hasMore": true }
}
```

### GET /api/v1/appointments/:id

Retrieve a single appointment by UUID.

**Response:** `200 OK`
```json
{ "appointment": { "id": "...", ... } }
```

**Errors:** `401 Unauthorized`, `404 Not Found`

### POST /api/v1/appointments

Create a new appointment.

**Request Body:**
```json
{
  "lead_id": "uuid",
  "doctor_id": "uuid",
  "scheduled_at": "2025-02-01T10:00:00Z"
}
```

The `lead_id` and `doctor_id` must belong to the same clinic as the authenticated user (or any clinic if founder/org_admin).

**Response:** `201 Created`
```json
{ "appointment": { "id": "...", "status": "Booked", "reminder_status": "Pending", ... } }
```

**Errors:** `400 Bad Request` (invalid payload), `401 Unauthorized`, `404 Not Found` (lead/doctor not in scope)

### PATCH /api/v1/appointments/:id

Update an appointment. Fields are optional — at least one must be provided.

**Request Body:**
```json
{
  "scheduled_at": "2025-02-01T11:00:00Z",
  "status": "Attended",
  "reminder_status": "Sent",
  "attended_at": "2025-02-01T11:05:00Z"
}
```

**Status transition validation:** If `status` is provided, it is validated against the current status using the transition rules above. Same-status updates (e.g., `Booked → Booked`) are allowed and treated as no-ops.

**Client-supplied `organization_id`, `clinic_id`, and `id` fields are stripped before processing.**

**Response:** `200 OK`
```json
{ "appointment": { "id": "...", ... } }
```

**Errors:** `400 Bad Request` (invalid payload, invalid transition, no fields), `401 Unauthorized`, `404 Not Found`

---

## Follow-ups API

**Base path:** `/api/v1/followups`

### Type Enum

| Value            | Description                              |
|------------------|------------------------------------------|
| `Reminder`       | Appointment reminder                     |
| `Recovery`       | No-show recovery outreach                |
| `Reschedule`     | Appointment rescheduling                 |
| `Review Request` | Post-visit review request                |

### Channel Enum

| Value     | Description          |
|-----------|----------------------|
| `Email`   | Email channel        |
| `Phone`   | Phone call channel   |
| `WhatsApp`| WhatsApp channel     |
| `InPerson`| In-person interaction|

### Status Enum

| Value       | Description                          |
|-------------|--------------------------------------|
| `Scheduled` | Follow-up is scheduled               |
| `Completed` | Follow-up was completed              |
| `Missed`    | Follow-up was missed                 |
| `Cancelled` | Follow-up was cancelled              |

### Status Transition Rules

```
Scheduled → Completed   ✓
Scheduled → Missed      ✓
Scheduled → Cancelled   ✓
Completed → (terminal) — no further transitions
Missed → Scheduled      ✓
Cancelled → (terminal) — no further transitions
```

### Follow-up Object

| Field            | Type                                   | Description                          |
|------------------|----------------------------------------|--------------------------------------|
| `id`             | UUID                                   | Unique identifier                    |
| `organization_id`| UUID                                   | Owning organization (from JWT)       |
| `lead_id`        | UUID \| null                           | Associated lead (nullable)           |
| `appointment_id` | UUID \| null                           | Associated appointment (nullable)    |
| `type`           | `Reminder` \| `Recovery` \| `Reschedule` \| `Review Request` | Follow-up type |
| `scheduled_at`   | ISO 8601 datetime                      | Scheduled time                       |
| `channel`        | `Email` \| `Phone` \| `WhatsApp` \| `InPerson` | Communication channel |
| `status`         | `Scheduled` \| `Completed` \| `Missed` \| `Cancelled` | Current status |
| `outcome`        | string \| null                         | Outcome notes                        |
| `data_source`    | `real` \| `demo`                       | Data origin                          |
| `created_at`     | ISO 8601 datetime                      | Creation timestamp                   |
| `updated_at`     | ISO 8601 datetime                      | Last update timestamp                |

### GET /api/v1/followups

List follow-ups for the authenticated organization (and clinic if scoped).

**Query Parameters:**

| Parameter | Type   | Default | Description           |
|-----------|--------|---------|-----------------------|
| `page`    | int    | 1       | Page number (>= 1)    |
| `limit`   | int    | 20      | Results per page      |

**Response:** `200 OK`
```json
{
  "followups": [ { "id": "...", "organization_id": "...", ... } ],
  "pagination": { "page": 1, "limit": 20, "total": 42, "hasMore": true }
}
```

### GET /api/v1/followups/:id

Retrieve a single follow-up by UUID.

**Response:** `200 OK`
```json
{ "followup": { "id": "...", ... } }
```

**Errors:** `401 Unauthorized`, `404 Not Found`

### POST /api/v1/followups

Create a new follow-up.

**Request Body:**
```json
{
  "type": "Reminder",
  "scheduled_at": "2025-01-20T09:00:00Z",
  "channel": "WhatsApp",
  "lead_id": "uuid",
  "appointment_id": "uuid"
}
```

At least one of `lead_id` or `appointment_id` is recommended but not strictly required. Both are validated to belong to the authenticated organization.

**Response:** `201 Created`
```json
{ "followup": { "id": "...", "status": "Scheduled", ... } }
```

**Errors:** `400 Bad Request` (invalid payload), `401 Unauthorized`, `404 Not Found` (lead/appointment not found in organization)

### PATCH /api/v1/followups/:id

Update a follow-up. Fields are optional — at least one must be provided.

**Request Body:**
```json
{
  "scheduled_at": "2025-01-20T10:00:00Z",
  "channel": "Email",
  "status": "Completed",
  "outcome": "Patient confirmed"
}
```

**Status transition validation:** If `status` is provided, it is validated against the current status using the transition rules above. Same-status updates (e.g. `Scheduled → Scheduled`) are rejected as invalid transitions.

**Client-supplied `organization_id`, `clinic_id`, and `id` fields are stripped before processing.**

**Response:** `200 OK`
```json
{ "followup": { "id": "...", ... } }
```

**Errors:** `400 Bad Request` (invalid payload, invalid transition, no fields), `401 Unauthorized`, `404 Not Found`

---

## Tenant Isolation Details

### Appointments

- Appointments belong to an `organization_id` (from JWT).
- Appointments reference a `lead_id`, which references a `clinic_id`.
- Clinic-scoped users can only access appointments whose lead belongs to their clinic.
- Organization-scoped users (founders, org_admins) can access all appointments in their organization.

### Follow-ups

- Follow-ups belong to an `organization_id` (from JWT).
- Follow-ups reference a `lead_id` and/or `appointment_id`.
- Tenant scoping is inferred transitively through the associated lead's `clinic_id`:
  - A follow-up is visible to a clinic-scoped user if its `lead_id` or `appointment_id` links (via the appointment's `lead_id`) to a lead in that clinic.
- Organization-scoped users can access all follow-ups in their organization.

### Client Override Prevention

All PATCH routes strip `organization_id`, `clinic_id`, and `id` from the request body before processing. These values are always derived from the JWT.

---

## Error Responses

All error responses follow this format:

```json
{
  "error": {
    "status": 400,
    "message": "Human-readable error description"
  }
}
```

| Status | Meaning                          |
|--------|----------------------------------|
| 400    | Bad Request — invalid input or transition |
| 401    | Unauthorized — missing or invalid token |
| 404    | Not Found — record doesn't exist or is outside tenant scope |

---

## Test Coverage

`tests/appointments_followups.test.ts` — 41 tests covering:

**Appointments:**
- List (own org, clinic isolation, cross-org isolation)
- Get (own, cross-clinic denied, cross-org denied)
- Create (valid, missing auth, invalid lead/doctor, client clinic_id override)
- Patch (own update, cross-clinic denied, cross-org denied, client clinic_id override, valid transition, invalid transition, empty body)

**Follow-ups:**
- List (own org, clinic isolation, cross-org isolation)
- Get (own, cross-clinic denied, cross-org denied)
- Create (valid, missing auth, invalid lead/appointment, client org_id override, invalid payload)
- Patch (own update, valid status transition chain, invalid transition, cross-clinic denied, cross-org denied, client org_id override, empty body)
