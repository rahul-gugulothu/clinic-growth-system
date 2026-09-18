import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext, authorizeClinicOrOrg } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import {
  listStaff,
  getStaffById,
  createStaff,
  updateStaff,
  type CreateStaffInput,
  type UpdateStaffInput,
} from '../services/staff.js';

const router = Router();

const staffIdSchema = z.string().uuid();
const clinicIdSchema = z.string().uuid();

const createStaffSchema = z.object({
  name: z.string().min(1),
  role: z.enum(['Reception', 'Coordinator', 'Manager']),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  status: z.enum(['Active', 'Inactive']).optional(),
});

const updateStaffSchema = createStaffSchema.partial();

router.use(requireAuth);

router.get('/clinics/:clinicId/staff', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const idResult = clinicIdSchema.safeParse(req.params.clinicId);
    if (!idResult.success) {
      next(new BadRequestError('Invalid clinic ID'));
      return;
    }

    if (auth.clinicId) {
      authorizeClinicOrOrg(req, idResult.data);
    }

    const staff = await listStaff(idResult.data, auth.organizationId);
    res.json({ staff });
  } catch (err) {
    next(err);
  }
});

router.get('/staff/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const idResult = staffIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid staff ID'));
      return;
    }

    const staffMember = await getStaffById(idResult.data, auth.organizationId, auth.clinicId ?? null);
    if (!staffMember) {
      throw new NotFoundError('Staff not found');
    }

    res.json({ staff: staffMember });
  } catch (err) {
    next(err);
  }
});

router.post('/clinics/:clinicId/staff', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const idResult = clinicIdSchema.safeParse(req.params.clinicId);
    if (!idResult.success) {
      next(new BadRequestError('Invalid clinic ID'));
      return;
    }

    if (auth.clinicId) {
      authorizeClinicOrOrg(req, idResult.data);
    }

    const bodyResult = createStaffSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: CreateStaffInput = { ...bodyResult.data };

    const staffMember = await createStaff(idResult.data, auth.organizationId, input);
    res.status(201).json({ staff: staffMember });
  } catch (err) {
    next(err);
  }
});

router.patch('/staff/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const idResult = staffIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid staff ID'));
      return;
    }

    const bodyResult = updateStaffSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: UpdateStaffInput = { ...bodyResult.data };
    delete (input as Record<string, unknown>).clinic_id;
    delete (input as Record<string, unknown>).organization_id;

    if (Object.keys(input).length === 0) {
      next(new BadRequestError('No fields to update'));
      return;
    }

    const staffMember = await updateStaff(idResult.data, auth.organizationId, input, auth.clinicId ?? null);
    if (!staffMember) {
      throw new NotFoundError('Staff not found');
    }

    res.json({ staff: staffMember });
  } catch (err) {
    next(err);
  }
});

export default router;
