import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { invalidateCatalogCache } from '../agent/catalog-cache.js';
import { ApiExecutor } from '../agent/executor.js';
import { consumePendingAction } from '../agent/pending-actions.js';
import { sessionStore } from '../agent/sessions.js';
import { buildCreatedView, extractProduct, type ProductLike } from '../agent/summarize.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

const executor = new ApiExecutor();
const numberFormatter = new Intl.NumberFormat('es-BO');

const BodySchema = z
  .object({
    sessionId: z.string().trim().min(1).max(64),
  })
  .strict();

const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.WRITE_RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Demasiadas escrituras seguidas. Espera un minuto y vuelve a intentar.',
    },
  },
});

function itemName(summary: Record<string, unknown>): string {
  return typeof summary.name === 'string' && summary.name.trim()
    ? summary.name.trim()
    : 'producto sin nombre';
}

function productDetail(product: ProductLike): string {
  return `"${product.name}" (#${product.id}) con precio ${numberFormatter.format(product.price)} y stock ${numberFormatter.format(product.stock)}`;
}

function buildSuccessMessage(
  created: ProductLike[],
  failed: Array<{ name: string; error: string }>,
): string {
  let message =
    created.length === 1
      ? `Creé el producto ${productDetail(created[0] as ProductLike)}.`
      : `Creé ${created.length} productos: ${created.map(productDetail).join('; ')}.`;

  if (failed.length > 0) {
    message += ` No se pudieron crear: ${failed.map((item) => `${item.name} (${item.error})`).join('; ')}.`;
  }

  return message;
}

function buildFailureMessage(failed: Array<{ name: string; error: string }>): string {
  const detail = failed.map((item) => `${item.name}: ${item.error}`).join('; ');
  return `No se pudo crear ningún producto. ${detail}`;
}

export const actionsRouter = Router();

actionsRouter.post('/api/actions/:id/confirm', writeLimiter, async (req, res) => {
  const body = BodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Falta la sesión que confirma la acción.' },
    });
    return;
  }

  const actionId = typeof req.params.id === 'string' ? req.params.id : '';

  const action = consumePendingAction(actionId, body.data.sessionId);
  if (!action) {
    res.status(404).json({
      error: {
        code: 'ACTION_EXPIRED',
        message: 'La confirmación expiró o ya se usó. Pide la creación de nuevo.',
      },
    });
    return;
  }

  const startedAt = performance.now();
  const created: ProductLike[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const item of action.items) {
    const result = await executor.executePrepared(item.prepared);

    if (!result.ok) {
      failed.push({
        name: itemName(item.summary),
        error: result.error ?? 'Error desconocido al crear el producto.',
      });
      continue;
    }

    const product = extractProduct(result.data);
    if (!product) {
      failed.push({
        name: itemName(item.summary),
        error: 'La API no devolvió el producto creado.',
      });
      continue;
    }

    created.push(product);
  }

  const durationMs = Math.round(performance.now() - startedAt);

  if (created.length === 0) {
    const message = buildFailureMessage(failed);
    sessionStore.append(action.sessionId, 'model', message);
    logger.warn({ failed }, 'falló el lote de escrituras');
    res.status(502).json({
      error: { code: 'WRITE_FAILED', message },
    });
    return;
  }

  invalidateCatalogCache();

  const message = buildSuccessMessage(created, failed);
  sessionStore.append(action.sessionId, 'model', message);

  logger.info(
    {
      sessionId: action.sessionId,
      created: created.length,
      failed: failed.length,
    },
    'productos creados',
  );

  res.json({
    ok: true,
    message,
    created,
    failed,
    view: buildCreatedView(created.length),
    httpStatus: failed.length > 0 ? 207 : 201,
    durationMs,
  });
});

actionsRouter.post('/api/actions/:id/cancel', (req, res) => {
  const body = BodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Falta la sesión que cancela la acción.' },
    });
    return;
  }

  const action = consumePendingAction(
    typeof req.params.id === 'string' ? req.params.id : '',
    body.data.sessionId,
  );
  if (action) {
    sessionStore.append(
      action.sessionId,
      'model',
      'El usuario canceló la creación. No se creó ningún producto.',
    );
  }

  res.json({
    ok: true,
    cancelled: true,
    message: 'Acción cancelada. No se creó ningún producto.',
  });
});
