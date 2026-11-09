import { Router } from 'express';
import { config } from '../config.js';
import { fetchJson } from '../lib/http.js';
import { endpointsFile } from '../agent/registry.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'agente-demo',
    uptimeSeconds: Math.round(process.uptime()),
    model: config.MOCK_LLM ? 'mock' : config.GEMINI_MODEL,
    endpoints: endpointsFile.endpoints.length,
  });
});

healthRouter.get('/api/health/deps', async (_req, res) => {
  const startedAt = performance.now();

  try {
    const result = await fetchJson({
      url: `${config.EXTERNAL_API_BASE_URL.replace(/\/$/, '')}/api/v1/products`,
      timeoutMs: 8000,
    });

    res.json({
      externalApi: {
        ok: true,
        status: result.status,
        durationMs: result.durationMs,
      },
      gemini: {
        configured: config.MOCK_LLM || Boolean(config.GEMINI_API_KEY),
        mode: config.MOCK_LLM ? 'mock' : 'live',
      },
      checkedInMs: Math.round(performance.now() - startedAt),
    });
  } catch (error) {
    res.status(503).json({
      externalApi: {
        ok: false,
        error: error instanceof Error ? error.message : 'No se pudo consultar la API externa.',
      },
      gemini: {
        configured: config.MOCK_LLM || Boolean(config.GEMINI_API_KEY),
        mode: config.MOCK_LLM ? 'mock' : 'live',
      },
    });
  }
});
