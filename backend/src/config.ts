import 'dotenv/config';
import { z } from 'zod';

const boolFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    EXTERNAL_API_BASE_URL: z.url().default('https://appproyectoproducto.onrender.com'),
    EXTERNAL_API_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(60000),
    EXTERNAL_API_WARMUP: boolFromString.default(true),

    GEMINI_API_KEY: z.string().trim().optional(),
    GEMINI_MODEL: z.string().trim().min(1).default('gemini-3.5-flash-lite'),

    CORS_ORIGINS: z.string().default('http://localhost:5173'),

    SESSION_TTL_MS: z.coerce.number().int().min(60000).default(1800000),
    MAX_AGENT_STEPS: z.coerce.number().int().min(1).max(8).default(4),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(120).default(10),
    WRITE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(60).default(5),

    MOCK_LLM: boolFromString.default(false),
  })
  .superRefine((env, ctx) => {
    if (!env.MOCK_LLM && !env.GEMINI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['GEMINI_API_KEY'],
        message:
          'GEMINI_API_KEY es obligatoria. Definila en backend/.env o activa MOCK_LLM=true para pruebas sin modelo.',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Configuración inválida:\n${details}`);
}

export const config = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  isProduction: parsed.data.NODE_ENV === 'production',
} as const;

export type Config = typeof config;
