import { config } from './config/index.js';
import { createPool, closePool } from './db/index.js';
import { logger } from './utils/logger.js';
import { createApp } from './app.js';

const app = createApp();
const pool = createPool();

const server = app.listen(config.server.port, () => {
  logger.info(
    { port: config.server.port, env: config.server.isProduction ? 'production' : config.server.isTest ? 'test' : 'development' },
    'Backend server starting'
  );
});

const gracefulShutdown = (signal: string): void => {
  logger.info({ signal, event: 'shutdown' }, 'Shutting down server');

  server.close((err) => {
    if (err) {
      logger.error({ err, event: 'shutdown_error' }, 'Error during server close');
      process.exitCode = 1;
      return;
    }
    logger.info({ event: 'server_closed' }, 'Server closed');
  });

  void closePool();

  setTimeout(() => {
    logger.error({ event: 'force_exit' }, 'Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason, event: 'unhandled_rejection' }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ err, event: 'uncaught_exception' }, 'Uncaught exception');
  process.exit(1);
});

export { app, server, pool };
