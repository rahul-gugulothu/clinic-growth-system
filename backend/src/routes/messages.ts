import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import {
  listMessages,
  getConversationAuthorized,
  createMessage,
  type CreateMessageInput,
} from '../services/messages.js';

const router = Router();

const conversationIdSchema = z.string().uuid();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createMessageSchema = z.object({
  sender: z.enum(['clinic', 'lead', 'system']),
  body: z.string().min(1),
});

router.use(requireAuth);

router.get('/conversations/:conversationId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const convIdResult = conversationIdSchema.safeParse(req.params.conversationId);
    if (!convIdResult.success) {
      next(new BadRequestError('Invalid conversation ID'));
      return;
    }

    const authorized = await getConversationAuthorized(
      convIdResult.data,
      auth.organizationId,
      auth.clinicId ?? null
    );
    if (!authorized) {
      throw new NotFoundError('Conversation not found');
    }

    const paginationResult = paginationSchema.safeParse(req.query);
    if (!paginationResult.success) {
      next(new BadRequestError('Invalid pagination parameters'));
      return;
    }

    const { messages, pagination } = await listMessages(
      convIdResult.data,
      auth.organizationId,
      auth.clinicId ?? null,
      paginationResult.data.page,
      paginationResult.data.limit
    );

    res.json({ messages, pagination });
  } catch (err) {
    next(err);
  }
});

router.post('/conversations/:conversationId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const convIdResult = conversationIdSchema.safeParse(req.params.conversationId);
    if (!convIdResult.success) {
      next(new BadRequestError('Invalid conversation ID'));
      return;
    }

    const authorized = await getConversationAuthorized(
      convIdResult.data,
      auth.organizationId,
      auth.clinicId ?? null
    );
    if (!authorized) {
      throw new NotFoundError('Conversation not found');
    }

    const bodyResult = createMessageSchema.safeParse(req.body);
    if (!bodyResult.success) {
      next(new BadRequestError(bodyResult.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input: CreateMessageInput = { ...bodyResult.data };

    const message = await createMessage(convIdResult.data, auth.organizationId, input);
    res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
});

export default router;
