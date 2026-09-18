import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import {
  listConversationsForLead,
  getConversationWithLeadScope,
  validateLead,
  validateLeadClinic,
  createConversation,
  updateConversation,
  type CreateConversationInput,
  type UpdateConversationInput,
} from '../services/conversations.js';

const router = Router();

const leadIdSchema = z.string().uuid();
const conversationIdSchema = z.string().uuid();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createConversationSchema = z.object({
  channel: z.string().min(1),
  assigned_staff_id: z.string().uuid().nullish(),
});

const updateConversationSchema = z.object({
  channel: z.string().min(1).optional(),
  assigned_staff_id: z.string().uuid().nullish(),
  status: z.enum(['Open', 'Closed']).optional(),
});

router.use(requireAuth);

router.get('/leads/:leadId/conversations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const leadIdResult = leadIdSchema.safeParse(req.params.leadId);
    if (!leadIdResult.success) {
      next(new BadRequestError('Invalid lead ID'));
      return;
    }

    if (auth.clinicId) {
      await validateLeadClinic(leadIdResult.data, auth.clinicId);
    } else {
      await validateLead(leadIdResult.data, auth.organizationId, null);
    }

    const paginationResult = paginationSchema.safeParse(req.query);
    if (!paginationResult.success) {
      next(new BadRequestError('Invalid pagination parameters'));
      return;
    }

    const { conversations, pagination } = await listConversationsForLead(
      leadIdResult.data,
      auth.organizationId,
      auth.clinicId ?? null,
      paginationResult.data.page,
      paginationResult.data.limit
    );

    res.json({ conversations, pagination });
  } catch (err) {
    next(err);
  }
});

router.get('/conversations/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const idResult = conversationIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid conversation ID'));
      return;
    }

    const conversation = await getConversationWithLeadScope(
      idResult.data,
      auth.organizationId,
      auth.clinicId ?? null
    );
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    res.json({ conversation });
  } catch (err) {
    next(err);
  }
});

router.post('/leads/:leadId/conversations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const leadIdResult = leadIdSchema.safeParse(req.params.leadId);
    if (!leadIdResult.success) {
      next(new BadRequestError('Invalid lead ID'));
      return;
    }

    if (auth.clinicId) {
      await validateLeadClinic(leadIdResult.data, auth.clinicId);
    } else {
      await validateLead(leadIdResult.data, auth.organizationId, null);
    }

    const bodyResult = createConversationSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: CreateConversationInput = { ...bodyResult.data };
    delete (input as unknown as Record<string, unknown>).organization_id;
    delete (input as unknown as Record<string, unknown>).clinic_id;

    const conversation = await createConversation(
      leadIdResult.data,
      auth.organizationId,
      input
    );
    res.status(201).json({ conversation });
  } catch (err) {
    next(err);
  }
});

router.patch('/conversations/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const idResult = conversationIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid conversation ID'));
      return;
    }

    const bodyResult = updateConversationSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: UpdateConversationInput = { ...bodyResult.data };
    delete (input as Record<string, unknown>).organization_id;
    delete (input as Record<string, unknown>).clinic_id;
    delete (input as Record<string, unknown>).lead_id;
    delete (input as Record<string, unknown>).id;

    if (Object.keys(input).length === 0) {
      next(new BadRequestError('No fields to update'));
      return;
    }

    const conversation = await updateConversation(
      idResult.data,
      auth.organizationId,
      input,
      auth.clinicId ?? null
    );
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    res.json({ conversation });
  } catch (err) {
    next(err);
  }
});

export default router;
