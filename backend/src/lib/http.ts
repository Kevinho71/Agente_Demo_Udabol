import { AppError } from './errors.js';

const MAX_BODY_BYTES = 1_000_000;

export type HttpMethod = 'GET' | 'POST';

export interface FetchJsonOptions {
  url: string;
  timeoutMs: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  method?: HttpMethod;
  body?: unknown;
  /** Las escrituras nunca se reintentan para no duplicar datos. */
  retry?: boolean;
}

export interface FetchJsonResult {
  status: number;
  data: unknown;
  durationMs: number;
  bytes: number;
}

async function readBodyWithLimit(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) {
    throw new AppError(
      'RESPONSE_TOO_LARGE',
      'La API externa devolvió una respuesta demasiado grande para procesarla.',
      502,
    );
  }

  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new AppError(
        'RESPONSE_TOO_LARGE',
        'La API externa devolvió una respuesta demasiado grande para procesarla.',
        502,
      );
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AppError) {
    return false;
  }
  return true;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJson({
  url,
  timeoutMs,
  signal,
  headers,
  method = 'GET',
  body,
  retry = true,
}: FetchJsonOptions): Promise<FetchJsonResult> {
  let lastError: unknown;
  const attempts = retry && method === 'GET' ? 2 : 1;
  const hasBody = body !== undefined && body !== null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const startedAt = performance.now();
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          accept: 'application/json',
          'user-agent': 'agente-demo/1.0',
          ...(hasBody ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        ...(hasBody ? { body: JSON.stringify(body) } : {}),
        signal: combined,
        redirect: 'error',
      });

      if (response.status >= 500 && attempt < attempts) {
        lastError = new AppError(
          'UPSTREAM_HTTP',
          `La API externa respondió con estado ${response.status}.`,
          502,
        );
        await sleep(400);
        continue;
      }

      if (!response.ok) {
        throw new AppError(
          'UPSTREAM_HTTP',
          `La API externa respondió con estado ${response.status}.`,
          502,
        );
      }

      const text = await readBodyWithLimit(response);
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new AppError(
          'UPSTREAM_INVALID',
          'La API externa devolvió una respuesta que no es JSON válido.',
          502,
        );
      }

      return {
        status: response.status,
        data,
        durationMs: Math.round(performance.now() - startedAt),
        bytes: Buffer.byteLength(text, 'utf8'),
      };
    } catch (error) {
      if (signal?.aborted) {
        throw new AppError('UPSTREAM_TIMEOUT', 'La consulta se canceló.', 499);
      }
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new AppError(
          'UPSTREAM_TIMEOUT',
          'La API externa tardó demasiado en responder. Puede estar despertando; intenta de nuevo.',
          504,
        );
      }
      if (error instanceof AppError) {
        throw error;
      }
      lastError = error;
      if (attempt < attempts && isRetryable(error)) {
        await sleep(400);
        continue;
      }
      throw new AppError('UPSTREAM_HTTP', 'No se pudo conectar con la API externa.', 502);
    }
  }

  throw lastError instanceof AppError
    ? lastError
    : new AppError('UPSTREAM_HTTP', 'No se pudo conectar con la API externa.', 502);
}
