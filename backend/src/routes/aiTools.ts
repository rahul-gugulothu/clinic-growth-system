import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext } from '../middleware/auth.js';
import { BadRequestError, NotFoundError, ForbiddenError, INTERNAL_ROLES } from '../types/index.js';
import {
  listTools,
  executeTool,
  executeToolStream,
  getExecutionWithIntegrationStatus,
  approveExecution,
  rejectExecution,
  listExecutionsWithIntegrationStatus,
  type AiExecutionFilter,
} from '../services/aiTools.js';
import type { AiToolDefinition } from '../types/aiTools.js';
import type { StreamEvent } from '../types/aiTools.js';

const router = Router();

const executionIdSchema = z.string().uuid();

const toolIdSchema = z.string().min(1);

const rejectBodySchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(500),
});

const executeToolBodySchema = z.object({
  context: z.record(z.unknown()).optional().default({}),
  conversation_id: z.string().uuid().optional(),
  user_message: z.string().optional(),
  stream: z.boolean().optional(),
});

const listExecutionsQuerySchema = z.object({
  tool_id: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

router.use(requireAuth);

const publicToolFields = (tool: AiToolDefinition) => ({
  id: tool.id,
  name: tool.name,
  description: tool.description,
  tenant_scope: tool.tenant_scope,
  required_context: tool.required_context,
  human_review_required: tool.human_review_required,
});

router.get('/tools', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tools = listTools().map(publicToolFields);

    res.json({ tools });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/tools/:toolId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      const toolIdResult = toolIdSchema.safeParse(req.params.toolId);
      if (!toolIdResult.success) {
        next(new BadRequestError('Invalid tool ID'));
        return;
      }

      const tool = listTools().find((t) => t.id === toolIdResult.data);
      if (!tool) {
        throw new NotFoundError(`Unknown tool: ${toolIdResult.data}`);
      }

      if (tool.tenant_scope === 'org' && auth.clinicId !== null) {
        throw new BadRequestError(
          `Tool '${tool.id}' requires organization-level access`
        );
      }

      const bodyResult = executeToolBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        next(new BadRequestError('Invalid request body'));
        return;
      }

      const execution = await executeTool(
        toolIdResult.data,
        auth.organizationId,
        auth.userId,
        auth.clinicId,
        bodyResult.data.context,
        bodyResult.data.conversation_id,
        bodyResult.data.user_message
      );

      res.status(200).json({ execution });
    } catch (err) {
      next(err);
    }
   }
);

router.post(
  '/tools/:toolId/stream',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      const toolIdResult = toolIdSchema.safeParse(req.params.toolId);
      if (!toolIdResult.success) {
        next(new BadRequestError('Invalid tool ID'));
        return;
      }

      const tool = listTools().find((t) => t.id === toolIdResult.data);
      if (!tool) {
        throw new NotFoundError(`Unknown tool: ${toolIdResult.data}`);
      }

      if (tool.tenant_scope === 'org' && auth.clinicId !== null) {
        throw new BadRequestError(
          `Tool '${tool.id}' requires organization-level access`
        );
      }

      const bodyResult = executeToolBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        next(new BadRequestError('Invalid request body'));
        return;
      }

      const stream = bodyResult.data.stream ?? false;
      if (!stream) {
        const execution = await executeTool(
          toolIdResult.data,
          auth.organizationId,
          auth.userId,
          auth.clinicId,
          bodyResult.data.context,
          bodyResult.data.conversation_id,
          bodyResult.data.user_message
        );
        res.status(200).json({ execution });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');

      const abortController = new AbortController();
      req.on('close', () => abortController.abort());

      const streamGenerator = executeToolStream({
        toolId: toolIdResult.data,
        organizationId: auth.organizationId,
        userId: auth.userId,
        clinicId: auth.clinicId,
        rawContext: bodyResult.data.context,
        conversationId: bodyResult.data.conversation_id,
        userMessage: bodyResult.data.user_message,
        signal: abortController.signal,
      });

      try {
        for await (const event of streamGenerator) {
          if (abortController.signal.aborted) break;
          const data: StreamEvent = event;
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        }
      } catch (streamErr) {
        if (abortController.signal.aborted) {
          res.end();
          return;
        }
        const errMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
        const errorEvent = JSON.stringify({
          type: 'error',
          message: errMsg,
          kind: 'execution_error',
        });
        res.write(`data: ${errorEvent}\n\n`);
      } finally {
        res.end();
      }
    } catch (err) {
      if (!res.headersSent) {
        next(err);
      } else {
        res.end();
      }
    }
  }
);

router.get(
  '/executions',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      const parsed = listExecutionsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        next(new BadRequestError('Invalid query parameters'));
        return;
      }

      const filter: AiExecutionFilter = {};
      if (parsed.data.tool_id) {
        filter.tool_id = parsed.data.tool_id;
      }
      if (parsed.data.limit) {
        filter.limit = parsed.data.limit;
      }
      if (parsed.data.offset !== undefined) {
        filter.offset = parsed.data.offset;
      }

      const result = await listExecutionsWithIntegrationStatus(auth.organizationId, filter);

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const idResult = executionIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid execution ID'));
      return;
    }

    const execution = await getExecutionWithIntegrationStatus(idResult.data, auth.organizationId);
    if (!execution) {
      throw new NotFoundError('Execution not found');
    }

    res.json({ execution });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/approve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      if (!INTERNAL_ROLES.includes(auth.role)) {
        throw new ForbiddenError(
          'Only organization-level users can approve AI executions'
        );
      }

      const idResult = executionIdSchema.safeParse(req.params.id);
      if (!idResult.success) {
        next(new BadRequestError('Invalid execution ID'));
        return;
      }

      const execution = await approveExecution({
        executionId: idResult.data,
        organizationId: auth.organizationId,
        userId: auth.userId,
        userRole: auth.role,
        clinicId: auth.clinicId ?? null,
      });

      res.json({ execution });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/reject',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      if (!INTERNAL_ROLES.includes(auth.role)) {
        throw new ForbiddenError(
          'Only organization-level users can reject AI executions'
        );
      }

      const idResult = executionIdSchema.safeParse(req.params.id);
      if (!idResult.success) {
        next(new BadRequestError('Invalid execution ID'));
        return;
      }

      const bodyResult = rejectBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        next(
          new BadRequestError(
            bodyResult.error.errors[0]?.message ?? 'Invalid request body'
          )
        );
        return;
      }

      const execution = await rejectExecution({
        executionId: idResult.data,
        organizationId: auth.organizationId,
        userId: auth.userId,
        userRole: auth.role,
        reason: bodyResult.data.reason,
        clinicId: auth.clinicId ?? null,
      });

      res.json({ execution });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
