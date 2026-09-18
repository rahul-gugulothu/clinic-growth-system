import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import {
  listReviews,
  getReviewById,
  createReview,
  updateReview,
  validateAppointmentExists,
  validateAppointmentClinic,
  validateReviewStatusTransition,
  type ReviewStatus,
  type CreateReviewInput,
  type UpdateReviewInput,
} from '../services/reviews.js';

const router = Router();

const reviewIdSchema = z.string().uuid();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createReviewSchema = z.object({
  appointment_id: z.string().uuid().nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  source: z.enum(['Google', 'Practo', 'Justdial', 'Other']).optional(),
});

const updateReviewSchema = z.object({
  status: z.enum(['Requested', 'Received', 'Declined']).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  source: z.enum(['Google', 'Practo', 'Justdial', 'Other']).optional(),
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

    const { reviews, pagination } = await listReviews(
      auth.organizationId,
      auth.clinicId ?? null,
      paginationResult.data.page,
      paginationResult.data.limit
    );

    res.json({ reviews, pagination });
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

    const idResult = reviewIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid review ID'));
      return;
    }

    const review = await getReviewById(
      idResult.data,
      auth.organizationId,
      auth.clinicId ?? null
    );
    if (!review) {
      throw new NotFoundError('Review not found');
    }

    res.json({ review });
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

    const bodyResult = createReviewSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: CreateReviewInput = { ...bodyResult.data };
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

    const review = await createReview(auth.organizationId, clinicId, input);
    res.status(201).json({ review });
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

    const idResult = reviewIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid review ID'));
      return;
    }

    const bodyResult = updateReviewSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: UpdateReviewInput = { ...bodyResult.data };
    delete (input as unknown as Record<string, unknown>).organization_id;
    delete (input as unknown as Record<string, unknown>).clinic_id;
    delete (input as unknown as Record<string, unknown>).id;

    if (Object.keys(input).length === 0) {
      next(new BadRequestError('No fields to update'));
      return;
    }

    if (input.status) {
      const existing = await getReviewById(
        idResult.data,
        auth.organizationId,
        auth.clinicId ?? null
      );
      if (!existing) {
        throw new NotFoundError('Review not found');
      }
      validateReviewStatusTransition(existing.status, input.status as ReviewStatus);
    }

    const review = await updateReview(
      idResult.data,
      auth.organizationId,
      input,
      auth.clinicId ?? null
    );
    if (!review) {
      throw new NotFoundError('Review not found');
    }

    res.json({ review });
  } catch (err) {
    next(err);
  }
});

export default router;
