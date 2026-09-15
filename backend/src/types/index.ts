export type UserRole =
  | 'org_admin'
  | 'founder'
  | 'clinic_owner'
  | 'clinic_doctor'
  | 'clinic_reception'
  | 'clinic_coordinator';

export const INTERNAL_ROLES: UserRole[] = ['org_admin', 'founder'];
export const CLINIC_ROLES: UserRole[] = [
  'clinic_owner',
  'clinic_doctor',
  'clinic_reception',
  'clinic_coordinator',
];

export interface JWTPayload {
  sub: string;
  org_id: string;
  role: UserRole;
  clinic_id: string | null;
  token_type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: UserRole;
  clinicId: string | null;
}

export interface UserRecord {
  id: string;
  email: string;
  role: UserRole;
  organization_id: string;
  clinic_id: string | null;
}

export interface AppErrorOptions {
  statusCode?: number;
  isOperational?: boolean;
  cause?: unknown;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly isOperational: boolean;
  readonly cause?: unknown;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode ?? 500;
    this.isOperational = options.isOperational ?? true;
    this.cause = options.cause;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', cause?: unknown) {
    super(message, { statusCode: 400, cause });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', cause?: unknown) {
    super(message, { statusCode: 401, cause });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', cause?: unknown) {
    super(message, { statusCode: 403, cause });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not Found', cause?: unknown) {
    super(message, { statusCode: 404, cause });
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal Server Error', cause?: unknown) {
    super(message, { statusCode: 500, isOperational: false, cause });
  }
}

