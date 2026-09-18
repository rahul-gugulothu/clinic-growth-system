import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.logging.level,
  transport: config.logging.pretty.enabled
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          levelFirst: false,
        },
      }
    : undefined,
  base: {
    pid: process.pid,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
