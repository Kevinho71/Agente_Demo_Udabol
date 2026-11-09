import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { ApiExecutor } from '../agent/executor.js';
import { GeminiLlm } from '../agent/gemini.js';
import type { Llm } from '../agent/llm.js';
import { runAgent, SYSTEM_PROMPT } from '../agent/loop.js';
import { MockLlm } from '../agent/mock.js';
import { sessionStore } from '../agent/sessions.js';
import { toPublicError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const ChatRequestSchema = z
  .object({
    sessionId: z.string().trim().min(1).max(64).optional(),
    message: z.string().trim().min(1, 'La consulta está vacía.').max(2000, 'La consulta es demasiado larga.'),
  })
  .strict();

const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Demasiadas consultas seguidas. Espera un minuto y vuelve a intentar.',
    },
  },
});

function buildLlm(): Llm {
  if (config.MOCK_LLM) {
    return new MockLlm();
  }
  return new GeminiLlm(config.GEMINI_API_KEY as string, SYSTEM_PROMPT);
}

const executor = new ApiExecutor();

function isProductResult(data: unknown): boolean {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    typeof data[0] === 'object' &&
    data[0] !== null &&
    'name' in (data[0] as Record<string, unknown>) &&
    'price' in (data[0] as Record<string, unknown>)
  );
}

export const chatRouter = Router();

chatRouter.post('/api/chat', chatLimiter, async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: parsed.error.issues[0]?.message ?? 'Consulta invalida.',
      },
    });
    return;
  }

  const session = sessionStore.getOrCreate(parsed.data.sessionId);
  const history = sessionStore.history(session.id);
  const messageId = randomUUID();
  const model = config.MOCK_LLM ? 'mock' : config.GEMINI_MODEL;

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  const controller = new AbortController();
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keep-alive\n\n');
    }
  }, 15_000);

  res.on('close', () => {
    clearInterval(heartbeat);
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  send('meta', { sessionId: session.id, messageId, model });

  try {
    const llm = buildLlm();
    let finalText = '';
    let lastEndpoint: string | null = null;
    let pendingConfirmation = false;

    const events = runAgent({
      llm,
      executor,
      history,
      userMessage: parsed.data.message,
      sessionId: session.id,
      maxSteps: config.MAX_AGENT_STEPS,
      signal: controller.signal,
    });

    for await (const event of events) {
      if (res.writableEnded || res.destroyed) break;

      switch (event.type) {
        case 'token':
          send('token', { text: event.text });
          break;
        case 'tool_start':
          send('tool', {
            callId: event.callId,
            endpointId: event.endpointId,
            method: event.method,
            path: event.path,
            status: 'running',
          });
          break;
        case 'tool_end':
          if (event.ok && event.data !== undefined) {
            lastEndpoint = event.endpointId;
            send('result', {
              endpointId: event.endpointId,
              kind: isProductResult(event.data) ? 'products' : 'data',
              items: event.data,
              view: event.view,
            });
          }
          send('tool', {
            callId: event.callId,
            endpointId: event.endpointId,
            status: event.ok ? 'ok' : 'error',
            httpStatus: event.httpStatus,
            durationMs: event.durationMs,
            itemCount: event.itemCount,
            error: event.error,
          });
          break;
        case 'confirm_required':
          lastEndpoint = event.endpointId;
          pendingConfirmation = true;
          send('confirm', {
            actionId: event.actionId,
            endpointId: event.endpointId,
            method: event.method,
            path: event.path,
            items: event.items,
            count: event.count,
          });
          break;
        case 'done':
          finalText = event.text;
          break;
      }
    }

    sessionStore.append(session.id, 'user', parsed.data.message);
    if (finalText) {
      sessionStore.append(session.id, 'model', finalText);
    }

    send('done', { sessionId: session.id, messageId, model, pendingConfirmation });
    logger.info(
      { sessionId: session.id, chars: parsed.data.message.length, endpoint: lastEndpoint },
      'consulta completada',
    );
  } catch (error) {
    const publicError = toPublicError(error);
    logger.error({ err: error, sessionId: session.id }, 'fallo la consulta');
    send('error', publicError);
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) {
      res.end();
    }
  }
});
