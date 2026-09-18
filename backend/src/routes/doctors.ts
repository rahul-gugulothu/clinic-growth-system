import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext, authorizeClinicOrOrg } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import {
  listDoctors,
  getDoctor,
  createDoctor,
  updateDoctor,
  type CreateDoctorInput,
  type UpdateDoctorInput,
} from '../services/doctors.js';

const router = Router();

const doctorIdSchema = z.string().uuid();
const clinicIdSchema = z.string().uuid();

const createDoctorSchema = z.object({
  name: z.string().min(1),
  specialty: z.string().min(1),
  role: z.enum(['Owner', 'Consultant', 'Resident']),
  status: z.enum(['Active', 'Inactive']).optional(),
});

const updateDoctorSchema = createDoctorSchema.partial();

router.use(requireAuth);

router.get('/clinics/:clinicId/doctors', async (req: Request, res: Response, next: NextFunction) => {
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

    const doctors = await listDoctors(idResult.data, auth.organizationId);
    res.json({ doctors });
  } catch (err) {
    next(err);
  }
});

router.get('/doctors/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const idResult = doctorIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid doctor ID'));
      return;
    }

    const doctor = await getDoctor(idResult.data, auth.organizationId, auth.clinicId ?? null);
    if (!doctor) {
      throw new NotFoundError('Doctor not found');
    }

    res.json({ doctor });
  } catch (err) {
    next(err);
  }
});

router.post('/clinics/:clinicId/doctors', async (req: Request, res: Response, next: NextFunction) => {
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

    const bodyResult = createDoctorSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: CreateDoctorInput = { ...bodyResult.data };

    const doctor = await createDoctor(idResult.data, auth.organizationId, input);
    res.status(201).json({ doctor });
  } catch (err) {
    next(err);
  }
});

router.patch('/doctors/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const idResult = doctorIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid doctor ID'));
      return;
    }

    const bodyResult = updateDoctorSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: UpdateDoctorInput = { ...bodyResult.data };
    delete (input as Record<string, unknown>).clinic_id;
    delete (input as Record<string, unknown>).organization_id;

    if (Object.keys(input).length === 0) {
      next(new BadRequestError('No fields to update'));
      return;
    }

    const doctor = await updateDoctor(idResult.data, auth.organizationId, input, auth.clinicId ?? null);
    if (!doctor) {
      throw new NotFoundError('Doctor not found');
    }

    res.json({ doctor });
  } catch (err) {
    next(err);
  }
});

export default router;
