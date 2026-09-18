import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import {
  listFollowups,
  getFollowupById,
  createFollowup,
  updateFollowup,
  validateLeadExists,
  validateAppointmentExists,
  validateFollowupStatusTransition,
  type CreateFollowupInput,
  type UpdateFollowupInput,
  type FollowupStatus,
} from '../services/followups.js';

const router = Router();

const followupIdSchema = z.string().uuid();
const leadIdSchema = z.string().uuid();
const appointmentIdSchema = z.string().uuid();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createFollowupSchema = z.object({
  type: z.enum(['Reminder', 'Recovery', 'Reschedule', 'Review Request']),
  scheduled_at: z.string().datetime(),
  channel: z.enum(['Email', 'Phone', 'WhatsApp', 'InPerson']),
  lead_id: z.string().uuid().nullish(),
  appointment_id: z.string().uuid().nullish(),
});

const updateFollowupSchema = z.object({
  scheduled_at: z.string().datetime().optional(),
  channel: z.enum(['Email', 'Phone', 'WhatsApp', 'InPerson']).optional(),
  status: z.enum(['Scheduled', 'Completed', 'Missed', 'Cancelled']).optional(),
  outcome: z.string().nullish(),
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

    const { followups, pagination } = await listFollowups(
      auth.organizationId,
      auth.clinicId ?? null,
      paginationResult.data.page,
      paginationResult.data.limit
    );

    res.json({ followups, pagination });
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

    const idResult = followupIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid follow-up ID'));
      return;
    }

    const followup = await getFollowupById(
      idResult.data,
      auth.organizationId,
      auth.clinicId ?? null
    );
    if (!followup) {
      throw new NotFoundError('Follow-up not found');
    }

    res.json({ followup });
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

    const bodyResult = createFollowupSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: CreateFollowupInput = { ...bodyResult.data };
    delete (input as unknown as Record<string, unknown>).organization_id;
    delete (input as unknown as Record<string, unknown>).clinic_id;

    if (input.lead_id) {
      const leadResult = leadIdSchema.safeParse(input.lead_id);
      if (!leadResult.success) {
        next(new BadRequestError('Invalid lead_id'));
        return;
      }
      await validateLeadExists(leadResult.data, auth.organizationId);
    }

    if (input.appointment_id) {
      const apptResult = appointmentIdSchema.safeParse(input.appointment_id);
      if (!apptResult.success) {
        next(new BadRequestError('Invalid appointment_id'));
        return;
      }
      await validateAppointmentExists(apptResult.data, auth.organizationId);
    }

    const followup = await createFollowup(auth.organizationId, input);
    res.status(201).json({ followup });
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

    const idResult = followupIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid follow-up ID'));
      return;
    }

    const bodyResult = updateFollowupSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: UpdateFollowupInput = { ...bodyResult.data };
    delete (input as unknown as Record<string, unknown>).organization_id;
    delete (input as unknown as Record<string, unknown>).clinic_id;
    delete (input as unknown as Record<string, unknown>).id;
    delete (input as unknown as Record<string, unknown>).lead_id;
    delete (input as unknown as Record<string, unknown>).appointment_id;
    delete (input as unknown as Record<string, unknown>).type;
    delete (input as unknown as Record<string, unknown>).created_at;
    delete (input as unknown as Record<string, unknown>).data_source;

    if (Object.keys(input).length === 0) {
      next(new BadRequestError('No fields to update'));
      return;
    }

    if (input.status) {
      const existing = await getFollowupById(
        idResult.data,
        auth.organizationId,
        auth.clinicId ?? null
      );
      if (!existing) {
        throw new NotFoundError('Follow-up not found');
      }
      validateFollowupStatusTransition(existing.status, input.status as FollowupStatus);
    }

    const followup = await updateFollowup(
      idResult.data,
      auth.organizationId,
      input,
      auth.clinicId ?? null
    );
    if (!followup) {
      throw new NotFoundError('Follow-up not found');
    }

    res.json({ followup });
  } catch (err) {
    next(err);
  }
});

export default router;
