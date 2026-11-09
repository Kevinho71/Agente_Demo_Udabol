import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { AppError } from './lib/errors.js';
import { chatRouter } from './routes/chat.js';
import { actionsRouter } from './routes/actions.js';
import { catalogRouter } from './routes/catalog.js';
import { endpointsRouter } from './routes/endpoints.js';
import { healthRouter } from './routes/health.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/health' },
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
      },
    }),
  );

  app.use(helmet({ contentSecurityPolicy: false }));

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (config.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new AppError('BAD_REQUEST', 'Origen no permitido por CORS.', 403));
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
      maxAge: 86400,
    }),
  );

  app.use(express.json({ limit: '32kb' }));

  app.use(healthRouter);
  app.use(endpointsRouter);
  app.use(catalogRouter);
  app.use(actionsRouter);
  app.use(chatRouter);

  app.use((_req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' },
    });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) {
      res.end();
      return;
    }

    const status = error instanceof AppError ? error.status : 500;
    const code = error instanceof AppError ? error.code : 'INTERNAL';
    const message =
      error instanceof AppError
        ? error.message
        : 'Ocurrió un error inesperado. Intenta de nuevo.';

    if (status >= 500) {
      logger.error({ err: error }, 'error no controlado');
    }

    res.status(status).json({ error: { code, message } });
  };

  app.use(errorHandler);

  return app;
}
