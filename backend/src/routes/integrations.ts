import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import { getIntegrationEvent, getExecutionEvents } from '../services/integrations.js';

const router = Router();

const eventIdSchema = z.string().uuid();

router.use(requireAuth);

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

export default router;
