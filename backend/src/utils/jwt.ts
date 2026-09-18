import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import type { AuthContext, JWTPayload, UserRole } from '../types/index.js';
import { logger } from '../utils/logger.js';

export const signAccessToken = (ctx: AuthContext): string => {
  const payload: JWTPayload = {
    sub: ctx.userId,
    org_id: ctx.organizationId,
    role: ctx.role,
    clinic_id: ctx.clinicId,
    token_type: 'access',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + parseExpiry(config.jwt.accessExpiresIn),
  };

  const secret = config.jwt.secret;
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
  });
};

export const signRefreshToken = (ctx: AuthContext): string => {
  const payload: JWTPayload = {
    sub: ctx.userId,
    org_id: ctx.organizationId,
    role: ctx.role,
    clinic_id: ctx.clinicId,
    token_type: 'refresh',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + parseExpiry(config.jwt.refreshExpiresIn),
  };

  const secret = config.jwt.refreshSecret;
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
  });
};

export const verifyAccessToken = (token: string): JWTPayload | null => {
  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      algorithms: ['HS256'],
    }) as JWTPayload;

    if (decoded.token_type !== 'access') {
      logger.warn({ event: 'token_wrong_type', expected: 'access' }, 'Token type mismatch');
      return null;
    }

    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      logger.info({ event: 'token_expired' }, 'Access token expired');
    } else {
      logger.warn({ err, event: 'token_invalid' }, 'Invalid access token');
    }
    return null;
  }
};

export const verifyRefreshToken = (token: string): JWTPayload | null => {
  try {
    const decoded = jwt.verify(token, config.jwt.refreshSecret, {
      algorithms: ['HS256'],
    }) as JWTPayload;

    if (decoded.token_type !== 'refresh') {
      logger.warn({ event: 'token_wrong_type', expected: 'refresh' }, 'Token type mismatch');
      return null;
    }

    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      logger.info({ event: 'refresh_token_expired' }, 'Refresh token expired');
    } else {
      logger.warn({ err, event: 'refresh_token_invalid' }, 'Invalid refresh token');
    }
    return null;
  }
};

export const payloadToAuthContext = (payload: JWTPayload): AuthContext => {
  return {
    userId: payload.sub,
    organizationId: payload.org_id,
    role: payload.role as UserRole,
    clinicId: payload.clinic_id ?? null,
  };
};

function parseExpiry(expiry: string): number {
  const match = /^(\d+)([smhd])$/.exec(expiry);
  if (!match) {
    return 900;
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return value * (multipliers[unit] ?? 900);
}
