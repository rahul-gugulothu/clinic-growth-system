import { fileURLToPath } from 'node:url';
import { config } from '../config/index.js';
import { createPool, closePool } from '../db/index.js';
import { processDueIntegrationEvents } from '../services/integrations.js';
import { logger } from '../utils/logger.js';
import type { IntegrationBatchResult } from '../types/integrations.js';

export interface WorkerOptions {
  intervalMs?: number;
  batchSize?: number;
}

let scheduledTimeout: ReturnType<typeof setTimeout> | null = null;
let currentCycle: Promise<unknown> | null = null;
let shutdownRequested = false;

export const isShuttingDown = (): boolean => shutdownRequested;

export const runCycle = async (
  opts?: { batchSize?: number }
): Promise<IntegrationBatchResult> => {
  const limit = opts?.batchSize ?? config.integration.worker.batchSize;
  return processDueIntegrationEvents({ limit });
};

const scheduleNext = (intervalMs: number): void => {
  if (shutdownRequested) return;
  if (currentCycle) return;

  scheduledTimeout = setTimeout(() => {
    scheduledTimeout = null;
    currentCycle = runCycle()
      .catch((err: unknown) => {
        logger.error(
          { err, event: 'integration_worker_cycle_error' },
          'Worker cycle failed'
        );
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
  createPool();

  const intervalMs = opts?.intervalMs ?? config.integration.worker.intervalMs;
  const batchSize = opts?.batchSize ?? config.integration.worker.batchSize;

  currentCycle = runCycle({ batchSize })
    .catch((err: unknown) => {
      logger.error(
        { err, event: 'integration_worker_cycle_error' },
        'Worker cycle failed'
      );
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
  shutdownRequested = true;
  if (scheduledTimeout !== null) {
    clearTimeout(scheduledTimeout);
    scheduledTimeout = null;
  }
};

export const gracefulShutdown = async (): Promise<void> => {
  requestShutdown();

  if (currentCycle) {
    await currentCycle;
  }

  await closePool();
  logger.info(
    { event: 'integration_worker_stopped' },
    'Integration worker stopped'
  );
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
  process.on('SIGINT', () => {
    void gracefulShutdown().then(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void gracefulShutdown().then(() => process.exit(0));
  });
};

if (isMainModule()) {
  void start();
}
