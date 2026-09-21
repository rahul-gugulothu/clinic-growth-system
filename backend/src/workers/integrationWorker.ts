import { fileURLToPath } from 'node:url';
import { config } from '../config/index.js';
import { createPool, closePool } from '../db/index.js';
import { processDueIntegrationEvents } from '../services/integrations.js';
import { logger } from '../utils/logger.js';
import type { IntegrationBatchResult } from '../types/integrations.js';

export interface WorkerOptions {
  intervalMs?: number;
  batchSize?: number;
  shutdownTimeoutMs?: number;
}

export interface ShutdownResult {
  forced: boolean;
}

export type WorkerStatus = 'idle' | 'running' | 'stopping' | 'stopped';

let scheduledTimeout: ReturnType<typeof setTimeout> | null = null;
let currentCycle: Promise<unknown> | null = null;
let shutdownRequested = false;
let shutdownPromise: Promise<ShutdownResult> | null = null;

let lastCycleStartedAt: number | null = null;
let lastCycleCompletedAt: number | null = null;
let workerShutdownTimeoutMs: number | null = null;

export const isShuttingDown = (): boolean => shutdownRequested;

export const getWorkerStatus = (): WorkerStatus => {
  if (shutdownRequested) {
    if (shutdownPromise) return 'stopping';
    return 'stopped';
  }
  return currentCycle ? 'running' : 'idle';
};

export const runCycle = async (
  opts?: { batchSize?: number }
): Promise<IntegrationBatchResult> => {
  const limit = opts?.batchSize ?? config.integration.worker.batchSize;
  lastCycleStartedAt = Date.now();
  try {
    const result = await processDueIntegrationEvents({ limit });
    lastCycleCompletedAt = Date.now();
    logger.info(
      {
        event: 'integration_worker_cycle_complete',
        processed: result.processed,
        succeeded: result.succeeded,
        retried: result.retried,
        failed: result.failed,
        durationMs: lastCycleCompletedAt - lastCycleStartedAt,
      },
      'Worker cycle complete'
    );
    return result;
  } catch (err: unknown) {
    lastCycleCompletedAt = Date.now();
    const durationMs = lastCycleCompletedAt - lastCycleStartedAt;
    logger.error(
      {
        event: 'integration_worker_cycle_error',
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      },
      'Worker cycle failed'
    );
    return { processed: 0, succeeded: 0, retried: 0, failed: 0 };
  }
};

const scheduleNext = (intervalMs: number): void => {
  if (shutdownRequested) return;
  if (currentCycle) return;

  scheduledTimeout = setTimeout(() => {
    scheduledTimeout = null;
    currentCycle = runCycle()
      .catch(() => {
        // runCycle handles its own logging; this catch is just for safety
      })
      .finally(() => {
        currentCycle = null;
        scheduleNext(intervalMs);
      });
  }, intervalMs);
};

export const startWorker = async (
  opts?: WorkerOptions
): Promise<void> => {
  shutdownRequested = false;
  shutdownPromise = null;
  workerShutdownTimeoutMs = opts?.shutdownTimeoutMs ?? null;
  lastCycleStartedAt = null;
  lastCycleCompletedAt = null;
  createPool();

  const intervalMs = opts?.intervalMs ?? config.integration.worker.intervalMs;
  const batchSize = opts?.batchSize ?? config.integration.worker.batchSize;

  currentCycle = runCycle({ batchSize })
    .catch(() => {
      // runCycle handles its own logging
    })
    .finally(() => {
      currentCycle = null;
      scheduleNext(intervalMs);
    });

  logger.info(
    {
      event: 'integration_worker_started',
      intervalMs,
      batchSize,
    },
    'Integration worker started'
  );
};

export const requestShutdown = (): void => {
  if (shutdownRequested) return;
  shutdownRequested = true;
  if (scheduledTimeout !== null) {
    clearTimeout(scheduledTimeout);
    scheduledTimeout = null;
  }
  logger.info(
    { event: 'integration_worker_shutdown_requested' },
    'Integration worker shutdown requested'
  );
};

export const gracefulShutdown = (
  opts?: { shutdownTimeoutMs?: number }
): Promise<ShutdownResult> => {
  if (shutdownPromise !== null) {
    return shutdownPromise;
  }

  requestShutdown();

  const timeoutMs =
    opts?.shutdownTimeoutMs ?? workerShutdownTimeoutMs ?? config.integration.worker.shutdownTimeoutMs;

  let resolveShutdown!: (result: ShutdownResult) => void;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const racePromise = new Promise<ShutdownResult>((resolve) => {
    resolveShutdown = resolve;

    timer = setTimeout(() => {
      logger.warn(
        {
          event: 'integration_worker_shutdown_timeout',
          timeoutMs,
        },
        'Worker shutdown timed out; forcing shutdown'
      );
      resolve({ forced: true });
    }, timeoutMs);

    timer.unref();
  });

  shutdownPromise = racePromise.then(async (result: ShutdownResult): Promise<ShutdownResult> => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    try {
      await closePool();
    } catch {
      // best-effort; closePool errors are not treated as timeout
    }

    if (!result.forced) {
      logger.info(
        { event: 'integration_worker_stopped' },
        'Integration worker stopped'
      );
    }

    return result;
  });

  if (currentCycle) {
    currentCycle
      .finally(() => resolveShutdown({ forced: false }))
      .catch(() => {});
  } else {
    resolveShutdown({ forced: false });
  }

  return shutdownPromise;
};

const isMainModule = (): boolean => {
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
};

const start = async (): Promise<void> => {
  await startWorker();
  process.on('SIGINT', async () => {
    const result = await gracefulShutdown();
    process.exit(result.forced ? 1 : 0);
  });
  process.on('SIGTERM', async () => {
    const result = await gracefulShutdown();
    process.exit(result.forced ? 1 : 0);
  });
  registerProcessHandlers();
};

export const registerProcessHandlers = (): void => {
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error(
      {
        event: 'integration_worker_unhandled_rejection',
        error: reason instanceof Error ? reason.message : String(reason),
      },
      'Integration worker encountered an unhandled promise rejection'
    );
    void gracefulShutdown().then((result: ShutdownResult) => {
      process.exit(result.forced ? 1 : 0);
    });
  });

  process.on('uncaughtException', (err: Error) => {
    logger.error(
      {
        event: 'integration_worker_uncaught_exception',
        error: err.message,
      },
      'Integration worker encountered an uncaught exception'
    );
    void gracefulShutdown().then(() => {
      process.exit(1);
    });
  });
};

if (isMainModule()) {
  void start();
}
