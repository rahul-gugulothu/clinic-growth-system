import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import {
  listLeads,
  getLeadById,
  createLead,
  updateLead,
  validateStaffAssignment,
  validateClinic,
} from '../services/leads.js';

const router = Router();

const leadIdSchema = z.string().uuid();
const staffIdSchema = z.string().uuid();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createLeadSchema = z.object({
  clinic_id: z.string().uuid().optional().nullable(),
  source: z.string().min(1),
  service_interested: z.string().nullish(),
  status: z.enum(['New', 'Contacted', 'Qualified', 'Booked', 'Attended', 'Lost']).optional(),
  assigned_staff_id: z.string().uuid().nullish(),
  last_contact_at: z.string().datetime().nullish(),
  next_action: z.string().nullish(),
});

const updateLeadSchema = z.object({
  source: z.string().min(1).optional(),
  service_interested: z.string().nullish(),
  status: z.enum(['New', 'Contacted', 'Qualified', 'Booked', 'Attended', 'Lost']).optional(),
  assigned_staff_id: z.string().uuid().nullish(),
  last_contact_at: z.string().datetime().nullish(),
  next_action: z.string().nullish(),
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

    const { leads, pagination } = await listLeads(
      auth.organizationId,
      auth.clinicId ?? null,
      paginationResult.data.page,
      paginationResult.data.limit
    );

    res.json({ leads, pagination });
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

    const idResult = leadIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid lead ID'));
      return;
    }

    const lead = await getLeadById(idResult.data, auth.organizationId, auth.clinicId ?? null);
    if (!lead) {
      throw new NotFoundError('Lead not found');
    }

    res.json({ lead });
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

    const bodyResult = createLeadSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input = { ...bodyResult.data };

    const resolvedClinicId: string | null = auth.clinicId ?? input.clinic_id ?? null;
    delete (input as Record<string, unknown>).clinic_id;
    delete (input as Record<string, unknown>).organization_id;

    if (!resolvedClinicId) {
      next(new BadRequestError('clinic_id is required for lead creation when user has no clinic'));
      return;
    }

    await validateClinic(resolvedClinicId, auth.organizationId);

    if (input.assigned_staff_id) {
      const staffResult = staffIdSchema.safeParse(input.assigned_staff_id);
      if (!staffResult.success) {
        next(new BadRequestError('Invalid assigned_staff_id'));
        return;
      }
      await validateStaffAssignment(staffResult.data, auth.organizationId);
    }

    const lead = await createLead(auth.organizationId, resolvedClinicId, input);
    res.status(201).json({ lead });
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

    const idResult = leadIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid lead ID'));
      return;
    }

    const bodyResult = updateLeadSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input = { ...bodyResult.data };
    delete (input as Record<string, unknown>).clinic_id;
    delete (input as Record<string, unknown>).organization_id;
    delete (input as Record<string, unknown>).id;

    if (Object.keys(input).length === 0) {
      next(new BadRequestError('No fields to update'));
      return;
    }

    if (input.assigned_staff_id) {
      const staffResult = staffIdSchema.safeParse(input.assigned_staff_id);
      if (!staffResult.success) {
        next(new BadRequestError('Invalid assigned_staff_id'));
        return;
      }
      await validateStaffAssignment(staffResult.data, auth.organizationId);
    }

    const lead = await updateLead(idResult.data, auth.organizationId, input, auth.clinicId ?? null);
    if (!lead) {
      throw new NotFoundError('Lead not found');
    }

    res.json({ lead });
  } catch (err) {
    next(err);
  }
});

export default router;
