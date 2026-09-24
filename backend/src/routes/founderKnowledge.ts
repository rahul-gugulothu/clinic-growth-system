import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthContext } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import {
  listDocuments,
  getDocument,
  archiveDocument,
  processDocumentUpload,
} from '../services/founderKnowledge.js';
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
});
import {
  isSupportedMimeType,
  MAX_FILE_SIZE,
} from '../types/founderKnowledge.js';

const router = Router();

const documentIdSchema = z.string().uuid();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['uploading', 'processing', 'ready', 'failed', 'archived']).optional(),
});

router.use(requireAuth);

router.post(
  '/upload',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      if (!req.file) {
        next(new BadRequestError('No file uploaded'));
        return;
      }

      const file = req.file as {
        buffer: Buffer;
        originalname: string;
        mimetype: string;
        size: number;
      };

      if (!isSupportedMimeType(file.mimetype)) {
        next(new BadRequestError(`Unsupported file type: ${file.mimetype}`));
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        next(new BadRequestError(`File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)} MB`));
        return;
      }

      const result = await processDocumentUpload(
        auth.organizationId,
        auth.userId,
        file
      );

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuthContext(req);
      if (!auth) {
        next(new BadRequestError('Authentication context not found'));
        return;
      }

      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        next(new BadRequestError('Invalid query parameters'));
        return;
      }

      const result = await listDocuments({
        organizationId: auth.organizationId,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
        status: parsed.data.status,
      });

      res.json(result);
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

      const idResult = documentIdSchema.safeParse(req.params.id);
      if (!idResult.success) {
        next(new BadRequestError('Invalid document ID'));
        return;
      }

      const result = await getDocument({
        organizationId: auth.organizationId,
        documentId: idResult.data,
      });

      if (!result) {
        throw new NotFoundError('Document not found');
      }

      res.json(result);
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

      const idResult = documentIdSchema.safeParse(req.params.id);
      if (!idResult.success) {
        next(new BadRequestError('Invalid document ID'));
        return;
      }

      const result = await archiveDocument({
        organizationId: auth.organizationId,
        documentId: idResult.data,
      });

      res.json({ archived: true, document: result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;