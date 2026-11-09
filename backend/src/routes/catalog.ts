import { Router } from 'express';
import { ApiExecutor } from '../agent/executor.js';
import { getCatalogCache, setCatalogCache } from '../agent/catalog-cache.js';
import { extractProducts, summarizeProducts } from '../agent/summarize.js';
import { logger } from '../lib/logger.js';

const executor = new ApiExecutor();

export const catalogRouter = Router();

catalogRouter.get('/api/catalog', async (_req, res) => {
  const cached = getCatalogCache();
  if (cached) {
    res.json(cached);
    return;
  }

  const result = await executor.execute('list_products', {});

  if (!result.ok) {
    logger.warn({ error: result.error }, 'no se pudo precargar el catálogo');
    res.status(503).json({
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: result.error ?? 'No se pudo consultar el catálogo.',
      },
    });
    return;
  }

  const body = {
    products: extractProducts(result.data),
    summary: summarizeProducts(result.data),
    fetchedAt: new Date().toISOString(),
    source: '/api/v1/products',
  };

  setCatalogCache(body);
  res.json(body);
});
