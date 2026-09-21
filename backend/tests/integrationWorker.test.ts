import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { setPool } from '../src/db/index.js';
import { processDueIntegrationEvents } from '../src/services/integrations.js';
import { setIntegrationConfig } from '../src/services/integrationConfigs.js';
import { httpRequest } from '../src/utils/httpClient.js';
import type { IntegrationEventRecord, IntegrationBatchResult } from '../src/types/integrations.js';

vi.mock('../src/utils/httpClient.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/utils/httpClient.js')>();
  return { ...actual, httpRequest: vi.fn() };
});

const mockedHttpRequest = vi.mocked(httpRequest);

const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const ORG_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const MOCK_PROVIDER = 'mock';
const SENDGRID_PROVIDER = 'sendgrid';

const TEST_API_KEY = 'SG.test.key.123';
const TEST_FROM_EMAIL = 'from@example.com';

const pastIso = (secondsAgo = 1): string =>
  new Date(Date.now() - secondsAgo * 1000).toISOString();
const futureIso = (secondsAhead = 3600): string =>
  new Date(Date.now() + secondsAhead * 1000).toISOString();

const makeHeaders = (entries: Record<string, string | null> = {}) => ({
  get: (name: string) => entries[name.toLowerCase()] ?? null,
});
const okResponse = (h: Record<string, string | null> = {}) => ({
  status: 202,
  ok: true,
  headers: makeHeaders(h),
});

const deferred = <T = unknown>() => {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

type EventType = IntegrationEventRecord['status'];

const seedSendgridConfig = async (): Promise<void> => {
  await setIntegrationConfig({
    organizationId: DEV_ORG_ID,
    provider: SENDGRID_PROVIDER,
    configKey: 'api_key',
    value: TEST_API_KEY,
  });
  await setIntegrationConfig({
    organizationId: DEV_ORG_ID,
    provider: SENDGRID_PROVIDER,
    configKey: 'from_email',
    value: TEST_FROM_EMAIL,
  });
};

const mockBatchResult: IntegrationBatchResult = { processed: 1, succeeded: 1, retried: 0, failed: 0 };

const loadWorker = async (
  overrides: {
    processDueIntegrationEvents?: ReturnType<typeof vi.fn>;
    closePool?: ReturnType<typeof vi.fn>;
    createPool?: ReturnType<typeof vi.fn>;
  } = {}
): Promise<typeof import('../src/workers/integrationWorker.js')> => {
  const mockProcessDue =
    overrides.processDueIntegrationEvents ??
    vi.fn().mockResolvedValue(mockBatchResult);
  const mockCreatePool = overrides.createPool ?? vi.fn();
  const mockClosePool = overrides.closePool ?? vi.fn().mockResolvedValue(undefined);

  vi.doMock('../src/services/integrations.js', () => ({
    processDueIntegrationEvents: mockProcessDue,
  }));
  vi.doMock('../src/db/index.js', () => ({
    createPool: mockCreatePool,
    closePool: mockClosePool,
    setPool: vi.fn(),
    getPool: vi.fn(),
    getClient: vi.fn(),
  }));

  return import('../src/workers/integrationWorker.js');
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
};

const __dirname = dirname(fileURLToPath(import.meta.url));

const loadWorkerWithMockLogger = async (
  overrides: {
    processDueIntegrationEvents?: ReturnType<typeof vi.fn>;
    closePool?: ReturnType<typeof vi.fn>;
    createPool?: ReturnType<typeof vi.fn>;
  } = {}
): Promise<typeof import('../src/workers/integrationWorker.js')> => {
  const mockProcessDue =
    overrides.processDueIntegrationEvents ??
    vi.fn().mockResolvedValue(mockBatchResult);
  const mockCreatePool = overrides.createPool ?? vi.fn();
  const mockClosePool = overrides.closePool ?? vi.fn().mockResolvedValue(undefined);

  vi.doMock('../src/services/integrations.js', () => ({
    processDueIntegrationEvents: mockProcessDue,
  }));
  vi.doMock('../src/db/index.js', () => ({
    createPool: mockCreatePool,
    closePool: mockClosePool,
    setPool: vi.fn(),
    getPool: vi.fn(),
    getClient: vi.fn(),
  }));
  vi.doMock('../src/utils/logger.js', () => ({
    logger: mockLogger,
  }));

  return import('../src/workers/integrationWorker.js');
};

describe('V3.1.3-A Integration Worker', () => {
  let tdb: TestDatabase;
  let memPool: Pool;

  const query = (sql: string, params?: unknown[]) =>
    params ? memPool.query(sql, params) : memPool.query(sql);

  const insertEvent = async (data: {
    organizationId?: string;
    provider?: string;
    status?: EventType;
    retryCount?: number;
    nextRetryAt?: string | null;
    payload?: Record<string, unknown>;
    eventType?: string;
  }): Promise<IntegrationEventRecord> => {
    const res = await memPool.query<IntegrationEventRecord>(
      `INSERT INTO integration_events
         (organization_id, clinic_id, ai_execution_id, provider, event_type, payload, status, retry_count, next_retry_at)
       VALUES ($1, NULL, NULL, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.organizationId ?? DEV_ORG_ID,
        data.provider ?? MOCK_PROVIDER,
        data.eventType ?? 'test.event',
        JSON.stringify(data.payload ?? {}),
        data.status ?? 'pending',
        data.retryCount ?? 0,
        data.nextRetryAt ?? null,
      ]
    );
    return res.rows[0];
  };

  const getEvent = async (id: string): Promise<IntegrationEventRecord> => {
    const res = await memPool.query<IntegrationEventRecord>(
      `SELECT * FROM integration_events WHERE id = $1`,
      [id]
    );
    return res.rows[0];
  };

  // ==================================================================
  // Setup shared by processor tests and lifecycle tests
  // ==================================================================

  beforeAll(async () => {
    tdb = createTestDatabase();
    const pgLib = tdb.db.adapters.createPg();
    memPool = new pgLib.Pool();
    setPool(memPool);

    await memPool.query(
      `INSERT INTO organizations (id, name, status, timezone, data_source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [ORG_B_ID, 'Test Org B', 'trial', 'UTC', 'demo']
    );
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  beforeEach(async () => {
    mockedHttpRequest.mockReset();
    await memPool.query(`DELETE FROM integration_events`);
    await memPool.query(`DELETE FROM integration_configs`);
    await memPool.query(`DELETE FROM audit_log`);
  });

  // ==================================================================
  // A.1 – A.12: processor behavior
  // ==================================================================

  describe('processDueIntegrationEvents (A.1 - A.12)', () => {
    it('A.1 pending event is selected for processing', async () => {
      const ev = await insertEvent({ status: 'pending' });

      const result = await processDueIntegrationEvents();

      expect(result.processed).toBe(1);
      const after = await getEvent(ev.id);
      expect(after.status).toBe('sent');
    });

    it('A.2 retry event with due next_retry_at is selected', async () => {
      const ev = await insertEvent({
        status: 'retry',
        retryCount: 1,
        nextRetryAt: pastIso(),
      });

      const result = await processDueIntegrationEvents();

      expect(result.processed).toBe(1);
      expect(result.retried).toBe(0);
      const after = await getEvent(ev.id);
      expect(after.status).toBe('sent');
    });

    it('A.3 retry event with future next_retry_at is not selected', async () => {
      const ev = await insertEvent({
        status: 'retry',
        retryCount: 1,
        nextRetryAt: futureIso(),
      });

      const result = await processDueIntegrationEvents();

      expect(result.processed).toBe(0);
      const after = await getEvent(ev.id);
      expect(after.status).toBe('retry');
    });

    it('A.4 sent event is not selected', async () => {
      const ev = await insertEvent({ status: 'sent' });

      const result = await processDueIntegrationEvents();

      expect(result.processed).toBe(0);
      const after = await getEvent(ev.id);
      expect(after.status).toBe('sent');
    });

    it('A.5 failed event is not selected', async () => {
      const ev = await insertEvent({ status: 'failed', retryCount: 4 });

      const result = await processDueIntegrationEvents();

      expect(result.processed).toBe(0);
      const after = await getEvent(ev.id);
      expect(after.status).toBe('failed');
    });

    it('A.6 batch limit is respected', async () => {
      for (let i = 0; i < 10; i++) {
        await insertEvent({ status: 'pending' });
      }

      const result = await processDueIntegrationEvents({ limit: 5 });

      expect(result.processed).toBe(5);
      expect(result.succeeded).toBe(5);

      const sentRows = await query(`SELECT COUNT(*)::int AS count FROM integration_events WHERE status = 'sent'`);
      expect(sentRows.rows[0].count).toBe(5);
    });

    it('A.7 successful SendGrid event becomes sent', async () => {
      await seedSendgridConfig();
      mockedHttpRequest.mockResolvedValue(okResponse({ 'x-message-id': 'sg-msg-1' }));

      const ev = await insertEvent({
        provider: SENDGRID_PROVIDER,
        payload: { to: 'recipient@example.com', subject: 'S', body: 'B', body_type: 'text' },
      });

      const result = await processDueIntegrationEvents();

      expect(result.processed).toBe(1);
      expect(result.succeeded).toBe(1);
      const after = await getEvent(ev.id);
      expect(after.status).toBe('sent');
    });

    it('A.8 transient provider failure uses existing retry semantics', async () => {
      const ev = await insertEvent({
        provider: MOCK_PROVIDER,
        payload: { mock_fail: true },
      });

      const result = await processDueIntegrationEvents();

      expect(result.processed).toBe(1);
      expect(result.retried).toBe(1);
      const after = await getEvent(ev.id);
      expect(after.status).toBe('retry');
      expect(after.retry_count).toBe(1);
      expect(after.next_retry_at).not.toBeNull();
      expect(after.error_message).not.toBeNull();
    });

    it('A.9 exhausted failure becomes failed', async () => {
      const ev = await insertEvent({
        provider: MOCK_PROVIDER,
        payload: { mock_fail: true },
        retryCount: 3,
      });

      const result = await processDueIntegrationEvents();

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      const after = await getEvent(ev.id);
      expect(after.status).toBe('failed');
      expect(after.retry_count).toBe(4);
      expect(after.next_retry_at).toBeNull();
    });

    it('A.10 one failing event does not stop later events', async () => {
      const failing = await insertEvent({
        provider: 'nonexistent-provider',
        status: 'pending',
      });
      const good = await insertEvent({ provider: MOCK_PROVIDER, status: 'pending' });

      const result = await processDueIntegrationEvents();

      expect(result.processed).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);

      const f = await getEvent(failing.id);
      const g = await getEvent(good.id);
      expect(f.status).toBe('pending');
      expect(g.status).toBe('sent');
    });

    it('A.11 multiple organizations use each event organization_id', async () => {
      const ev1 = await insertEvent({
        organizationId: DEV_ORG_ID,
        provider: MOCK_PROVIDER,
        status: 'pending',
      });
      const ev2 = await insertEvent({
        organizationId: ORG_B_ID,
        provider: MOCK_PROVIDER,
        status: 'pending',
      });

      const result = await processDueIntegrationEvents();

      expect(result.processed).toBe(2);
      expect(result.succeeded).toBe(2);

      const a1 = await getEvent(ev1.id);
      const a2 = await getEvent(ev2.id);
      expect(a1.organization_id).toBe(DEV_ORG_ID);
      expect(a2.organization_id).toBe(ORG_B_ID);
      expect(a1.status).toBe('sent');
      expect(a2.status).toBe('sent');
    });

    it('A.12 HTTP layer remains mocked; no real SendGrid request', async () => {
      expect(vi.isMockFunction(httpRequest)).toBe(true);

      await seedSendgridConfig();
      mockedHttpRequest.mockResolvedValue(okResponse({ 'x-message-id': 'sg-msg' }));

      const ev = await insertEvent({
        provider: SENDGRID_PROVIDER,
        payload: { to: 'recipient@example.com', subject: 'S', body: 'B' },
      });

      await processDueIntegrationEvents({ limit: 1 });

      expect(mockedHttpRequest).toHaveBeenCalledTimes(1);
      expect(mockedHttpRequest).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        expect.objectContaining({ method: 'POST' })
      );

      const after = await getEvent(ev.id);
      expect(after.status).toBe('sent');
    });
  });

  // ==================================================================
  // A.13 – A.14: worker lifecycle (isolated dynamic imports)
  // ==================================================================

  describe('worker lifecycle (A.13 - A.14)', () => {
    afterEach(() => {
      vi.resetModules();
      vi.restoreAllMocks();
    });

    it('A.13 importing the worker does not auto-start Express or the worker', async () => {
      const mockProcessDue = vi.fn();
      const mockCreatePool = vi.fn();
      const mockClosePool = vi.fn().mockResolvedValue(undefined);

      vi.doMock('../src/services/integrations.js', () => ({
        processDueIntegrationEvents: mockProcessDue,
      }));
      vi.doMock('../src/db/index.js', () => ({
        createPool: mockCreatePool,
        closePool: mockClosePool,
        setPool: vi.fn(),
        getPool: vi.fn(),
        getClient: vi.fn(),
      }));

      const worker = await import('../src/workers/integrationWorker.js');

      expect(typeof worker.runCycle).toBe('function');
      expect(typeof worker.startWorker).toBe('function');
      expect(typeof worker.gracefulShutdown).toBe('function');

      expect(mockProcessDue).not.toHaveBeenCalled();
      expect(mockCreatePool).not.toHaveBeenCalled();
      expect(mockClosePool).not.toHaveBeenCalled();
    });

    it('A.14 shutdown waits for active cycle and prevents future cycles', async () => {
      const cycle = deferred<IntegrationBatchResult>();
      const mockProcessDue = vi.fn(() => cycle.promise);
      const mockCreatePool = vi.fn();
      const mockClosePool = vi.fn().mockResolvedValue(undefined);

      vi.doMock('../src/services/integrations.js', () => ({
        processDueIntegrationEvents: mockProcessDue,
      }));
      vi.doMock('../src/db/index.js', () => ({
        createPool: mockCreatePool,
        closePool: mockClosePool,
        setPool: vi.fn(),
        getPool: vi.fn(),
        getClient: vi.fn(),
      }));

      const worker = await import('../src/workers/integrationWorker.js');

      await worker.startWorker({ intervalMs: 10, batchSize: 5 });

      expect(mockCreatePool).toHaveBeenCalledTimes(1);
      expect(mockProcessDue).toHaveBeenCalledTimes(1);

      const shutdownPromise = worker.gracefulShutdown();
      let settled = false;
      void shutdownPromise.then(() => {
        settled = true;
      });

      await new Promise((r) => setTimeout(r, 30));
      expect(settled).toBe(false);

      cycle.resolve(mockBatchResult);
      const result = await shutdownPromise;

      await new Promise((r) => setTimeout(r, 30));
      expect(mockProcessDue).toHaveBeenCalledTimes(1);
      expect(mockClosePool).toHaveBeenCalledTimes(1);
      expect(worker.isShuttingDown()).toBe(true);
      expect(result.forced).toBe(false);
    });
  });

  // ==================================================================
  // D.1 – D.8: lifecycle / observability tests
  // ==================================================================

  describe('lifecycle observability (D.1 - D.8)', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    afterEach(() => {
      vi.resetModules();
      vi.restoreAllMocks();
    });

    it('D.1 gracefulShutdown resolves {forced:false} after cycle completes', async () => {
      const cycle = deferred<IntegrationBatchResult>();
      const mockProcessDue = vi.fn(() => cycle.promise);

      const worker = await loadWorker({
        processDueIntegrationEvents: mockProcessDue,
      });

      await worker.startWorker({ intervalMs: 10000, batchSize: 10 });

      await new Promise((r) => setTimeout(r, 20));

      const shutdownPromise = worker.gracefulShutdown();
      let settled = false;
      void shutdownPromise.then(() => {
        settled = true;
      });

      await new Promise((r) => setTimeout(r, 30));
      expect(settled).toBe(false);

      cycle.resolve(mockBatchResult);
      const result = await shutdownPromise;

      expect(result).toEqual({ forced: false });
      expect(worker.isShuttingDown()).toBe(true);
    });

    it('D.2 gracefulShutdown returns {forced:true} when cycle exceeds timeout', async () => {
      const cycle = deferred<IntegrationBatchResult>();
      const mockProcessDue = vi.fn(() => cycle.promise);

      const worker = await loadWorker({
        processDueIntegrationEvents: mockProcessDue,
      });

      await worker.startWorker({ intervalMs: 10000 });

      await new Promise((r) => setTimeout(r, 10));

      const result = await worker.gracefulShutdown({ shutdownTimeoutMs: 20 });

      expect(result.forced).toBe(true);
      expect(worker.isShuttingDown()).toBe(true);

      cycle.resolve(mockBatchResult);
    });

    it('D.3 repeated gracefulShutdown calls return the same promise and closePool is called once', async () => {
      const mockProcessDue = vi.fn().mockResolvedValue(mockBatchResult);
      const mockClosePool = vi.fn().mockResolvedValue(undefined);

      const worker = await loadWorker({
        processDueIntegrationEvents: mockProcessDue,
        closePool: mockClosePool,
      });

      await worker.startWorker({ intervalMs: 10000 });

      await new Promise((r) => setTimeout(r, 20));

      const p1 = worker.gracefulShutdown();
      const p2 = worker.gracefulShutdown();

      expect(p1).toBe(p2);

      const result = await p1;
      expect(result.forced).toBe(false);

      const p3 = worker.gracefulShutdown();
      const result3 = await p3;
      expect(result3.forced).toBe(false);

      expect(mockClosePool).toHaveBeenCalledTimes(1);
    });

    it('D.4 startWorker logs integration_worker_started with required fields', async () => {
      const mockProcessDue = vi.fn().mockResolvedValue(mockBatchResult);

      const worker = await loadWorkerWithMockLogger({
        processDueIntegrationEvents: mockProcessDue,
      });

      mockLogger.info.mockClear();

      await worker.startWorker({ intervalMs: 5000, batchSize: 7 });

      const startCall = mockLogger.info.mock.calls.find(
        (c) => c[0]?.event === 'integration_worker_started'
      )!;

      expect(startCall).toBeDefined();
      expect(startCall[0]).toMatchObject({
        event: 'integration_worker_started',
        intervalMs: 5000,
        batchSize: 7,
      });
    });

    it('D.5 runCycle logs integration_worker_cycle_complete with numeric durationMs', async () => {
      const mockProcessDue = vi.fn().mockResolvedValue(mockBatchResult);

      const worker = await loadWorkerWithMockLogger({
        processDueIntegrationEvents: mockProcessDue,
      });

      mockLogger.info.mockClear();

      await worker.runCycle();

      const cycleCall = mockLogger.info.mock.calls.find(
        (c) => c[0]?.event === 'integration_worker_cycle_complete'
      )!;

      expect(cycleCall).toBeDefined();
      expect(cycleCall[0]).toMatchObject({
        event: 'integration_worker_cycle_complete',
        processed: 1,
        succeeded: 1,
        retried: 0,
        failed: 0,
      });
      expect(typeof cycleCall[0].durationMs).toBe('number');
      expect(cycleCall[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('D.6 runCycle logs integration_worker_cycle_error on failure with durationMs and error', async () => {
      const testError = new Error('boom');
      const mockProcessDue = vi.fn().mockRejectedValue(testError);

      const worker = await loadWorkerWithMockLogger({
        processDueIntegrationEvents: mockProcessDue,
      });

      mockLogger.error.mockClear();

      const result = await worker.runCycle();

      expect(result.processed).toBe(0);
      const errorCall = mockLogger.error.mock.calls.find(
        (c) => c[0]?.event === 'integration_worker_cycle_error'
      )!;

      expect(errorCall).toBeDefined();
      expect(errorCall[0]).toMatchObject({
        event: 'integration_worker_cycle_error',
      });
      expect(typeof errorCall[0].durationMs).toBe('number');
      expect(errorCall[0].error).toBe('boom');
    });

    it('D.7 gracefulShutdown logs integration_worker_shutdown_timeout with timeoutMs on timeout', async () => {
      const cycle = deferred<IntegrationBatchResult>();
      const mockProcessDue = vi.fn(() => cycle.promise);

      const worker = await loadWorkerWithMockLogger({
        processDueIntegrationEvents: mockProcessDue,
      });

      await worker.startWorker({ intervalMs: 10000 });

      await new Promise((r) => setTimeout(r, 10));

      mockLogger.warn.mockClear();

      const result = await worker.gracefulShutdown({ shutdownTimeoutMs: 20 });

      expect(result.forced).toBe(true);

      const timeoutCall = mockLogger.warn.mock.calls.find(
        (c) => c[0]?.event === 'integration_worker_shutdown_timeout'
      )!;

      expect(timeoutCall).toBeDefined();
      expect(timeoutCall[0].timeoutMs).toBe(20);

      cycle.resolve(mockBatchResult);
    });

    it('D.8 no logger call contains secret-like values (api keys, passwords, tokens)', async () => {
      const secretPatterns = ['SG.test.key', 'password', 'secret', 'token', 'JWT_SECRET', 'api_key'];

      const worker = await loadWorkerWithMockLogger({
        processDueIntegrationEvents: vi.fn().mockResolvedValue(mockBatchResult),
      });

      mockLogger.info.mockClear();
      mockLogger.warn.mockClear();
      mockLogger.error.mockClear();

      await worker.startWorker({ intervalMs: 10000, batchSize: 10 });
      await worker.runCycle();
      await worker.gracefulShutdown();

      for (const mock of [mockLogger.info, mockLogger.warn, mockLogger.error] as const) {
        for (const call of mock.mock.calls) {
          const serialized = JSON.stringify(call);
          for (const pattern of secretPatterns) {
            expect(serialized).not.toContain(pattern);
          }
        }
      }
    });
  });

  // ==================================================================
  // V.1 – V.6: process error handlers (V3.1.6)
  // ==================================================================

  describe('process error handlers (V.1 - V.6)', () => {
    beforeEach(() => {
      process.removeAllListeners('unhandledRejection');
      process.removeAllListeners('uncaughtException');
    });

    afterEach(() => {
      process.removeAllListeners('unhandledRejection');
      process.removeAllListeners('uncaughtException');
      vi.restoreAllMocks();
    });

    it('V.1 registerProcessHandlers registers unhandledRejection and uncaughtException handlers', async () => {
      const worker = await loadWorkerWithMockLogger({
        processDueIntegrationEvents: vi.fn().mockResolvedValue(mockBatchResult),
      });

      process.removeAllListeners('unhandledRejection');
      process.removeAllListeners('uncaughtException');

      worker.registerProcessHandlers();

      expect(process.listenerCount('unhandledRejection')).toBe(1);
      expect(process.listenerCount('uncaughtException')).toBe(1);
    });

    it('V.2 unhandledRejection emits structured log and initiates graceful shutdown', async () => {
      vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      const worker = await loadWorkerWithMockLogger({
        processDueIntegrationEvents: vi.fn().mockResolvedValue(mockBatchResult),
        closePool: vi.fn().mockResolvedValue(undefined),
      });

      await worker.startWorker({ intervalMs: 10000 });
      await new Promise((r) => setTimeout(r, 20));

      worker.registerProcessHandlers();
      mockLogger.error.mockClear();

      process.emit('unhandledRejection', new Error('test rejection'), undefined as unknown as Promise<unknown>);

      await new Promise((r) => setTimeout(r, 50));

      const errorCall = mockLogger.error.mock.calls.find(
        (c) => c[0]?.event === 'integration_worker_unhandled_rejection'
      )!;
      expect(errorCall).toBeDefined();
      expect(errorCall[0].error).toBe('test rejection');

      expect(process.exit).toHaveBeenCalledTimes(1);
      expect(process.exit).toHaveBeenCalledWith(0);

      expect(worker.isShuttingDown()).toBe(true);
    });

    it('V.3 uncaughtException emits structured log and exits non-zero', async () => {
      vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      const worker = await loadWorkerWithMockLogger({
        processDueIntegrationEvents: vi.fn().mockResolvedValue(mockBatchResult),
        closePool: vi.fn().mockResolvedValue(undefined),
      });

      await worker.startWorker({ intervalMs: 10000 });
      await new Promise((r) => setTimeout(r, 20));

      worker.registerProcessHandlers();
      mockLogger.error.mockClear();

      process.emit('uncaughtException', new Error('test exception'));

      await new Promise((r) => setTimeout(r, 50));

      const errorCall = mockLogger.error.mock.calls.find(
        (c) => c[0]?.event === 'integration_worker_uncaught_exception'
      )!;
      expect(errorCall).toBeDefined();
      expect(errorCall[0].error).toBe('test exception');

      expect(process.exit).toHaveBeenCalledTimes(1);
      expect(process.exit).toHaveBeenCalledWith(1);

      expect(worker.isShuttingDown()).toBe(true);
    });

    it('V.4 repeated process errors do not create duplicate shutdown flows', async () => {
      vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      const worker = await loadWorkerWithMockLogger({
        processDueIntegrationEvents: vi.fn().mockResolvedValue(mockBatchResult),
        closePool: vi.fn().mockResolvedValue(undefined),
      });

      await worker.startWorker({ intervalMs: 10000 });
      await new Promise((r) => setTimeout(r, 20));

      worker.registerProcessHandlers();
      mockLogger.error.mockClear();

      (process as NodeJS.Process).emit('unhandledRejection', new Error('first error'), undefined as unknown as Promise<unknown>);
      (process as NodeJS.Process).emit('unhandledRejection', new Error('second error'), undefined as unknown as Promise<unknown>);

      await new Promise((r) => setTimeout(r, 50));

      const rejectionCalls = mockLogger.error.mock.calls.filter(
        (c) => c[0]?.event === 'integration_worker_unhandled_rejection'
      );
      expect(rejectionCalls).toHaveLength(2);

      expect(worker.isShuttingDown()).toBe(true);
    });

    it('V.5 process error handler logs do not leak secret values from error objects', async () => {
      vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      const worker = await loadWorkerWithMockLogger({
        processDueIntegrationEvents: vi.fn().mockResolvedValue(mockBatchResult),
        closePool: vi.fn().mockResolvedValue(undefined),
      });

      await worker.startWorker({ intervalMs: 10000 });
      await new Promise((r) => setTimeout(r, 20));

      worker.registerProcessHandlers();
      mockLogger.error.mockClear();

      const secretError = new Error('provider connection failed');
      (secretError as unknown as Record<string, unknown>).apiKey = 'SG.test.key.123';
      (secretError as unknown as Record<string, unknown>).password = 'secret-password-123';

      process.emit('unhandledRejection', secretError, undefined as unknown as Promise<unknown>);

      await new Promise((r) => setTimeout(r, 50));

      const errorCall = mockLogger.error.mock.calls.find(
        (c) => c[0]?.event === 'integration_worker_unhandled_rejection'
      );
      expect(errorCall).toBeDefined();
      expect(errorCall![0].error).toBe('provider connection failed');

      for (const call of mockLogger.error.mock.calls) {
        const serialized = JSON.stringify(call[0]);
        expect(serialized).not.toContain('SG.test.key');
        expect(serialized).not.toContain('secret-password-123');
      }
    });

    it('V.6 backend package.json includes start:worker and dev:worker scripts', () => {
      const pkg = JSON.parse(
        readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
      );

      expect(pkg.scripts['start:worker']).toBe(
        'node dist/src/workers/integrationWorker.js'
      );
      expect(pkg.scripts['dev:worker']).toBe(
        'tsx watch src/workers/integrationWorker.ts'
      );
    });
  });
});
