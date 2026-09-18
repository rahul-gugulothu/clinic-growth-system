import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext, requireRole } from '../middleware/auth.js';
import { onboardFromProspect } from '../services/clinics.js';
import { BadRequestError } from '../types/index.js';

const router = Router();

const prospectIdSchema = z.string().uuid();

const onboardingBodySchema = z.object({
  address: z.string().min(1).optional(),
  whatsapp_number: z.string().optional().nullable(),
  working_hours: z.string().optional().nullable(),
});

router.post(
  '/prospect/:prospectId',
  requireAuth,
  requireRole('founder', 'org_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const idResult = prospectIdSchema.safeParse(req.params.prospectId);
    if (!idResult.success) {
      next(new BadRequestError('Invalid prospect ID'));
      return;
    }

    const bodyResult = onboardingBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    try {
      const clinic = await onboardFromProspect(idResult.data, auth.organizationId, bodyResult.data);
      res.status(201).json({ clinic });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
