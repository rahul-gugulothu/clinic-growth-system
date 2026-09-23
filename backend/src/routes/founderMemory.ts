import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import {
  createConversation,
  listConversations,
  getConversation,
  addMessage,
  updateConversationTitle,
  archiveConversation,
  deleteConversation,
} from '../services/founderMemory.js';
import { MESSAGE_ROLES, type MessageRole } from '../types/founderMemory.js';

const router = Router();

const conversationIdSchema = z.string().uuid();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(0).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  archived: z.enum(['true', 'false']).optional(),
});

const createBodySchema = z.object({
  title: z.string().min(1).max(120).optional(),
  clinic_id: z.string().uuid().nullish(),
});

const renameBodySchema = z.object({
  title: z.string().min(1).max(120),
});

const addMessageBodySchema = z.object({
  role: z.enum(MESSAGE_ROLES as readonly ['system', 'user', 'assistant', 'tool']),
  content: z.string().min(1).max(10000),
  tool_execution_id: z.string().uuid().nullish(),
  metadata: z.record(z.unknown()).nullish(),
});

router.use(requireAuth);

router.get(
  '/',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(_req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      const parsed = listQuerySchema.safeParse(_req.query);
      if (!parsed.success) {
        next(new BadRequestError('Invalid query parameters'));
        return;
      }

      const archived =
        parsed.data.archived === undefined
          ? undefined
          : parsed.data.archived === 'true';

      const result = await listConversations(
        auth.organizationId,
        auth.userId,
        parsed.data.limit,
        parsed.data.offset,
        archived
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      const parsed = createBodySchema.safeParse(req.body);
      if (!parsed.success) {
        next(new BadRequestError('Invalid request body'));
        return;
      }

      const conversation = await createConversation({
        organizationId: auth.organizationId,
        userId: auth.userId,
        clinicId: parsed.data.clinic_id ?? null,
        title: parsed.data.title ?? null,
      });

      res.status(201).json({ conversation });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
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

      const detail = await getConversation(auth.organizationId, idResult.data);
      if (!detail) {
        throw new NotFoundError('Conversation not found');
      }

      res.json(detail);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
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

      const bodyResult = renameBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        next(new BadRequestError('Invalid request body'));
        return;
      }

      const conversation = await updateConversationTitle(
        auth.organizationId,
        idResult.data,
        bodyResult.data.title
      );
      if (!conversation) {
        throw new NotFoundError('Conversation not found');
      }

      res.json({ conversation });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
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

      const hard = req.query.hard === 'true';

      if (hard) {
        await deleteConversation(auth.organizationId, idResult.data);
        res.json({ deleted: true });
      } else {
        const conversation = await archiveConversation(auth.organizationId, idResult.data);
        res.json({ archived: true, conversation });
      }
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/messages',
  async (req: Request, res: Response, next: NextFunction) => {
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

      const bodyResult = addMessageBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        next(new BadRequestError('Invalid request body'));
        return;
      }

      const message = await addMessage({
        conversationId: idResult.data,
        organizationId: auth.organizationId,
        role: bodyResult.data.role as MessageRole,
        content: bodyResult.data.content,
        toolExecutionId: bodyResult.data.tool_execution_id ?? null,
        metadata: bodyResult.data.metadata ?? null,
      });

      res.status(201).json({ message });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
