# V3.0.4 Auth & Authorization

**Status:** COMPLETE
**Date:** 2026-09-15
**Phase:** V3.0.4-A (Authentication), V3.0.4-B (Authorization), V3.0.4-C (Security Hardening)

---

## 1. Overview

V3.0.4 implements authentication (who you are), authorization (what you can access), and security hardening (CORS, cookie handling, rate limiting) for the Clinic Growth System backend API.

### Milestone Breakdown

| Milestone | Focus | Status |
|---|---|---|
| V3.0.4-A | Authentication: JWT sign/verify, login, logout, /me | COMPLETE |
| V3.0.4-B | Authorization: role checks, org/clinic scoping, middleware | COMPLETE |
| V3.0.4-C | Security hardening: CORS, cookie-parser, rate limiting, refresh token rotation | COMPLETE |

---

## 2. Authentication Strategy

### 2.1 Passwordless Flow

The MVP uses passwordless authentication (per V3.0.2 architecture decisions). In development, a proof-of-concept dev login endpoint is provided. In production, OAuth integration (Google Workspace) will replace this.

### 2.2 JWT Tokens

Two types of JWTs are issued:

| Token | Purpose | Secret | Expiry | Cookie |
|---|---|---|---|---|
| Access Token | API request authentication | `JWT_SECRET` | 15 minutes (`JWT_ACCESS_EXPIRES_IN`) | Not stored in cookie; sent as `Authorization: Bearer` header |
| Refresh Token | Obtain new access token when expired | `JWT_REFRESH_SECRET` | 7 days (`JWT_REFRESH_EXPIRES_IN`) | `refresh_token` httpOnly cookie |

**JWT Claims:**

| Claim | Type | Description |
|---|---|---|
| `sub` | string | User UUID (primary key) |
| `org_id` | string | Organization ID (tenant key) |
| `role` | string | User role (`UserRole` enum) |
| `clinic_id` | string \| null | Clinic ID the user is scoped to (null for internal/founder) |
| `token_type` | `'access'` \| `'refresh'` | Token type discriminator |
| `iat` | number | Issued at (Unix timestamp) |
| `exp` | number | Expires at (Unix timestamp) |

### 2.3 Token Verification

- **Access tokens** are verified via `verifyAccessToken()`. Rejects wrong token type (`token_type !== 'access'`) and expired tokens.
- **Refresh tokens** are verified via `verifyRefreshToken()`. Rejects wrong token type (`token_type !== 'refresh'`) and expired tokens.
- Both use HS256 algorithm exclusively.
- Secrets are loaded from environment variables (`JWT_SECRET`, `JWT_REFRESH_SECRET`). In production, both are required. In development/test, fallback to `randomBytes(32)`.

### 2.4 Security Notes

- `JWT_REFRESH_SECRET` is used **only** for refresh tokens, separate from the access token secret. This allows rotating the refresh secret independently.
- Access tokens should not be stored in cookies or localStorage on the frontend in production. They are passed via the `Authorization` header.
- Refresh tokens are stored in httpOnly, sameSite=strict cookies to prevent XSS and CSRF attacks.
- Secrets must never be logged. The `neverReturnsSecrets` test verifies this in the `/me` response.

---

## 3. Authorization

### 3.1 Roles

| Role | Scope | Description |
|---|---|---|
| `org_admin` | Organization | Organization-level administrator |
| `founder` | Organization | Internal founder/owner (no clinic scoping) |
| `clinic_owner` | Clinic | Owner of one or more clinics |
| `clinic_doctor` | Clinic | Medical staff at a clinic |
| `clinic_reception` | Clinic | Reception staff at a clinic |
| `clinic_coordinator` | Clinic | Clinic coordinator |

`org_admin` and `founder` are internal roles (always have `clinic_id = NULL`).

### 3.2 Middleware

All middleware is in `src/middleware/auth.ts`:

| Function | Purpose |
|---|---|
| `setAuthContext(req, ctx)` | Sets `req.auth` with an `AuthContext` |
| `getAuthContext(req)` | Returns `req.auth` (or `undefined`) |
| `getTenantOrganizationId(req)` | Extracts `organization_id` from auth context |
| `getTenantClinicId(req)` | Extracts `clinic_id` from auth context |
| `requireAuth` | Verifies Bearer access token; rejects if missing/invalid/expired |
| `requireRole(...roles)` | Checks `req.auth.role` against allowed roles; 403 if not matched |
| `requireClinicWorkspace` | Ensures `req.auth.clinicId` is not null; 403 if internal/founder user |
| `assertOrganizationAccess(req, orgId)` | Throws `ForbiddenError` if `req.auth.organizationId !== orgId` |
| `assertClinicAccess(req, clinicId)` | Throws `ForbiddenError` if `req.auth.clinicId !== clinicId` or `clinicId` is null |

### 3.3 Authorization Model

- **Organization isolation**: Users can only access resources within their `organization_id` from the auth context.
- **Clinic isolation**: Clinic-scoped users can only access resources within their `clinic_id` from the auth context. Internal users (`founder`, `org_admin`) with `clinic_id = NULL` cannot enter clinic workspaces.
- **JWT claims are not trusted for access decisions**: The auth context is set from the verified access token's claims for the current request. For refresh operations, authority is **regenerated from the database** (see Section 5.2).

### 3.4 AuthContext Interface

```typescript
interface AuthContext {
  userId: string;       // User UUID
  organizationId: string; // Tenant org ID
  role: UserRole;       // One of the six roles
  clinicId: string | null; // Clinic UUID or null for internal users
}
```

---

## 4. API Endpoints

### 4.1 POST /api/v1/auth/dev/login

**Environment:** Development and Test only (`NODE_ENV=development|test`). Returns 400 in production.

Development proof-of-concept login. Exchanges an email for an access token + refresh token cookie.

**Request:**
```
POST /api/v1/auth/dev/login
Content-Type: application/json

{ "email": "founder@cliniciogrowth.local" }
```

**Response (200):**
```json
{
  "access_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 900
}
```

A `refresh_token` cookie is also set (httpOnly, sameSite=strict, secure in production).

**Rate limited:** Yes (5 req/min by default; see Section 6).

### 4.2 POST /api/v1/auth/refresh

**Environment:** Production and Development.

Exchanges a refresh token (from httpOnly cookie) for a new access token + rotated refresh token.

**Critical security property:** Authority is **regenerated from the database**, not trusted from the JWT refresh token claims. The refresh token's `sub` claim is used to look up the user record (`getUserById`), and the current `role`, `organization_id`, and `clinic_id` from the database are used to mint new tokens. If a user's role was changed or revoked, the new access token will reflect the database state, not the stale JWT claims.

**Request:**
```
POST /api/v1/auth/refresh
Cookie: refresh_token=<jwt>
```

**Response (200):**
```json
{
  "access_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 900
}
```

A new rotated `refresh_token` cookie is set (old refresh token is implicitly invalidated by rotation).

**Errors:**
| Status | Condition |
|---|---|
| 401 | Missing refresh_token cookie |
| 401 | Invalid or expired refresh token (bad signature, wrong type, expired) |
| 401 | User not found in database (deleted or invalid ID) |

**Rate limited:** Yes (see Section 6).

### 4.3 GET /api/v1/auth/me

**Authenticated.** Returns the current user's identity, fetched fresh from the database.

**Request:**
```
GET /api/v1/auth/me
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "user": {
    "id": "<uuid>",
    "email": "founder@cliniciogrowth.local",
    "role": "founder",
    "organization_id": "<uuid>",
    "clinic_id": null
  }
}
```

**Security:** Never returns secrets, password hashes, `data_source`, `created_at`, `updated_at`, or `deleted_at` fields.

### 4.4 POST /api/v1/auth/logout

Clears the `refresh_token` cookie. If the user is authenticated (access token in header), logs an audit event.

### 4.5 Dev-Only Proof Endpoints

**Environment:** Development and Test only.

These endpoints exist for testing and demonstrating the authorization middleware:

| Endpoint | Middleware | Purpose |
|---|---|---|
| `GET /require-role-test` | `requireAuth`, `requireRole('founder')` | Verify role-based access control |
| `GET /context-test` | `requireAuth` | Verify auth context is set correctly |
| `GET /clinic-context-test` | `requireAuth`, `requireClinicWorkspace` | Verify clinic workspace requirement |
| `GET /org-scope-test?resource_org_id=<id>` | `requireAuth` | Verify organization isolation via `assertOrganizationAccess` |
| `GET /clinic-scope-test?resource_clinic_id=<id>` | `requireAuth`, `requireClinicWorkspace` | Verify clinic isolation via `assertClinicAccess` |

---

## 5. Token Lifecycle

### 5.1 Login

1. Client calls `POST /dev/login` with email.
2. Server looks up user by email.
3. Server mints access token (15 min) and refresh token (7 days).
4. Access token returned in response body; refresh token set as httpOnly cookie.

### 5.2 Refresh

1. Client calls `POST /refresh` with `refresh_token` cookie.
2. Server verifies the refresh token signature and expiry.
3. **Server looks up user by `sub` claim from the database.** Authority is NOT trusted from the JWT — only the user ID is.
4. Server mints new access token + rotated refresh token using the **database-derived** user data.
5. New refresh token replaces the old in the cookie (rotation).

### 5.3 Logout

1. Server clears the `refresh_token` cookie (sets to empty with `maxAge: 0`).
2. If authenticated, logs an audit event.

---

## 6. Security Hardening (V3.0.4-C)

### 6.1 CORS

Configured in `src/app.ts` via `cors()` middleware:

```typescript
app.use(cors({
  origin: config.cors.origin,    // Single configured origin (default: http://localhost:5173)
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

- Uses an explicit single origin from `CORS_ORIGIN` environment variable.
- Does **not** use wildcard (`*`).
- Credentials enabled for cookie-based auth.
- Disallowed origins receive no `Access-Control-Allow-Origin` header.

### 6.2 Cookie Parser

`cookie-parser` middleware is registered after body parsers to parse `req.cookies`:

```typescript
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
```

### 6.3 Rate Limiting

Auth-sensitive endpoints are protected by an express-rate-limit middleware:

```typescript
const authRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,   // Default: 60000 (1 min)
  max: config.rateLimit.max,              // Default: 5 requests per window
  handler: (_req, res, _next) => {
    res.status(429).json({
      error: { message: 'Too many requests, please try again later.', status: 429 },
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});
```

Applied to:
- `POST /api/v1/auth/dev/login`
- `POST /api/v1/auth/refresh`

**Configuration:**
| Env Var | Default | Description |
|---|---|---|
| `AUTH_RATE_LIMIT_MAX` | `5` | Max requests per window per IP |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `60000` | Window duration in milliseconds |

**Rate-limited endpoints return:**
```json
{
  "error": {
    "message": "Too many requests, please try again later.",
    "status": 429
  }
}
```

Response headers include `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` (when `standardHeaders: true`).

### 6.4 Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | Yes (prod) | Random (dev) | Access token signing secret |
| `JWT_REFRESH_SECRET` | Yes (prod) | Random (dev) | Refresh token signing secret |
| `JWT_ACCESS_EXPIRES_IN` | No | `15m` | Access token expiry |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token expiry |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origin |
| `AUTH_RATE_LIMIT_MAX` | No | `5` | Auth rate limit max requests |
| `AUTH_RATE_LIMIT_WINDOW_MS` | No | `60000` | Auth rate limit window (ms) |

---

## 7. Test Database

Tests use `pg-mem` (in-memory PostgreSQL) with the full schema migrations. PL/pgSQL triggers are stripped via the `stripTriggers()` helper in `tests/helpers.ts` since pg-mem does not support them. The `gen_random_uuid()` function is shimmed.

Test setup (`tests/setup.ts`):
- Sets `NODE_ENV=test`
- Provides placeholder `DATABASE_URL` for module import compatibility
- Sets `JWT_SECRET` and `JWT_REFRESH_SECRET` test values
- Sets `AUTH_RATE_LIMIT_MAX=100` to avoid rate-limit interference during normal tests

Each test file creates its own `pg-mem` instance via `createTestDatabase()`.

---

## 8. Audit Logging

Auth-related events are logged to the `audit_log` table via `logAuthEvent()`:

| Action | Trigger |
|---|---|
| `login_success` | `POST /dev/login` success |
| `login_failed` | (reserved for future login failure tracking) |
| `token_refresh` | `POST /refresh` success |
| `logout` | `POST /logout` |
| `permission_denied` | (reserved for future permission tracking) |

---

## 9. Testing

Tests are in `tests/auth.test.ts` using vitest + supertest.

### 9.1 Test Coverage

| Category | Tests |
|---|---|
| Authentication (requireAuth) | Missing token → 401, invalid token → 401, expired token → 401, valid token → 200 |
| /me endpoint | Correct identity for clinic owner, founder, secret leakage prevention |
| Role authorization | Authorized role, wrong role (x2) |
| Organization isolation | Cross-org access denied (both directions) |
| Clinic isolation | Cross-clinic access denied, internal user blocked from clinic workspace, client-supplied clinic_id cannot override |
| Refresh token | Valid refresh, missing cookie → 401, malformed → 401, expired → 401, wrong type → 401, nonexistent user → 401, DB authority regeneration |
| Rate limiting | 429 after exceeding limit on actual auth routes (isolated app instance) |
| CORS | Configured origin allowed, disallowed origin rejected |

### 9.2 Rate Limit Testing Approach

Rate limit tests create an isolated app instance with `AUTH_RATE_LIMIT_MAX=3` by:
1. Setting `process.env.AUTH_RATE_LIMIT_MAX = '3'`
2. Calling `vi.resetModules()` to clear module cache
3. Dynamically importing `createApp` and `setPool` from the fresh module graph
4. Reusing the existing pg-mem pool (`memPool`)
5. Making requests to the actual `POST /api/v1/auth/dev/login` endpoint
6. Restoring env vars and resetting modules in cleanup

This tests the actual auth route wiring, not a dummy endpoint.

### 9.3 Seed Data

Tests use seed data from `migrations/00002_seed_dev_data.sql`:

| User ID | Email | Role | Organization | Clinic |
|---|---|---|---|---|
| `00000000-0000-0000-0000-000000000002` | `founder@cliniciogrowth.local` | founder | Demo Org (0001) | null |
| `00000000-0000-0000-0000-000000000003` | `owner@drkaya.demo.local` | clinic_owner | Demo Org (0001) | Clinic Kaya (0020) |
| `00000000-0000-0000-0000-000000000004` | `reception@drkaya.demo.local` | clinic_reception | Demo Org (0001) | Clinic Kaya (0020) |

---

## 10. Remaining Limitations

1. **Dev login endpoint**: `POST /dev/login` accepts only an email and returns a token unconditionally (no password/OAuth verification). This is a development-only proof-of-concept. Production authentication will use OAuth (Google Workspace) per V3.0.2 decisions.
2. **No refresh token revocation list**: Rotated refresh tokens are replaced in the cookie, but there's no server-side revocation list (blacklist). A stolen refresh token remains valid until it expires. V3.0.5+ should implement server-side refresh token tracking.
3. **Memory store rate limiting**: The express-rate-limit memory store is per-process. In a multi-instance deployment, rate limiting should use a shared store (e.g., Redis).
4. **No CSRF token**: CSRF protection relies on `SameSite=Strict` cookies and the httpOnly flag. For stricter security, double-submit CSRF tokens should be considered.
5. **pg-mem limitations**: Tests run against pg-mem (in-memory), which strips PL/pgSQL triggers. Soft-delete triggers, audit triggers, and row-level security policies that depend on triggers are NOT exercised in tests. They are validated via schema tests where possible.
