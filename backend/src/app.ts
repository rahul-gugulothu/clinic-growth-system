import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import prospectRouter from './routes/prospects.js';
import { config } from './config/index.js';

export const createApp = (): Express => {
  const app = express();

  app.use(cors({
    origin: (origin, callback) => {
      if (origin === config.cors.origin) {
        callback(null, origin);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(cookieParser());
  app.use(requestLogger);

  app.use('/api/v1', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/prospects', prospectRouter);

  app.use(errorHandler);

  return app;
};
