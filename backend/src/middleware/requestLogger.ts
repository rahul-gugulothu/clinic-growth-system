import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const start = Date.now();
  const { method, url, ip } = req;

  logger.info({ method, url, ip, event: 'request_start' }, 'Incoming request');

  const onFinish = (): void => {
    const duration = Date.now() - start;
    const { statusCode } = res;

    logger.info(
      { method, url, statusCode, durationMs: duration, event: 'request_end' },
      'Request completed'
    );
  };

  res.on('finish', onFinish);
  res.on('close', onFinish);

  next();
};
