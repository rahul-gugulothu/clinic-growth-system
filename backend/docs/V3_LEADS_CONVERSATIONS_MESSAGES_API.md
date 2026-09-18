# V3.0.7 — Leads, Conversations & Messages API

## Overview

V3.0.7 extends the clinic workspace API with three related entities:

1. **Leads** — patient/inbound inquiries at the clinic level
2. **Conversations** — communication threads tied to a lead
3. **Messages** — individual messages within a conversation thread

All three entities are tenant-scoped. The `organization_id` is always derived from the JWT. Clinic-scoped users (roles: `clinic_owner`, `clinic_doctor`, `clinic_reception`, `clinic_coordinator`) are restricted to their own clinic. Internal users (`founder`, `org_admin`) can access resources across all clinics within their organization.

---

## Entity Relationships

```
organizations
  └── clinics (organization_id → organizations.id)
        └── leads (clinic_id → clinics.id, organization_id → organizations.id)
              └── conversations (lead_id → leads.id, organization_id → organizations.id)
                    └── messages (conversation_id → conversations.id, organization_id → organizations.id)
                      └── staff (id, referenced by leads.assigned_staff_id and conversations.assigned_staff_id)
```

- A **Lead** belongs to one clinic and one organization.
- A **Conversation** belongs to one lead.
- A **Message** belongs to one conversation.
- The `assigned_staff_id` on leads and conversations optionally references a staff member within the same organization.

---

## Authentication

All endpoints require a valid access JWT in the `Authorization: Bearer <token>` header.

JWT claims used:
- `sub` → user ID
- `org_id` → organization ID (always authoritative for tenant scope)
- `role` → user role
- `clinic_id` → clinic ID (nullable for internal roles)

### Tenant Scoping Rules

| User Role | `organization_id` Source | `clinic_id` Source |
|-----------|------------------------|-------------------|
| `founder`, `org_admin` | JWT `org_id` | Must be specified in request body and validated against the organization |
| `clinic_owner`, `clinic_doctor`, `clinic_reception`, `clinic_coordinator` | JWT `org_id` | JWT `clinic_id` (authoritative — client-supplied values are ignored) |

**Never trust client-supplied `organization_id` or `clinic_id`.** These fields are stripped from update payloads. On create, `organization_id` always comes from JWT. For clinic-scoped users, `clinic_id` always comes from JWT.

---

## LEADS

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/leads` | List leads (paginated) |
| GET | `/api/v1/leads/:id` | Get a single lead |
| POST | `/api/v1/leads` | Create a new lead |
| PATCH | `/api/v1/leads/:id` | Update a lead |

### List Leads — `GET /api/v1/leads`

**Query Parameters (pagination):**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer (min 1) | 1 | Page number |
| `limit` | integer (1–100) | 20 | Results per page |

**Response `200`:**
```json
{
  "leads": [
    {
      "id": "uuid",
      "organization_id": "uuid",
      "clinic_id": "uuid",
      "source": "Web Form",
      "created_at": "2025-01-01T00:00:00Z",
      "service_interested": "Dermatology",
      "status": "New",
      "assigned_staff_id": "uuid" | null,
      "last_contact_at": "2025-01-01T00:00:00Z" | null,
      "next_action": "Call back" | null,
      "data_source": "demo",
      "updated_at": "2025-01-01T00:00:00Z",
      "deleted_at": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "hasMore": false
  }
}
```

**Tenant Scoping:**
- Clinic-scoped users see only leads where `clinic_id = JWT.clinic_id`
- Internal users see leads across all clinics in `JWT.org_id`
- All SQL queries filter by `organization_id` in the WHERE clause

### Get Lead — `GET /api/v1/leads/:id`

**Response `200`:**
```json
{
  "lead": {
    "id": "uuid",
    "organization_id": "uuid",
    "clinic_id": "uuid",
    "source": "Web Form",
    "created_at": "...",
    "service_interested": "Dermatology" | null,
    "status": "New",
    "assigned_staff_id": "uuid" | null,
    "last_contact_at": "..." | null,
    "next_action": "..." | null,
    "data_source": "demo",
    "updated_at": "...",
    "deleted_at": null
  }
}
```

**Errors:**
- `401` — Missing or invalid token
- `404` — Lead not found (or belongs to a different clinic/organization)

### Create Lead — `POST /api/v1/leads`

**Request Body:**
```json
{
  "clinic_id": "uuid",        // Required for internal users; ignored for clinic-scoped users
  "source": "Web Form",       // Required
  "service_interested": "Dermatology",  // Optional
  "status": "New",            // Optional, default: "New"
  "assigned_staff_id": "uuid", // Optional, must belong to same organization
  "last_contact_at": "2025-01-01T00:00:00Z",  // Optional
  "next_action": "Call back"   // Optional
}
```

**Response `201`:**
```json
{
  "lead": { ... }
}
```

**Behavior:**
- `organization_id` is always set from JWT
- For clinic-scoped users, `clinic_id` is set from JWT (body value ignored)
- For internal users, `clinic_id` must be provided in body and validated against the organization
- If `assigned_staff_id` is provided, the staff must exist and belong to the same organization

**Errors:**
- `400` — Invalid payload, no fields to update, or `clinic_id` missing for internal user
- `401` — Missing or invalid token
- `404` — Specified `clinic_id` or `assigned_staff_id` not found in organization

### Update Lead — `PATCH /api/v1/leads/:id`

**Request Body:**
```json
{
  "source": "Updated Source",       // Optional
  "service_interested": "Hair Loss", // Optional
  "status": "Contacted",            // Optional
  "assigned_staff_id": "uuid" | null, // Optional
  "last_contact_at": "2025-01-01T00:00:00Z",  // Optional
  "next_action": "Send proposal"   // Optional
}
```

**Response `200`:**
```json
{
  "lead": { ... }
}
```

**Behavior:**
- `organization_id` and `clinic_id` in the body are silently stripped
- Clinic-scoped users can only update leads in their own clinic
- Internal users can update leads across clinics in their organization

**Errors:**
- `400` — Invalid payload or no fields to update
- `401` — Missing or invalid token
- `404` — Lead not found

---

## CONVERSATIONS

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/leads/:leadId/conversations` | List conversations for a lead |
| GET | `/api/v1/conversations/:id` | Get a single conversation |
| POST | `/api/v1/leads/:leadId/conversations` | Create a conversation for a lead |
| PATCH | `/api/v1/conversations/:id` | Update a conversation |

### List Conversations — `GET /api/v1/leads/:leadId/conversations`

**Query Parameters (pagination):** Same as Leads list.

**Response `200`:**
```json
{
  "conversations": [
    {
      "id": "uuid",
      "organization_id": "uuid",
      "lead_id": "uuid",
      "channel": "WhatsApp",
      "started_at": "2025-01-01T00:00:00Z",
      "last_message_at": "2025-01-01T00:00:00Z" | null,
      "assigned_staff_id": "uuid" | null,
      "status": "Open",
      "data_source": "demo",
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

**Behavior:**
- The lead must belong to the authenticated organization
- Clinic-scoped users can only list conversations for leads in their clinic
- The lead is validated before listing conversations

### Get Conversation — `GET /api/v1/conversations/:id`

**Response `200`:**
```json
{
  "conversation": { ... }
}
```

**Errors:**
- `401` — Missing or invalid token
- `404` — Conversation not found (or belongs to a different clinic/organization)

### Create Conversation — `POST /api/v1/leads/:leadId/conversations`

**Request Body:**
```json
{
  "channel": "WhatsApp",       // Required
  "assigned_staff_id": "uuid"  // Optional, must belong to same organization
}
```

**Response `201`:**
```json
{
  "conversation": {
    "id": "uuid",
    "organization_id": "uuid",
    "lead_id": "uuid",
    "channel": "WhatsApp",
    "started_at": "2025-01-01T00:00:00Z",
    "last_message_at": null,
    "assigned_staff_id": "uuid" | null,
    "status": "Open",
    "data_source": "demo",
    "created_at": "...",
    "updated_at": "..."
  }
}
```

**Behavior:**
- The lead must belong to the authenticated organization and (for clinic-scoped users) the user's clinic
- `organization_id` is set from JWT
- `status` defaults to `"Open"`
- `started_at` and `created_at` are set to `NOW()`

### Update Conversation — `PATCH /api/v1/conversations/:id`

**Request Body:**
```json
{
  "channel": "Email",          // Optional
  "assigned_staff_id": "uuid" | null,  // Optional
  "status": "Closed"           // Optional
}
```

**Response `200`:**
```json
{
  "conversation": { ... }
}
```

**Errors:**
- `400` — Invalid payload or no fields to update
- `401` — Missing or invalid token
- `404` — Conversation not found

---

## MESSAGES

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/conversations/:conversationId/messages` | List messages in a conversation |
| POST | `/api/v1/conversations/:conversationId/messages` | Create a message in a conversation |

### List Messages — `GET /api/v1/conversations/:conversationId/messages`

**Query Parameters (pagination):** Same as Leads list.

**Response `200`:**
```json
{
  "messages": [
    {
      "id": "uuid",
      "organization_id": "uuid",
      "conversation_id": "uuid",
      "sender": "clinic",
      "body": "Hello from clinic",
      "sent_at": "2025-01-01T00:00:00Z",
      "data_source": "demo",
      "created_at": "2025-01-01T00:00:00Z",
      "deleted_at": null
    }
  ],
  "pagination": { ... }
}
```

**Behavior:**
- The conversation must be authorized (belong to the organization and, for clinic-scoped users, the lead must belong to the user's clinic)
- Messages are returned in `sent_at` ascending order (chronological)

### Create Message — `POST /api/v1/conversations/:conversationId/messages`

**Request Body:**
```json
{
  "sender": "clinic",  // Required: "clinic" | "lead" | "system"
  "body": "Follow-up message"  // Required, minimum 1 character
}
```

**Response `201`:**
```json
{
  "message": {
    "id": "uuid",
    "organization_id": "uuid",
    "conversation_id": "uuid",
    "sender": "clinic",
    "body": "Follow-up message",
    "sent_at": "2025-01-01T00:00:00Z",
    "data_source": "demo",
    "created_at": "...",
    "deleted_at": null
  }
}
```

**Behavior:**
- The conversation must be authorized
- `organization_id` is set from JWT
- `sent_at` and `created_at` are set to `NOW()`

### Message Sender Values

| Sender | Description |
|--------|-------------|
| `clinic` | Message sent by a clinic staff/user |
| `lead` | Message received from a lead/patient |
| `system` | Automated/system message |

---

## Error Behavior

All errors follow the project's standard error format:

```json
{
  "error": {
    "status": 403,
    "message": "Access denied to this resource"
  }
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request — invalid payload, missing required fields, or no fields to update |
| 401 | Unauthorized — missing or invalid JWT |
| 403 | Forbidden — insufficient permissions or cross-clinic/organization access denied |
| 404 | Not found — resource does not exist or is not accessible within tenant scope |
| 500 | Internal server error |

---

## Tenant Isolation Summary

- **All SQL queries** filter by `organization_id` in WHERE clauses
- **Clinic-scoped users** are further filtered by `clinic_id` throughout
- **Client-supplied `organization_id`** is never trusted — always overwritten by JWT
- **Client-supplied `clinic_id`** on create is validated against the organization before use; for clinic-scoped users, JWT `clinic_id` is always used
- **Cross-tenant access** returns `404` (not `403`) to avoid leaking resource existence
- **Client-scoped users** accessing another clinic's resource returns `404`
- **Clinic-scoped users accessing other clinic's conversation/messages** returns `404`
