import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import {
  listBusinessOutcomes,
  getBusinessOutcomeById,
  createBusinessOutcome,
  updateBusinessOutcome,
  type CreateBusinessOutcomeInput,
  type UpdateBusinessOutcomeInput,
} from '../services/businessOutcomes.js';
import {
  validateAppointmentExists,
  validateAppointmentClinic,
} from '../services/reviews.js';

const router = Router();

const outcomeIdSchema = z.string().uuid();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createBusinessOutcomeSchema = z.object({
  appointment_id: z.string().uuid().nullable().optional(),
  amount_inr: z.number().int().min(0),
  recorded_at: z.string().datetime().optional(),
  attribution_source: z.string().nullable().optional(),
  attribution_confidence: z.enum(['Low', 'Medium', 'High']).nullable().optional(),
});

const updateBusinessOutcomeSchema = z.object({
  amount_inr: z.number().int().min(0).optional(),
  recorded_at: z.string().datetime().optional(),
  attribution_source: z.string().nullable().optional(),
  attribution_confidence: z.enum(['Low', 'Medium', 'High']).nullable().optional(),
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

    const { business_outcomes, pagination } = await listBusinessOutcomes(
      auth.organizationId,
      auth.clinicId ?? null,
      paginationResult.data.page,
      paginationResult.data.limit
    );

    res.json({ business_outcomes, pagination });
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

    const idResult = outcomeIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid business outcome ID'));
      return;
    }

    const outcome = await getBusinessOutcomeById(
      idResult.data,
      auth.organizationId,
      auth.clinicId ?? null
    );
    if (!outcome) {
      throw new NotFoundError('Business outcome not found');
    }

    res.json({ business_outcome: outcome });
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

    const bodyResult = createBusinessOutcomeSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: CreateBusinessOutcomeInput = { ...bodyResult.data };
    delete (input as unknown as Record<string, unknown>).organization_id;
    delete (input as unknown as Record<string, unknown>).clinic_id;

    if (input.appointment_id) {
      await validateAppointmentExists(input.appointment_id, auth.organizationId);
      if (auth.clinicId) {
        await validateAppointmentClinic(input.appointment_id, auth.organizationId, auth.clinicId);
      }
    }

    const clinicId = auth.clinicId;
    if (!clinicId) {
      next(new BadRequestError('Clinic scope required'));
      return;
    }

    const outcome = await createBusinessOutcome(auth.organizationId, clinicId, input);
    res.status(201).json({ business_outcome: outcome });
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

    const idResult = outcomeIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid business outcome ID'));
      return;
    }

    const bodyResult = updateBusinessOutcomeSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: UpdateBusinessOutcomeInput = { ...bodyResult.data };
    delete (input as unknown as Record<string, unknown>).organization_id;
    delete (input as unknown as Record<string, unknown>).clinic_id;
    delete (input as unknown as Record<string, unknown>).id;

    if (Object.keys(input).length === 0) {
      next(new BadRequestError('No fields to update'));
      return;
    }

    const outcome = await updateBusinessOutcome(
      idResult.data,
      auth.organizationId,
      input,
      auth.clinicId ?? null
    );
    if (!outcome) {
      throw new NotFoundError('Business outcome not found');
    }

    res.json({ business_outcome: outcome });
  } catch (err) {
    next(err);
  }
});

export default router;
