import type { Request, Response, NextFunction } from 'express';
import type { AuthContext, UserRole } from '../types/index.js';
import { verifyAccessToken, payloadToAuthContext } from '../utils/jwt.js';
import { UnauthorizedError, ForbiddenError } from '../types/index.js';
import { logger } from '../utils/logger.js';

export const setAuthContext = (req: Request, ctx: AuthContext): void => {
  (req as Request & { auth?: AuthContext }).auth = ctx;
};

export const getAuthContext = (req: Request): AuthContext | undefined => {
  return (req as Request & { auth?: AuthContext }).auth;
};

export const getTenantOrganizationId = (req: Request): string | null => {
  return getAuthContext(req)?.organizationId ?? null;
};

export const getTenantClinicId = (req: Request): string | null => {
  return getAuthContext(req)?.clinicId ?? null;
};

export const requireAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.info(
      { path: req.path, method: req.method, event: 'auth_missing_token' },
      'Authentication required — no bearer token'
    );
    next(new UnauthorizedError('Authentication required'));
    return;
  }

  const token = authHeader.substring(7);

  const payload = verifyAccessToken(token);

  if (!payload) {
    next(new UnauthorizedError('Invalid or expired token'));
    return;
  }

  setAuthContext(req, payloadToAuthContext(payload));
  next();
};

export const requireRole = (
  ...roles: UserRole[]
): ((req: Request, _res: Response, next: NextFunction) => void) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = getAuthContext(req);

    if (!auth) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (!roles.includes(auth.role)) {
      next(new ForbiddenError('Insufficient permissions for this resource'));
      return;
    }

    next();
  };
};

export const requireClinicWorkspace = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const auth = getAuthContext(req);

  if (!auth) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }

  if (!auth.clinicId) {
    next(new ForbiddenError('Clinic workspace required'));
    return;
  }

  next();
};

export const assertOrganizationAccess = (
  req: Request,
  resourceOrgId: string
): void => {
  const auth = getAuthContext(req);

  if (!auth) {
    throw new UnauthorizedError('Authentication required');
  }

  if (auth.organizationId !== resourceOrgId) {
    logger.warn(
      {
        userId: auth.userId,
        requestedOrg: resourceOrgId,
        authenticatedOrg: auth.organizationId,
        event: 'org_access_denied',
      },
      'Organization access denied'
    );
    throw new ForbiddenError('Access denied to this organization');
  }
};

export const assertClinicAccess = (
  req: Request,
  resourceClinicId: string
): void => {
  const auth = getAuthContext(req);

  if (!auth) {
    throw new UnauthorizedError('Authentication required');
  }

  if (!auth.clinicId) {
    throw new ForbiddenError('Clinic workspace required');
  }

  if (auth.clinicId !== resourceClinicId) {
    logger.warn(
      {
        userId: auth.userId,
        requestedClinic: resourceClinicId,
        authenticatedClinic: auth.clinicId,
        event: 'clinic_access_denied',
      },
      'Clinic access denied'
    );
    throw new ForbiddenError('Access denied to this clinic');
  }
};

export const authorizeClinicOrOrg = (
  req: Request,
  resourceClinicId: string
): void => {
  const auth = getAuthContext(req);

  if (!auth) {
    throw new UnauthorizedError('Authentication required');
  }

  const isInternalRole = auth.role === 'org_admin' || auth.role === 'founder';

  if (!isInternalRole && auth.clinicId !== resourceClinicId) {
    logger.warn(
      {
        userId: auth.userId,
        requestedClinic: resourceClinicId,
        authenticatedClinic: auth.clinicId,
        event: 'clinic_access_denied',
      },
      'Clinic access denied'
    );
    throw new ForbiddenError('Access denied to this clinic');
  }
};
