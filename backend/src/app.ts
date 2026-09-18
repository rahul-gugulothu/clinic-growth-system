import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import prospectRouter from './routes/prospects.js';
import clinicRouter from './routes/clinics.js';
import doctorRouter from './routes/doctors.js';
import staffRouter from './routes/staff.js';
import onboardingRouter from './routes/onboarding.js';
import leadRouter from './routes/leads.js';
import conversationRouter from './routes/conversations.js';
import appointmentRouter from './routes/appointments.js';
import followupRouter from './routes/followups.js';
import reviewRouter from './routes/reviews.js';
import businessOutcomeRouter from './routes/businessOutcomes.js';
import referralRouter from './routes/referrals.js';
import messageRouter from './routes/messages.js';
import aiToolsRouter from './routes/aiTools.js';
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
  app.use('/api/v1/clinics', clinicRouter);
  app.use('/api/v1/onboarding', onboardingRouter);
  app.use('/api/v1/leads', leadRouter);
  app.use('/api/v1', conversationRouter);
  app.use('/api/v1', messageRouter);
  app.use('/api/v1/appointments', appointmentRouter);
  app.use('/api/v1/followups', followupRouter);
  app.use('/api/v1/reviews', reviewRouter);
  app.use('/api/v1/business-outcomes', businessOutcomeRouter);
  app.use('/api/v1/referrals', referralRouter);
  app.use('/api/v1', doctorRouter);
  app.use('/api/v1', staffRouter);
  app.use('/api/v1/ai', aiToolsRouter);

  app.use(errorHandler);

  return app;
};

