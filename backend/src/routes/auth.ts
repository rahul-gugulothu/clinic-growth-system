import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import {
  requireAuth,
  getAuthContext,
  requireClinicWorkspace,
  requireRole,
  assertOrganizationAccess,
  assertClinicAccess,
} from '../middleware/auth.js';
import { getUserById, getUserByEmail } from '../services/auth.js';
import { logAuthEvent } from '../services/audit.js';
import { BadRequestError, UnauthorizedError, type UserRecord } from '../types/index.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

const devLoginSchema = z.object({
  email: z.string().email(),
});

const isDevMode = (): boolean => config.server.isDevelopment || config.server.isTest;

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const getCookieOptions = () => ({
  httpOnly: true,
  secure: config.server.isProduction,
  sameSite: 'strict' as const,
  maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  path: '/api/v1/auth',
});

const authRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  handler: (_req, res, _next) => {
    res.status(429).json({
      error: { message: 'Too many requests, please try again later.', status: 429 },
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/dev/login', authRateLimiter, async (req, res, next) => {
  if (!isDevMode()) {
    next(new BadRequestError('Development login is not available in production'));
    return;
  }

  try {
    const result = devLoginSchema.safeParse(req.body);
    if (!result.success) {
      next(new BadRequestError('Invalid request body — email is required'));
      return;
    }

    const email = result.data.email.toLowerCase();
    const user: UserRecord | null = await getUserByEmail(email);

    if (!user) {
      logger.warn(
        { email, event: 'dev_login_user_not_found', ip: req.ip },
        'Dev login attempt for unknown user'
      );
      next(new BadRequestError('Invalid credentials'));
      return;
    }

    const authContext = {
      userId: user.id,
      organizationId: user.organization_id,
      role: user.role,
      clinicId: user.clinic_id,
    };

    const accessToken = signAccessToken(authContext);
    const refreshToken = signRefreshToken(authContext);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getCookieOptions());

    void logAuthEvent({
      organizationId: user.organization_id,
      userId: user.id,
      action: 'login_success',
      ipAddress: req.ip,
      detail: { email: user.email, role: user.role, method: 'dev' },
    });

    logger.info(
      { userId: user.id, role: user.role, event: 'dev_login_success' },
      'Development login successful'
    );

    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', authRateLimiter, async (req, res, next) => {
  const refreshToken = (req.cookies as Record<string, string | undefined> | undefined)?.refresh_token;

  if (!refreshToken) {
    next(new UnauthorizedError('Refresh token required'));
    return;
  }

  const payload = verifyRefreshToken(refreshToken);
  if (!payload) {
    next(new UnauthorizedError('Invalid or expired refresh token'));
    return;
  }

  try {
    const user = await getUserById(payload.sub);
    if (!user) {
      next(new UnauthorizedError('User not found'));
      return;
    }

    const authContext = {
      userId: user.id,
      organizationId: user.organization_id,
      role: user.role,
      clinicId: user.clinic_id,
    };

    const accessToken = signAccessToken(authContext);
    const newRefreshToken = signRefreshToken(authContext);
    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, getCookieOptions());

    void logAuthEvent({
      organizationId: user.organization_id,
      userId: user.id,
      action: 'token_refresh',
      ipAddress: req.ip,
    });

    logger.info(
      { userId: user.id, event: 'token_refresh' },
      'Token refresh successful'
    );

    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      next(new BadRequestError('Authentication context not found'));
      return;
    }

    const user = await getUserById(auth.userId);

    if (!user) {
      next(new BadRequestError('User not found'));
      return;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organization_id: user.organization_id,
        clinic_id: user.clinic_id,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res, _next) => {
  res.clearCookie(REFRESH_COOKIE_NAME, { ...getCookieOptions(), maxAge: 0 });

  const auth = getAuthContext(req);
  if (auth) {
    void logAuthEvent({
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: 'logout',
      ipAddress: req.ip,
    });
  }

  res.json({ message: 'Logged out successfully' });
});

if (isDevMode()) {
  router.get('/require-role-test', requireAuth, requireRole('founder'), (req, res) => {
    const auth = getAuthContext(req);
    res.json({
      authorized: true,
      role: auth?.role ?? null,
    });
  });

  router.get('/context-test', requireAuth, (req, res, _next) => {
    const auth = getAuthContext(req);
    res.json({
      organization_id: auth?.organizationId ?? null,
      clinic_id: auth?.clinicId ?? null,
      role: auth?.role ?? null,
    });
  });

  router.get(
    '/clinic-context-test',
    requireAuth,
    requireClinicWorkspace,
    (req, res, _next) => {
      const auth = getAuthContext(req);
      res.json({
        organization_id: auth?.organizationId ?? null,
        clinic_id: auth?.clinicId ?? null,
        role: auth?.role ?? null,
      });
    }
  );

  router.get('/org-scope-test', requireAuth, (req, res, next) => {
    const resourceOrgId = req.query.resource_org_id as string | undefined;
    if (!resourceOrgId) {
      next(new BadRequestError('resource_org_id query parameter required'));
      return;
    }
    try {
      assertOrganizationAccess(req, resourceOrgId);
      const auth = getAuthContext(req);
      res.json({
        authorized: true,
        organization_id: auth?.organizationId ?? null,
        requested_org_id: resourceOrgId,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/clinic-scope-test', requireAuth, requireClinicWorkspace, (req, res, next) => {
    const resourceClinicId = req.query.resource_clinic_id as string | undefined;
    if (!resourceClinicId) {
      next(new BadRequestError('resource_clinic_id query parameter required'));
      return;
    }
    try {
      assertClinicAccess(req, resourceClinicId);
      const auth = getAuthContext(req);
      res.json({
        authorized: true,
        clinic_id: auth?.clinicId ?? null,
        requested_clinic_id: resourceClinicId,
      });
    } catch (err) {
      next(err);
    }
  });
}

export default router;
