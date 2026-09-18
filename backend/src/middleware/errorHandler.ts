import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../types/index.js';
import { logger } from '../utils/logger.js';

interface ErrorResponseBody {
  error: {
    message: string;
    status: number;
  };
}

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error(
        { err, path: _req.path, method: _req.method, statusCode: err.statusCode },
        'Internal server error'
      );
    } else {
      logger.warn(
        { err: err.message, path: _req.path, method: _req.method, statusCode: err.statusCode },
        'Operational error'
      );
    }

    const body: ErrorResponseBody = {
      error: {
        message: err.message,
        status: err.statusCode,
      },
    };

    res.status(err.statusCode).json(body);
    return;
  }

  logger.error({ err, path: _req.path, method: _req.method }, 'Unhandled error');

  const body: ErrorResponseBody = {
    error: {
      message: 'Internal Server Error',
      status: 500,
    },
  };

  res.status(500).json(body);
};
