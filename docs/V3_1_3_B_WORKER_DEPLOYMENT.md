# V3.1.3-B — Integration Worker Deployment Contract

**Status:** COMPLETE (inspection + documentation only, no code changes)
**Date:** 2026-09-19
**Prerequisite:** V3.1.3-A (`63ed1b5` — "feat: add integration event worker") is merged and pushed.

---

## 1. Current Architecture

| Tier | Technology | Deployment target (observed) | Start entrypoint |
|---|---|---|---|
| Frontend | React 18 + Vite 5 (SPA, TypeScript) | Vercel | root `npm run build` → `dist/index.html` + `dist/assets/*` |
| Backend API | Express 4 (Node.js >=20, ESM) | (no deploy config committed) | `backend/src/server.ts` |
| Integration Worker | Node.js standalone process (ESM) | (no deploy config committed) | `backend/src/workers/integrationWorker.ts` |
| Database | PostgreSQL 13+ | external | `DATABASE_URL` |

Key facts established by inspection:

- The repository is a **single git project** with two build outputs in one repo:
  - Root level = frontend (Vite). `vercel.json` rewrites **every** path to `/index.html` (SPA fallback). Root `tsconfig.json` has `references: []` and `noEmit: true` — it does **not** compile the backend.
  - `backend/` = a nested Node project with its own `package.json`, `tsconfig.json`, `migrations/`, `src/`, `tests/`.
- The backend API is **not** currently deployed from this repo: there is **no `render.yaml`, no `Dockerfile`, no `.github/workflows`, no Dockerfile** anywhere in the tree (verified by filesystem + `git ls-files`).
- The frontend communicates only with the **API**. It has **no path to the worker**. The worker communicates only with PostgreSQL (via the `pg` pool) and with external providers through the backend's `services/providers/*` (SendGrid email provider). The worker does **not** expose or consume any API route.
- `backend/dist/` is gitignored (root `.gitignore` has `dist`), so build artifacts are produced at deploy time, not committed.

## 2. API Process Contract

- Framework: Express 4 (`backend/src/app.ts` is the app factory; `src/server.ts` is the entrypoint).
- `app.ts` mounts routes under `/api/v1` (e.g., `/api/v1/health`, `/api/v1/auth`, `/api/v1/integrations`, `/api/v1/ai`).
- The API **listens** on `config.server.port` (default `3001`) in `src/server.ts`.
- The API process is a normal Express HTTP server with CORS, cookie-parser, JSON body parsing, an `audit`/`requestLogger` middleware, a centralized `errorHandler`, and process-level `unhandledRejection`/`uncaughtException` handling that triggers graceful shutdown.
- API does **not** call the integration worker; the API and worker are two independent processes that share only the database and the `integration_events` outbox table.

## 3. Worker Process Contract

- File: `backend/src/workers/integrationWorker.ts`.
- The worker **does not import Express**, **does not import `app.ts`/`server.ts`**, and **does not call `app.listen()`**. (Verified by source inspection and by grep — no matches for `app`, `server`, `express`, or `listen`.)
- Lifecycle: `runCycle()`, `startWorker()`, `gracefulShutdown()`, `requestShutdown()`, `isShuttingDown()`.
- `startWorker()` calls `createPool()` (reuses the existing `pg.Pool` factory; max 20, `idleTimeoutMillis` 30000, `connectionTimeoutMillis` 5000), runs **one cycle immediately**, then schedules subsequent cycles via a single `setTimeout` (not an overlapping `setInterval`).
- A `currentCycle` guard prevents overlapping cycles within a single process: while a cycle is in flight, no new cycle is scheduled; the next cycle is scheduled only after the prior one settles.
- The worker auto-starts **only when executed directly** (`node .../integrationWorker.js`), via an ESM `isMainModule()` check (`fileURLToPath(import.meta.url) === process.argv[1]`). Importing the module does **not** start it.
- `process.exit(0)` appears **only** in the `SIGINT`/`SIGTERM` signal-handler wrapper inside the direct-run block — **never** in `gracefulShutdown()` or any other testable/exported function.
- Per-cycle errors are caught (`runCycle().catch(...)`); the worker stays alive and reschedules.
- The worker processes the batch **serially** (one `processIntegrationEvent` `await` after another per cycle).

## 4. Build Output

Backend build (run from `backend/`):

```
npm run build    # = tsc -p tsconfig.json
```

Backend `tsconfig.json` uses `outDir: "dist"` with `rootDir: "."` and `include: ["src/**/*", "tests/**/*", "migrations/**/*"]`, so the common-root directory layout is preserved and **`src/` is retained under `dist/`**.

Verified artifacts (after `npm run build`):

| Source | Compiled output |
|---|---|
| `src/server.ts` | `dist/src/server.js` |
| `src/workers/integrationWorker.ts` | `dist/src/workers/integrationWorker.js` |

> Note: the emitted files live under `dist/src/...`, **not** `dist/...` directly. See Known Gap #1.

## 5. Start Commands

Run from the `backend/` directory (after `npm ci` / `npm install` and `npm run build`):

| Process | Start command |
|---|---|
| API | `node dist/src/server.js` |
| Integration Worker | `node dist/src/workers/integrationWorker.js` |

From the repository root, prefix with `backend/`:

```
node backend/dist/src/server.js
node backend/dist/src/workers/integrationWorker.js
```

Environment variables (see §6) must be provided before the process starts.

## 6. Required Environment Variables

**Both processes construct the shared `config` object at module load** (`backend/src/config/index.ts`, Zod-validated). They therefore have overlapping requirements.

| Variable | Required? | Default | Used by |
|---|---|---|---|
| `DATABASE_URL` | **Yes (both)** | — | API pool; Worker pool. `z.string().url()` — startup throws if missing/invalid. |
| `NODE_ENV` | Optional | `development` | Both. `production` enables stricter checks. |
| `PORT` | Optional | `3001` | API only. |
| `LOG_LEVEL` | Optional | `info` | Both. |
| `INTEGRATION_ENCRYPTION_KEY` | For SendGrid events | (unset) | Worker SendGrid processing path (`services/integrationConfigs.ts` decrypts provider secrets). Worker still starts if unset; SendGrid events then fail and are marked `failed` (graceful, not a crash). |
| `INTEGRATION_WORKER_INTERVAL_MS` | Optional | `30000` | Worker. Cycles between due-event batches (ms). |
| `INTEGRATION_WORKER_BATCH_SIZE` | Optional | `50` | Worker. `LIMIT` for the due-event SELECT. |
| `JWT_SECRET` | **Yes if `NODE_ENV=production`** | random per boot (dev/test only) | API. NOTE: the worker imports `config`, so **`JWT_SECRET` and `JWT_REFRESH_SECRET` must also be set in production for the worker to even load** — the worker does not use them, but `config.jwt.secret` throws at config-construction time when `NODE_ENV=production` and they are absent. |
| `JWT_REFRESH_SECRET` | **Yes if `NODE_ENV=production`** | random per boot (dev/test only) | API; same worker caveat as `JWT_SECRET`. |
| `CORS_ORIGIN` | Optional | `http://localhost:5173` | API CORS. Worker loads config but ignores. |
| `AUTH_RATE_LIMIT_MAX` / `_WINDOW_MS` | Optional | `5` / `60000` | API auth rate limiting. Worker ignores. |

No secret values are duplicated into source. Provider credentials (e.g., SendGrid API keys) live per-organization in the `integration_configs` table (encrypted at rest), **not** in env. `INTEGRATION_ENCRYPTION_KEY` is the envelope key that decrypts those rows.

## 7. Failure / Restart Behavior

Uses the **existing** code paths — no new retry logic was added.

| Scenario | Behavior in current code |
|---|---|
| **A. Worker process crashes** (uncaught) | All known error paths in the worker are caught (`runCycle().catch`; per-event `try/catch` inside `processDueIntegrationEvents`). A crash would therefore require an unanticipated, un-caught error (or an un-caught rejection outside a cycle). The process exits non-zero; the platform supervisor restarts it. Because due events persist in `integration_events` with `status='pending'`/`'retry'`, they remain `due` after restart and are selected again on the next cycle. No event is lost. |
| **B. SendGrid is unavailable** | `emailProvider.send` returns `{ success:false, error }`; `processIntegrationEvent` moves the event to `retry` (`retry_count` +1, `next_retry_at = calculateNextRetryAt(retry_count)` with backoff `60s → 300s → 900s`), or to `failed` when `retry_count` exceeds `MAX_INTEGRATION_RETRIES` (3). The worker simply re-selects the now-`retry` row once `next_retry_at <= NOW()` on a future cycle. A 10s per-request timeout (`REQUEST_TIMEOUT_MS`) bounds each attempt. |
| **C. Database connection fails** | `getClient()` throws inside `processDueIntegrationEvents`; the cycle's `await` rejects and is caught by `runCycle().catch`, which logs `integration_worker_cycle_error` and reschedules. `pg`'s `pool.on('error')` also logs idle-client errors. The worker stays alive and retries on the next interval. |
| **D. One integration event fails** | `processDueIntegrationEvents` wraps each event in its own `try/catch`; a per-event failure is counted as `failed` and the loop continues. An unexpected throw from `processIntegrationEvent` is also counted `failed`. The batch always runs to completion. |
| **E. Worker is restarted** | `startWorker()` runs **one cycle immediately on startup** (before scheduling the interval timer), so any pending/due events accumulated during downtime are picked up right away. Events are never lost; they wait in the outbox. |

## 8. Graceful Shutdown Behavior

- Registered **only when run directly** (inside the `isMainModule()` block): `process.on('SIGINT', ...)` and `process.on('SIGTERM', ...)`.
- On signal: `gracefulShutdown()` → `requestShutdown()` (sets `shutdownRequested = true`, clears the **pending** `setTimeout` via `clearTimeout`) → `await currentCycle` (the in-flight cycle is allowed to finish) → `await closePool()` (`pool.end()`) → `process.exit(0)`.
- `gracefulShutdown()`, `requestShutdown()`, `isShuttingDown()`, `runCycle()`, `startWorker()` **do not call `process.exit`** — only the signal-handler wrapper does (verified by source inspection).
- Because the worker uses a **single scheduled `setTimeout`** (not `setInterval`), there is at most one pending cycle scheduled; shutdown clears it cleanly.
- **Caveat:** the worker imposes **no hard timeout** on the in-flight cycle during shutdown (unlike `server.ts`, which enforces a 10-second forced shutdown). If a cycle is mid-batch with many 10s-SendGrid-timeout calls, shutdown will wait for the whole cycle. This is bounded by `batch_size * max_provider_time` per signal. (See Known Gap #2.)

## 9. Duplicate-Worker Behavior (Concurrency)

- **Within one worker instance:** cycle overlap is impossible — the `currentCycle` guard makes `scheduleNext` return early while a cycle is in flight.
- **Across two worker processes:** there is **no distributed/mutual-exclusion lock**. Both processes can `SELECT ... due events ... LIMIT N` and both can attempt the same rows. Per-event safety is provided by `processIntegrationEvent`:
  - `BEGIN; SELECT ... FOR UPDATE;` (row lock) on each event,
  - status-gated `UPDATE ... WHERE id = $1 AND status IN ('pending','retry')` with `rowCount === 0` check → throws `BadRequestError('Integration event was modified by a concurrent process')`.
  - Result: **no double-send** (correctness is preserved by the row lock + status-gated UPDATE), but the **losing** process throws, which `processDueIntegrationEvents` catches and counts as `failed` — the losing process does **not** retry the lock-step (it does not set `retry_count`/`next_retry_at`). Under concurrent duplicate workers, legitimately-due events can therefore be **skipped-and-marked-failed** rather than retried.
- **Pool pressure:** each event consumes a short-lived client (acquired per `processIntegrationEvent`). `pg.Pool` max is 20 per process. Two workers each at max-20 could saturate the database's role/connection limit under load.
- **Mitigation required:** deploy **exactly one** worker instance. Do not run two `integrationWorker.js` processes against the same database unless a distributed lock is added (future work).

## 10. Production Deployment Assumptions

1. Frontend is served by Vercel (already configured via `vercel.json` / root `vite build`).
2. Backend API and worker are deployed as **two separate processes/containers**, both running from the same `backend/` build (`npm run build`).
3. Both processes share the same PostgreSQL database (single `DATABASE_URL`/tenant schema with `organization_id` scoping, no per-service DB).
4. The worker must be started with `node dist/src/workers/integrationWorker.js` (see §5).
5. Both processes require at minimum `DATABASE_URL`; the API further requires JWT secrets in production; the worker needs `INTEGRATION_ENCRYPTION_KEY` if any SendGrid (email) events are to be processed.

## 11. Known Gaps

1. **`package.json` start/main mismatch (pre-existing, not introduced by V3.1.3-A/B).** `backend/package.json` declares `"start": "node dist/server.js"` and `"main": "dist/server.js"`, but the actual build output (from `rootDir: "."`) is `dist/src/server.js` / `dist/src/workers/integrationWorker.js`. Therefore `npm start` does **not** launch the API in the current configuration. The API and worker must be started with the explicit `dist/src/...` paths. (Proposed fix — **not applied** in this doc-only milestone: either change `tsconfig.json` `rootDir` to `"src"` so output is `dist/server.js`, or fix the `start`/`main` script to `dist/src/server.js`.)
2. **Worker has no health/liveness HTTP probe.** There is intentionally no Express server in the worker. Operational health is observable **only** via structured `pino` log events:
   - `integration_worker_started` (startup, emits `intervalMs`/`batchSize`)
   - `integration_events_batch_processed` (per cycle: `processed`/`succeeded`/`retried`/`failed`)
   - `integration_worker_cycle_error` (cycle-level error)
   - `integration_worker_stopped` (clean shutdown)
   A deployment platform cannot HTTP-probe the worker; it must rely on process liveness (exit code) and log presence.
3. **No `npm run` convenience script for the worker.** There is no `worker` script in `backend/package.json`. (Proposed, not added: `"worker": "node dist/src/workers/integrationWorker.js"` — only if a deployment platform requires a script reference instead of a direct `node` command.)
4. **Worker has no `unhandledRejection`/`uncaughtException` process handler** (`server.ts` has one; the worker does not). Currently all error paths are explicitly caught, but a future unhandled rejection could crash the process unexpectedly with minimal logging.
5. **Serial per-event processing.** A cycle processes events one-by-one; with a 10s SendGrid per-request timeout and batch size 50, a cycle can take up to ~50 × provider-latency. Long cycles delay graceful shutdown (no hard timeout — see §8).
6. **Singleton requirement.** No distributed locking exists between worker instances (§9). The deployment must guarantee a single running worker (e.g., a single Render Background Worker service, a `RestartPolicy: OnFailure` + single replica, or an external scheduler).
7. **No deployment configuration in the repo.** There is no `render.yaml`/`Dockerfile`/`.github`. The "smallest production model" (one API web service + one worker/background service) is **conceptual only** until a deploy manifest is added. This milestone deliberately does not add one.

## 12. Next Implementation Step

Add an infrastructure/deployment manifest (e.g., `render.yaml`) defining **two services** from the single `backend/` service definition:

- **API web service** — build `cd backend && npm install && npm run build`; start `node dist/src/server.js`; health check `GET /api/v1/health` (200=healthy, 503=degraded).
- **Background worker** — same build; start `node dist/src/workers/integrationWorker.js`; no HTTP health check (rely on process liveness + logs).

In the same next step, also resolve Known Gap #1 (align the `npm start` script or `rootDir` so the documented command works), and (optional, separate concern) harden the ESM `isMainModule()` detection if the target platform invokes the worker with a path that does not resolve to an absolute `argv[1]`.

---

### Validation performed in this milestone

- `npm run build` (in `backend/`) → **succeeds**; `dist/src/server.js` and `dist/src/workers/integrationWorker.js` are emitted.
- The existing `tests/integrationWorker.test.ts` (14 tests) and `tests/integrations.test.ts` (49 tests) — both green from V3.1.3-A.
- `npx tsc --noEmit` — clean; `npx eslint src/ tests/` — clean (carried over from V3.1.3-A validation).
- Manual smoke test: `node dist/src/workers/integrationWorker.js` (relative, from `backend/`) with a dummy `DATABASE_URL` logged `integration_worker_started` (intervalMs 30000, batchSize 50) and then a caught `integration_worker_cycle_error` (ECONNREFUSED to the dummy DB) — i.e., the entrypoint auto-start works and a cycle-level error is contained (worker stayed alive). Process was stopped afterward; no secrets were logged.

No application code or deployment files were modified in this milestone.
