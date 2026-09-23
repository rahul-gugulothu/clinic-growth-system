# V3.0.6 — Clinic Workspace API

## Overview

The Clinic Workspace API provides endpoints for managing clinics, doctors, and staff within the
Clinic Growth System. Clinic creation is restricted to the onboarding flow (prospect → clinic).
No standalone `POST /clinics` endpoint exists.

## Authentication

All endpoints require a valid JWT access token (15-minute expiry) in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Obtained via `POST /api/v1/auth/dev/login`. The refresh token is stored in an httpOnly cookie.

## Organization Scope

Organization identity comes **exclusively** from the JWT (`org_id` claim). The server never trusts
a client-supplied `organization_id`. All SQL queries include `organization_id = <JWT org_id>` in
the WHERE clause, guaranteeing tenant isolation.

## Clinic Scope

Clinic identity comes **exclusively** from the JWT (`clinic_id` claim). For clinic-scoped users
roles: `clinic_owner`, `clinic_doctor`, `clinic_reception`, `clinic_coordinator`), the `clinic_id`
in the JWT is the authority. For internal roles (`founder`, `org_admin`), `clinic_id` is `null`
and they may access any clinic within their organization.

Client-supplied `clinic_id` or `organization_id` fields in request bodies are **silently ignored**.
Queries always derive scope from the JWT context.

## Endpoints

### Clinics

#### `GET /api/v1/clinics/:id`

Retrieve a clinic by ID.

- **Auth:** Requires a valid access token.
- **Clinic-scoped users:** May only read their own clinic (JWT `clinic_id` must match `:id`).
- **Internal users:** May read any clinic within their organization.
- **Returns:** `200 { clinic: { ... } }`
- **Errors:** `401` (no/invalid token), `403` (cross-clinic access for clinic-scoped users),
  `404` (clinic not found or belongs to another organization).

#### `PATCH /api/v1/clinics/:id`

Update a clinic by ID.

- **Auth:** Requires a valid access token.
- **Authorization:** Same as GET above.
- **Body:**
  ```json
  {
    "name": "string (optional)",
    "specialty": "string (optional)",
    "address": "string (optional)",
    "city": "string (optional)",
    "phone": "string (optional)",
    "website": "string (url, nullable, optional)",
    "whatsapp_number": "string (nullable, optional)",
    "working_hours": "string (nullable, optional)",
    "status": "Onboarding | Active | Paused | Churned (optional)"
  }
  ```
- **`clinic_id` and `organization_id` in body** are stripped and ignored.
- **Returns:** `200 { clinic: { ... } }`
- **Errors:** `401`, `403`, `404`, `400` (empty body / invalid fields).

### Onboarding

#### `POST /api/v1/onboarding/prospect/:prospectId`

Convert a prospect into a clinic workspace.

- **Auth:** Requires a valid access token.
- **Roles:** `founder` or `org_admin` only (internal roles).
- **Rules:**
  1. The prospect must exist and belong to the authenticated organization.
  2. The prospect must not already have a clinic (`uq_clinics_prospect_id` unique constraint).
  3. No standalone clinic creation endpoint — onboarding is the sole clinic-creation path.
- **Body (optional):**
  ```json
  {
    "address": "string (optional — defaults to prospect area)",
    "whatsapp_number": "string (nullable, optional)",
    "working_hours": "string (nullable, optional)"
  }
  ```
- **Field Mapping (prospect → clinic):**
  - `clinic.name` ← `prospect.clinic_name`
  - `clinic.specialty` ← `prospect.specialty`
  - `clinic.city` ← `prospect.area`
  - `clinic.phone` ← `prospect.phone`
  - `clinic.website` ← `prospect.website`
  - `clinic.status` ← `'Onboarding'` (schema default)
  - `clinic.prospect_id` ← `:prospectId`
- **Returns:** `201 { clinic: { ... } }`
- **Errors:** `401` (no token), `403` (non-internal role), `404` (prospect not found or
  belongs to another org), `400` (duplicate onboarding — prospect already has a clinic).

### Doctors

#### `GET /api/v1/clinics/:clinicId/doctors`

List doctors for a specific clinic.

- **Auth:** Requires a valid access token.
- **Clinic-scoped users:** `:clinicId` must match JWT `clinic_id`.
- **Internal users:** May list doctors for any clinic in their organization.
- **Returns:** `200 { doctors: [ ... ] }`
- **Errors:** `401`, `403` (cross-clinic for clinic-scoped users).

#### `GET /api/v1/doctors/:id`

Retrieve a doctor by ID.

- **Auth:** Requires a valid access token.
- **Clinic-scoped users:** The doctor must belong to their JWT `clinic_id`.
- **Internal users:** The doctor must belong to their organization.
- **Returns:** `200 { doctor: { ... } }`
- **Errors:** `401`, `400` (invalid UUID), `404` (not found or not in tenant scope).

#### `POST /api/v1/clinics/:clinicId/doctors`

Create a doctor in a specific clinic.

- **Auth:** Requires a valid access token.
- **Clinic-scoped users:** `:clinicId` must match JWT `clinic_id`.
- **Body:**
  ```json
  {
    "name": "string (required)",
    "specialty": "string (required)",
    "role": "Owner | Consultant | Resident (required)",
    "status": "Active | Inactive (optional, defaults to Active)"
  }
  ```
- **`clinic_id` in body** is ignored. The clinic scope is derived from the route parameter
  (verified against JWT).
- **Returns:** `201 { doctor: { ... } }`
- **Errors:** `401`, `403`, `400` (invalid/missing fields).

#### `PATCH /api/v1/doctors/:id`

Update a doctor by ID.

- **Auth:** Requires a valid access token.
- **Clinic-scoped users:** The doctor must belong to their JWT `clinic_id`.
- **Internal users:** The doctor must belong to their organization.
- **Body:** Any subset of `{ name, specialty, role, status }`.
- **`clinic_id` and `organization_id` in body** are stripped and ignored.
- **Returns:** `200 { doctor: { ... } }`
- **Errors:** `401`, `400` (empty body), `404` (not found or not in tenant scope).

### Staff

#### `GET /api/v1/clinics/:clinicId/staff`

List staff for a specific clinic. (Same scoping rules as doctors list.)

- **Returns:** `200 { staff: [ ... ] }`

#### `GET /api/v1/staff/:id`

Retrieve a staff member by ID. (Same scoping rules as doctors get.)

- **Returns:** `200 { staff: { ... } }`

#### `POST /api/v1/clinics/:clinicId/staff`

Create a staff member in a specific clinic.

- **Body:**
  ```json
  {
    "name": "string (required)",
    "role": "Reception | Coordinator | Manager (required)",
    "email": "string (email, nullable, optional)",
    "phone": "string (nullable, optional)",
    "status": "Active | Inactive (optional, defaults to Active)"
  }
  ```
- **`clinic_id` in body** is ignored.
- **Returns:** `201 { staff: { ... } }`

#### `PATCH /api/v1/staff/:id`

Update a staff member by ID.

- **Body:** Any subset of `{ name, role, email, phone, status }`.
- **`clinic_id` and `organization_id` in body** are stripped and ignored.
- **Returns:** `200 { staff: { ... } }`

## Authorization Rules Summary

| User Role | Organization Access | Clinic Access |
|---|---|---|
| `founder` | All records in organization | All clinics in organization |
| `org_admin` | All records in organization | All clinics in organization |
| `clinic_owner` | All records in organization | Only JWT clinic only |
| `clinic_doctor` | Their clinic only | Their JWT clinic only |
| `clinic_reception` | Their clinic only | Their JWT clinic only |
| `clinic_coordinator` | Their clinic only | Their JWT clinic only |

## Tenant Authority Rules

1. **Organization authority** = JWT `org_id`. Never trusted from request body.
2. **Clinic authority** = JWT `clinic_id` for clinic-scoped users. Never trusted from request body.
3. **Route `:clinicId`** — For clinic-scoped users, must match JWT `clinic_id`. For internal roles, org membership verified in DB query.
4. **Cross-organization** — Always blocked via `organization_id` in SQL WHERE clause.
5. **Doctor/staff scope** — Clinic-scoped users' queries include `clinic_id = <JWT clinic_id>`. Internal users' queries only filter by `organization_id`.
6. **Update scope** — Clinic-scoped users can only UPDATE records within their clinic. Updates use `WHERE id = $1 AND organization_id = $2 AND clinic_id = $3`.

## Error Response Format

All errors return:
```json
{ "error": { "message": "string", "status": 400 | 401 | 403 | 404 }
}
```

## Onboarding Rule

Clinic creation is onboarding-only. The `POST /api/v1/onboarding/prospect/:prospectId` endpoint:
- Requires `founder` or `org_admin` role.
- Verifies the prospect belongs to the authenticated organization.
- Rejects duplicate onboarding (prospect already converted to clinic).
- Creates the clinic with `status = 'Onboarding'`, `prospect_id` linked.
- No `POST /api/v1/clinics` endpoint exists in the API.
