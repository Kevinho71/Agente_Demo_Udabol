import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';

const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info(
    {
      port: config.PORT,
      env: config.NODE_ENV,
      model: config.MOCK_LLM ? 'mock' : config.GEMINI_MODEL,
      externalApi: config.EXTERNAL_API_BASE_URL,
    },
    'agente-demo escuchando',
  );
});

if (config.EXTERNAL_API_WARMUP) {
  const url = `${config.EXTERNAL_API_BASE_URL.replace(/\/$/, '')}/api/v1/products`;
  fetch(url, { signal: AbortSignal.timeout(90_000) })
    .then(() => logger.info('api externa despierta'))
    .catch(() => logger.warn('no se pudo precalentar la api externa'));
}

function shutdown(signal: string) {
  logger.info({ signal }, 'cerrando servidor');
  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
