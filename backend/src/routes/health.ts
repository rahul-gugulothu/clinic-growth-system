import { Router } from 'express';
import { checkDatabaseHealth } from '../db/index.js';

const router = Router();

router.get('/health', async (_req, res, next) => {
  try {
    const dbHealth = await checkDatabaseHealth();

    const status = dbHealth.connected ? 'healthy' : 'degraded';

    res.status(dbHealth.connected ? 200 : 503).json({
      status,
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          connected: dbHealth.connected,
          latencyMs: dbHealth.latencyMs,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
