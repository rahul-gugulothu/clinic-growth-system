import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext } from '../middleware/auth.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../types/index.js';
import {
  getExecutionResult,
  approveExecution,
  rejectExecution,
} from '../services/aiTools.js';
import { INTERNAL_ROLES } from '../types/index.js';

const router = Router();

const executionIdSchema = z.string().uuid();

const rejectBodySchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(500),
});

router.use(requireAuth);

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const idResult = executionIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid execution ID'));
      return;
    }

    const execution = await getExecutionResult(idResult.data, auth.organizationId);
    if (!execution) {
      throw new NotFoundError('Execution not found');
    }

    res.json({ execution });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/approve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      if (!INTERNAL_ROLES.includes(auth.role)) {
        throw new ForbiddenError(
          'Only organization-level users can approve AI executions'
        );
      }

      const idResult = executionIdSchema.safeParse(req.params.id);
      if (!idResult.success) {
        next(new BadRequestError('Invalid execution ID'));
        return;
      }

      const execution = await approveExecution({
        executionId: idResult.data,
        organizationId: auth.organizationId,
        userId: auth.userId,
        userRole: auth.role,
        clinicId: auth.clinicId ?? null,
      });

      res.json({ execution });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/reject',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      if (!INTERNAL_ROLES.includes(auth.role)) {
        throw new ForbiddenError(
          'Only organization-level users can reject AI executions'
        );
      }

      const idResult = executionIdSchema.safeParse(req.params.id);
      if (!idResult.success) {
        next(new BadRequestError('Invalid execution ID'));
        return;
      }

      const bodyResult = rejectBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        next(
          new BadRequestError(
            bodyResult.error.errors[0]?.message ?? 'Invalid request body'
          )
        );
        return;
      }

      const execution = await rejectExecution({
        executionId: idResult.data,
        organizationId: auth.organizationId,
        userId: auth.userId,
        userRole: auth.role,
        reason: bodyResult.data.reason,
        clinicId: auth.clinicId ?? null,
      });

      res.json({ execution });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
