import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.apiKey',
      '*.GEMINI_API_KEY',
    ],
    censor: '[redacted]',
  },
  transport: config.isProduction
    ? undefined
    : {
        target: 'pino/file',
        options: { destination: 1 },
      },
});
