import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext, authorizeClinicOrOrg } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import {
  getClinic,
  updateClinic,
  type UpdateClinicInput,
} from '../services/clinics.js';

const router = Router();

const clinicIdSchema = z.string().uuid();

const updateClinicSchema = z.object({
  name: z.string().min(1).optional(),
  specialty: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  website: z.string().url().optional().nullable(),
  whatsapp_number: z.string().optional().nullable(),
  working_hours: z.string().optional().nullable(),
  status: z.enum(['Onboarding', 'Active', 'Paused', 'Churned']).optional(),
});

router.use(requireAuth);

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const idResult = clinicIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid clinic ID'));
      return;
    }

    if (auth.clinicId) {
      authorizeClinicOrOrg(req, idResult.data);
    }

    const clinic = await getClinic(idResult.data, auth.organizationId);
    if (!clinic) {
      throw new NotFoundError('Clinic not found');
    }

    res.json({ clinic });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const idResult = clinicIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid clinic ID'));
      return;
    }

    if (auth.clinicId) {
      authorizeClinicOrOrg(req, idResult.data);
    }

    const bodyResult = updateClinicSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: UpdateClinicInput = { ...bodyResult.data };

    if (Object.keys(input).length === 0) {
      next(new BadRequestError('No fields to update'));
      return;
    }

    const clinic = await updateClinic(idResult.data, auth.organizationId, input);
    if (!clinic) {
      throw new NotFoundError('Clinic not found');
    }

    res.json({ clinic });
  } catch (err) {
    next(err);
  }
});

export default router;
