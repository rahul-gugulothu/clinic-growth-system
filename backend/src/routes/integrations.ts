import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext, requireRole } from '../middleware/auth.js';
import { BadRequestError, NotFoundError, ForbiddenError, INTERNAL_ROLES } from '../types/index.js';
import { getIntegrationEvent, getExecutionEvents, retryIntegrationEvent, getIntegrationProvider } from '../services/integrations.js';
import { setIntegrationConfig, getIntegrationConfigStatus, deleteIntegrationConfig } from '../services/integrationConfigs.js';
import { getClient } from '../db/index.js';

const router = Router();

const eventIdSchema = z.string().uuid();

router.use(requireAuth);

const providerRequiredKeys: Record<string, string[]> = {
  sendgrid: ['api_key', 'from_email'],
};

const setConfigSchema = z.object({
  provider: z.string().min(1),
  config_key: z.string().min(1),
  config_value: z.string().min(1),
});

const deleteConfigSchema = z.object({
  provider: z.string().min(1),
  config_key: z.string().min(1),
});

const statusQuerySchema = z.object({
  provider: z.string().min(1).optional(),
  config_key: z.string().min(1).optional(),
});

router.put(
  '/config',
  requireRole('founder', 'org_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      const parsed = setConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        next(new BadRequestError('Invalid request body'));
        return;
      }

      await setIntegrationConfig({
        organizationId: auth.organizationId,
        provider: parsed.data.provider,
        configKey: parsed.data.config_key,
        value: parsed.data.config_value,
      });

      res.status(200).json({
        provider: parsed.data.provider,
        config_key: parsed.data.config_key,
        configured: true,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/config/status',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      const parsed = statusQuerySchema.safeParse(req.query);
      if (!parsed.success || !parsed.data.provider) {
        next(new BadRequestError('provider query parameter is required'));
        return;
      }

      const { provider, config_key } = parsed.data;

      if (config_key) {
        const client = await getClient();
        try {
          const result = await client.query<{ config_key: string }>(
            `SELECT config_key
             FROM integration_configs
             WHERE organization_id = $1
               AND provider = $2
               AND config_key = $3
               AND deleted_at IS NULL`,
            [auth.organizationId, provider, config_key]
          );
          res.json({
            provider,
            config_key,
            configured: result.rowCount === 1,
          });
          return;
        } finally {
          client.release();
        }
      }

      const status = await getIntegrationConfigStatus({
        organizationId: auth.organizationId,
        provider,
      });

      res.json({ provider, configured: status.configured });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/config',
  requireRole('founder', 'org_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      const parsed = deleteConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        next(new BadRequestError('Invalid request body'));
        return;
      }

      await deleteIntegrationConfig({
        organizationId: auth.organizationId,
        provider: parsed.data.provider,
        configKey: parsed.data.config_key,
      });

      res.status(200).json({
        provider: parsed.data.provider,
        config_key: parsed.data.config_key,
        deleted: true,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/health',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      const client = await getClient();
      try {
        const result = await client.query<{ provider: string; config_key: string }>(
          `SELECT provider, config_key
           FROM integration_configs
           WHERE organization_id = $1 AND deleted_at IS NULL`,
          [auth.organizationId]
        );

        const configuredKeys = new Map<string, Set<string>>();
        for (const row of result.rows) {
          const present = configuredKeys.get(row.provider) ?? new Set<string>();
          present.add(row.config_key);
          configuredKeys.set(row.provider, present);
        }

        const integrations: Record<
          string,
          {
            configured: boolean;
            missing_keys: string[];
            healthy: boolean | null;
            checked_at: string | null;
          }
        > = {};

        let allHealthy = true;

        for (const provider of Object.keys(providerRequiredKeys)) {
          const required = providerRequiredKeys[provider]!;
          const present = configuredKeys.get(provider) ?? new Set<string>();
          const missing_keys = required.filter((key) => !present.has(key));

          let healthy: boolean | null = false;
          let checked_at: string | null = null;

            if (missing_keys.length === 0) {
            const providerInstance = getIntegrationProvider(provider);
            if (providerInstance?.healthCheck) {
              try {
                healthy = await providerInstance.healthCheck(auth.organizationId);
              } catch {
                healthy = false;
              }
              checked_at = new Date().toISOString();
            } else {
              healthy = null;
            }
          }

          if (missing_keys.length === 0 && healthy === false) {
            allHealthy = false;
          }

          integrations[provider] = {
            configured: present.size > 0,
            missing_keys,
            healthy,
            checked_at,
          };
        }

        res.status(200).json({ status: 'ok', integrations, all_healthy: allHealthy });
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/events/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      const idResult = eventIdSchema.safeParse(req.params.id);
      if (!idResult.success) {
        next(new BadRequestError('Invalid event ID'));
        return;
      }

      const event = await getIntegrationEvent({
        eventId: idResult.data,
        organizationId: auth.organizationId,
      });

      if (!event) {
        throw new NotFoundError('Integration event not found');
      }

      res.json({ event });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/events',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      const executionId = req.query.execution_id;
      if (!executionId || typeof executionId !== 'string') {
        next(new BadRequestError('execution_id query parameter is required'));
        return;
      }

      const idResult = eventIdSchema.safeParse(executionId);
      if (!idResult.success) {
        next(new BadRequestError('Invalid execution ID'));
        return;
      }

      const events = await getExecutionEvents({
        executionId: idResult.data,
        organizationId: auth.organizationId,
      });

      res.json({ events });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/events/:id/retry',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      if (!INTERNAL_ROLES.includes(auth.role)) {
        throw new ForbiddenError(
          'Only organization-level users can retry integration events'
        );
      }

      const idResult = eventIdSchema.safeParse(req.params.id);
      if (!idResult.success) {
        next(new BadRequestError('Invalid event ID'));
        return;
      }

      const event = await retryIntegrationEvent({
        eventId: idResult.data,
        organizationId: auth.organizationId,
        userId: auth.userId,
        userRole: auth.role,
        clinicId: auth.clinicId,
      });

      res.json({ event });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
