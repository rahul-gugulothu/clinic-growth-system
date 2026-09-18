import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, getTenantOrganizationId } from '../middleware/auth.js';
import {
  listProspects,
  getProspect,
  createProspect,
  updateProspect,
} from '../services/prospects.js';
import { BadRequestError } from '../types/index.js';

const router = Router();

const PROSPECT_STRING = z.string().min(1);
const PROSPECT_URL = z.string().url();
const PROSPECT_RATING = z.number().min(0).max(5);
const PROSPECT_COUNT = z.number().int().min(0);
const CONTENT_QUALITY = z.enum(['Low', 'Medium', 'High']);
const PRIORITY = z.enum(['Low', 'Medium', 'High']);

const createProspectSchema = z.object({
  clinic_name: PROSPECT_STRING,
  doctor_name: PROSPECT_STRING,
  specialty: PROSPECT_STRING,
  area: PROSPECT_STRING,
  phone: z.string().optional().nullable(),
  website: PROSPECT_URL.optional().nullable(),
  google_rating: PROSPECT_RATING.optional().nullable(),
  review_count: PROSPECT_COUNT.optional().nullable(),
  instagram_url: PROSPECT_URL.optional().nullable(),
  booking_available: z.boolean().optional(),
  whatsapp_available: z.boolean().optional(),
  visible_advertising: z.string().optional().nullable(),
  content_quality: CONTENT_QUALITY.optional().nullable(),
  obvious_problem: z.string().optional().nullable(),
  priority: PRIORITY.optional().nullable(),
  source_urls: z.array(PROSPECT_URL).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateProspectSchema = createProspectSchema.partial();

const prospectIdSchema = z.string().uuid();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    if (!organizationId) {
      next(new BadRequestError('Organization context not found'));
      return;
    }

    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;

    const prospects = await listProspects(organizationId, { limit, offset });

    res.json({ prospects });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    if (!organizationId) {
      next(new BadRequestError('Organization context not found'));
      return;
    }

    const idResult = prospectIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid prospect ID'));
      return;
    }

    const prospect = await getProspect(organizationId, idResult.data);

    res.json({ prospect });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    if (!organizationId) {
      next(new BadRequestError('Organization context not found'));
      return;
    }

    const result = createProspectSchema.safeParse(req.body);
    if (!result.success) {
      next(new BadRequestError(result.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input = { ...result.data };

    const prospect = await createProspect(organizationId, input);

    res.status(201).json({ prospect });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    if (!organizationId) {
      next(new BadRequestError('Organization context not found'));
      return;
    }

    const idResult = prospectIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      next(new BadRequestError('Invalid prospect ID'));
      return;
    }

    const result = updateProspectSchema.safeParse(req.body);
    if (!result.success) {
      next(new BadRequestError(result.error.errors[0]?.message ?? 'Invalid request body'));
      return;
    }

    const input = { ...result.data };

    if (Object.keys(input).length === 0) {
      next(new BadRequestError('No fields to update'));
      return;
    }

    const prospect = await updateProspect(organizationId, idResult.data, input);

    res.json({ prospect });
  } catch (err) {
    next(err);
  }
});

export default router;
