import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import {
  listAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  validateLeadClinic,
  validateDoctorClinic,
  validateAppointmentStatusTransition,
  type AppointmentStatus,
  type CreateAppointmentInput,
  type UpdateAppointmentInput,
} from '../services/appointments.js';

const router = Router();

const appointmentIdSchema = z.string().uuid();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createAppointmentSchema = z.object({
  lead_id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  scheduled_at: z.string().datetime(),
});

const updateAppointmentSchema = z.object({
  scheduled_at: z.string().datetime().optional(),
  status: z.enum(['Booked', 'Attended', 'NoShow', 'Cancelled']).optional(),
  reminder_status: z.enum(['Pending', 'Sent', 'Skipped']).optional(),
  attended_at: z.string().datetime().nullable().optional(),
});

router.use(requireAuth);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const paginationResult = paginationSchema.safeParse(req.query);
    if (!paginationResult.success) {
      next(new BadRequestError('Invalid pagination parameters'));
      return;
    }

    const { appointments, pagination } = await listAppointments(
      auth.organizationId,
      auth.clinicId ?? null,
      paginationResult.data.page,
      paginationResult.data.limit
    );

    res.json({ appointments, pagination });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const idResult = appointmentIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid appointment ID'));
      return;
    }

    const appointment = await getAppointmentById(
      idResult.data,
      auth.organizationId,
      auth.clinicId ?? null
    );
    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }

    res.json({ appointment });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const bodyResult = createAppointmentSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: CreateAppointmentInput = { ...bodyResult.data };
    delete (input as unknown as Record<string, unknown>).organization_id;
    delete (input as unknown as Record<string, unknown>).clinic_id;

    await validateLeadClinic(input.lead_id, auth.organizationId, auth.clinicId ?? null);
    await validateDoctorClinic(input.doctor_id, auth.organizationId, auth.clinicId ?? null);

    const appointment = await createAppointment(auth.organizationId, input);
    res.status(201).json({ appointment });
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

    const idResult = appointmentIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid appointment ID'));
      return;
    }

    const bodyResult = updateAppointmentSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: UpdateAppointmentInput = { ...bodyResult.data };
    delete (input as unknown as Record<string, unknown>).organization_id;
    delete (input as unknown as Record<string, unknown>).clinic_id;
    delete (input as unknown as Record<string, unknown>).id;
    delete (input as unknown as Record<string, unknown>).lead_id;
    delete (input as unknown as Record<string, unknown>).doctor_id;

    if (Object.keys(input).length === 0) {
      next(new BadRequestError('No fields to update'));
      return;
    }

    if (input.status) {
      const existing = await getAppointmentById(
        idResult.data,
        auth.organizationId,
        auth.clinicId ?? null
      );
      if (!existing) {
        throw new NotFoundError('Appointment not found');
      }
      validateAppointmentStatusTransition(existing.status, input.status as AppointmentStatus);
    }

    const appointment = await updateAppointment(
      idResult.data,
      auth.organizationId,
      input,
      auth.clinicId ?? null
    );
    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }

    res.json({ appointment });
  } catch (err) {
    next(err);
  }
});

export default router;
