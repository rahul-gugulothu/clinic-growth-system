import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import {
  listReferrals,
  getReferralById,
  createReferral,
  updateReferral,
  validateLeadExists,
  validateLeadClinic,
  validateReferralStatusTransition,
  type ReferralStatus,
  type CreateReferralInput,
  type UpdateReferralInput,
} from '../services/referrals.js';

const router = Router();

const referralIdSchema = z.string().uuid();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createReferralSchema = z.object({
  referring_lead_id: z.string().uuid().nullable().optional(),
  referred_lead_id: z.string().uuid().nullable().optional(),
  outcome: z.string().nullable().optional(),
});

const updateReferralSchema = z.object({
  status: z.enum(['New', 'Converted', 'Lost']).optional(),
  outcome: z.string().nullable().optional(),
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

    const { referrals, pagination } = await listReferrals(
      auth.organizationId,
      auth.clinicId ?? null,
      paginationResult.data.page,
      paginationResult.data.limit
    );

    res.json({ referrals, pagination });
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

    const idResult = referralIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid referral ID'));
      return;
    }

    const referral = await getReferralById(
      idResult.data,
      auth.organizationId,
      auth.clinicId ?? null
    );
    if (!referral) {
      throw new NotFoundError('Referral not found');
    }

    res.json({ referral });
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

    const bodyResult = createReferralSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: CreateReferralInput = { ...bodyResult.data };
    delete (input as unknown as Record<string, unknown>).organization_id;
    delete (input as unknown as Record<string, unknown>).clinic_id;

    if (input.referring_lead_id) {
      await validateLeadExists(input.referring_lead_id, auth.organizationId);
      if (auth.clinicId) {
        await validateLeadClinic(input.referring_lead_id, auth.organizationId, auth.clinicId);
      }
    }
    if (input.referred_lead_id) {
      await validateLeadExists(input.referred_lead_id, auth.organizationId);
      if (auth.clinicId) {
        await validateLeadClinic(input.referred_lead_id, auth.organizationId, auth.clinicId);
      }
    }

    const clinicId = auth.clinicId;
    if (!clinicId) {
      next(new BadRequestError('Clinic scope required'));
      return;
    }

    const referral = await createReferral(auth.organizationId, clinicId, input);
    res.status(201).json({ referral });
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

    const idResult = referralIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid referral ID'));
      return;
    }

    const bodyResult = updateReferralSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: UpdateReferralInput = { ...bodyResult.data };
    delete (input as unknown as Record<string, unknown>).organization_id;
    delete (input as unknown as Record<string, unknown>).clinic_id;
    delete (input as unknown as Record<string, unknown>).id;

    if (Object.keys(input).length === 0) {
      next(new BadRequestError('No fields to update'));
      return;
    }

    if (input.status) {
      const existing = await getReferralById(
        idResult.data,
        auth.organizationId,
        auth.clinicId ?? null
      );
      if (!existing) {
        throw new NotFoundError('Referral not found');
      }
      validateReferralStatusTransition(existing.status, input.status as ReferralStatus);
    }

    const referral = await updateReferral(
      idResult.data,
      auth.organizationId,
      input,
      auth.clinicId ?? null
    );
    if (!referral) {
      throw new NotFoundError('Referral not found');
    }

    res.json({ referral });
  } catch (err) {
    next(err);
  }
});

export default router;
