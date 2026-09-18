# V3.0.9 — Reviews, Business Outcomes & Referrals API

## Overview

This document covers the V3.0.9 backend APIs for reviews, business outcomes, and referrals.

## Authentication

All endpoints require a Bearer access token in the `Authorization` header.

```
Authorization: Bearer <jwt>
```

JWT claims: `sub`, `org_id`, `role`, `clinic_id`.

## Tenant Isolation

- `organization_id` is derived from JWT (`org_id` claim).
- `clinic_id` is derived from JWT (`clinic_id` claim) for clinic-scoped users.
- Founders and org_admins can access cross-clinics within their organization.
- Clinic-scoped users are restricted to their JWT `clinic_id`.
- Client-supplied `organization_id` and `clinic_id` are stripped from request bodies.
- All queries are scoped by `organization_id` and `deleted_at IS NULL`.

## Reviews API

**Base path:** `/api/v1/reviews`

### Status Enum

| Value       | Description                    |
|-------------|--------------------------------|
| `Requested` | Review has been requested      |
| `Received`  | Customer submitted a review    |
| `Declined`  | Customer declined to review    |

### Status Transitions

```
Requested -> Received  ok
Requested -> Declined  ok
Received  -> (terminal)
Declined  -> (terminal)
```

### Fields

| Field            | Type                              | Nullable | Default    | Description                        |
|------------------|-----------------------------------|----------|------------|------------------------------------|
| `id`             | UUID                              | no       | auto       | Primary key                        |
| `organization_id`| UUID                              | no       |            | From JWT                           |
| `clinic_id`      | UUID                              | no       |            | From JWT                           |
| `appointment_id` | UUID                              | yes      | null       | Nullable FK to appointments        |
| `requested_at`   | TIMESTAMPTZ                       | no       | NOW()      | When review was requested          |
| `status`         | `review_status` enum              | no       | `Requested`| Current status                     |
| `rating`         | INTEGER (CHECK 1-5)               | yes      | null       | Star rating 1-5                    |
| `source`         | `review_source` enum              | no       | `Other`    | Review source platform             |
| `data_source`    | `data_source` enum                | no       | `demo`     | Data origin                        |
| `created_at`     | TIMESTAMPTZ                       | no       | NOW()      | Creation timestamp                 |
| `updated_at`     | TIMESTAMPTZ                       | no       | NOW()      | Last update timestamp              |
| `deleted_at`     | TIMESTAMPTZ                       | yes      | null       | Soft-delete marker                 |

### Endpoints

#### GET /api/v1/reviews

List reviews for the authenticated organization (and clinic if scoped).

Query params: `page` (int, default 1, min 1), `limit` (int, default 20, min 1, max 100).

Response: `200 OK`
```json
{
  "reviews": [...],
  "pagination": { "page": 1, "limit": 20, "total": 5, "hasMore": false }
}
```

#### GET /api/v1/reviews/:id

Retrieve a single review by UUID.

Response: `200 OK` `{ "review": {...} }`
Errors: `401`, `404`

#### POST /api/v1/reviews

Create a new review.

Request body:
```json
{
  "appointment_id": "uuid",
  "rating": 5,
  "source": "Google"
}
```

- `appointment_id` (optional): Must belong to the authenticated organization and clinic.
- `rating` (optional): Must be 1-5.
- `source` (optional): Must be one of the `review_source` enum values.
- `clinic_id` is required from JWT (clinic-scoped access mandatory).

Response: `201 Created` `{ "review": {...} }`
Errors: `400`, `401`, `404` (invalid appointment)

#### PATCH /api/v1/reviews/:id

Update a review. At least one field must be provided.

Request body (all optional):
```json
{
  "status": "Received",
  "rating": 4,
  "source": "Practo"
}
```

- `status` transitions are validated against current status.
- Same-status transitions (e.g. `Received -> Received`) are rejected with `400`.

Response: `200 OK` `{ "review": {...} }`
Errors: `400` (invalid payload/transition/no fields), `401`, `404`

---

## Business Outcomes API

**Base path:** `/api/v1/business-outcomes`

### Confidence Level Enum

| Value    | Description                     |
|----------|---------------------------------|
| `Low`    | Low confidence attribution      |
| `Medium` | Medium confidence attribution   |
| `High`   | High confidence attribution     |

### Fields

| Field                     | Type                   | Nullable | Default | Description                        |
|---------------------------|------------------------|----------|---------|------------------------------------|
| `id`                      | UUID                   | no       | auto    | Primary key                        |
| `organization_id`         | UUID                   | no       |         | From JWT                           |
| `clinic_id`               | UUID                   | no       |         | From JWT                           |
| `appointment_id`          | UUID                   | yes      | null    | Nullable FK to appointments        |
| `amount_inr`              | NUMERIC(12,2)          | no       |         | Outcome amount in INR              |
| `recorded_at`             | TIMESTAMPTZ            | no       | NOW()   | When outcome was recorded          |
| `attribution_source`      | TEXT                   | yes      | null    | Free-text attribution source       |
| `attribution_confidence`  | `confidence_level` enum| yes      | null    | Confidence level for attribution   |
| `data_source`             | `data_source` enum     | no       | `demo`  | Data origin                        |
| `created_at`              | TIMESTAMPTZ            | no       | NOW()   | Creation timestamp                 |
| `updated_at`              | TIMESTAMPTZ            | no       | NOW()   | Last update timestamp              |
| `deleted_at`              | TIMESTAMPTZ            | yes      | null    | Soft-delete marker                 |

### Endpoints

#### GET /api/v1/business-outcomes

List business outcomes. Query params: `page`, `limit` (same as reviews).

Response: `200 OK`
```json
{
  "business_outcomes": [...],
  "pagination": { "page": 1, "limit": 20, "total": 3, "hasMore": false }
}
```

#### GET /api/v1/business-outcomes/:id

Retrieve a single business outcome by UUID.

Response: `200 OK` `{ "business_outcome": {...} }`
Errors: `401`, `404`

#### POST /api/v1/business-outcomes

Create a new business outcome.

Request body:
```json
{
  "appointment_id": "uuid",
  "amount_inr": 5000,
  "recorded_at": "2025-02-01T10:00:00Z",
  "attribution_source": "Google Reviews",
  "attribution_confidence": "High"
}
```

Response: `201 Created` `{ "business_outcome": {...} }`
Errors: `400`, `401`, `404` (invalid appointment)

#### PATCH /api/v1/business-outcomes/:id

Update a business outcome. At least one field must be provided.

Request body (all optional):
```json
{
  "amount_inr": 6000,
  "recorded_at": "2025-02-01T11:00:00Z",
  "attribution_source": "Direct",
  "attribution_confidence": "Medium"
}
```

Response: `200 OK` `{ "business_outcome": {...} }`
Errors: `400` (invalid payload/no fields), `401`, `404`

---

## Referrals API

**Base path:** `/api/v1/referrals`

### Status Enum

| Value       | Description                          |
|-------------|--------------------------------------|
| `New`       | Referral has been created            |
| `Converted` | Referred lead became a patient       |
| `Lost`      | Referral was not converted           |

### Status Transitions

```
New -> Converted  ok
New -> Lost       ok
Converted -> (terminal)
Lost -> (terminal)
```

### Fields

| Field               | Type                   | Nullable | Default  | Description                        |
|---------------------|------------------------|----------|----------|------------------------------------|
| `id`                | UUID                   | no       | auto     | Primary key                        |
| `organization_id`   | UUID                   | no       |          | From JWT                           |
| `clinic_id`         | UUID                   | no       |          | From JWT                           |
| `referring_lead_id` | UUID                   | yes      | null     | Nullable FK to leads (referrer)    |
| `referred_lead_id`  | UUID                   | yes      | null     | Nullable FK to leads (referred)    |
| `created_at`        | TIMESTAMPTZ            | no       | NOW()    | Creation timestamp                 |
| `status`            | `referral_status` enum | no       | `New`    | Current status                     |
| `outcome`           | TEXT                   | yes      | null     | Outcome notes                      |
| `data_source`       | `data_source` enum     | no       | `demo`   | Data origin                        |
| `updated_at`        | TIMESTAMPTZ            | no       | NOW()   | Last update timestamp              |
| `deleted_at`        | TIMESTAMPTZ            | yes      | null     | Soft-delete marker                 |

### Endpoints

#### GET /api/v1/referrals

List referrals. Query params: `page`, `limit` (same as reviews).

Response: `200 OK`
```json
{
  "referrals": [...],
  "pagination": { "page": 1, "limit": 20, "total": 2, "hasMore": false }
}
```

#### GET /api/v1/referrals/:id

Retrieve a single referral by UUID.

Response: `200 OK` `{ "referral": {...} }`
Errors: `401`, `404`

#### POST /api/v1/referrals

Create a new referral.

Request body:
```json
{
  "referring_lead_id": "uuid",
  "referred_lead_id": "uuid",
  "outcome": "Patient booked consultation"
}
```

- `referring_lead_id` and `referred_lead_id` (optional) are validated to belong to the authenticated organization and clinic.
- `clinic_id` is required from JWT (clinic-scoped access mandatory).

Response: `201 Created` `{ "referral": {...} }`
Errors: `400`, `401`, `404` (invalid lead)

#### PATCH /api/v1/referrals/:id

Update a referral. At least one field must be provided.

Request body (all optional):
```json
{
  "status": "Converted",
  "outcome": "Patient became regular visitor"
}
```

Response: `200 OK` `{ "referral": {...} }`
Errors: `400` (invalid payload/transition/no fields), `401`, `404`

---

## Business Rules Summary

### Reviews (appointment -> review)

A review is linked to an appointment (via `appointment_id`). The appointment must belong to the same authorized clinic scope. Review status follows the `Requested -> Received/Declined` workflow.

### Business Outcomes (appointment -> outcome)

A business outcome is linked to an appointment (via `appointment_id`). The `amount_inr` field is required and must be a non-negative integer (stored as NUMERIC(12,2)). `attribution_confidence` uses the `confidence_level` enum (`Low`, `Medium`, `High`). Outcomes are informational — no revenue forecasting or aggregation in V3.0.9.

### Referrals (lead -> referral)

A referral links a referring lead to a referred lead. Both leads (if provided) are validated to belong to the authenticated organization and clinic. Referral status follows `New -> Converted/Lost`.

## Error Responses

All errors follow the standard format:
```json
{ "error": { "status": <code>, "message": "<description>" } }
```

| Status | Meaning                                    |
|--------|--------------------------------------------|
| 400    | Bad Request — invalid input or transition  |
| 401    | Unauthorized — missing/invalid token       |
| 404    | Not Found — record outside scope or absent |
