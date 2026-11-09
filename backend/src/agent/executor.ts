import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { fetchJson } from '../lib/http.js';
import { findEndpoint, type Endpoint, type EndpointParam } from './registry.js';
import {
  buildCreatedView,
  buildView,
  extractProduct,
  extractProducts,
  shapeProducts,
  summarizeProducts,
  type CatalogSummary,
  type TableView,
} from './summarize.js';

export interface ApiCallResult {
  ok: boolean;
  endpointId: string;
  method: string;
  path: string;
  status: number | null;
  durationMs: number;
  itemCount: number | null;
  bytes: number;
  data: unknown;
  view?: TableView;
  catalogSummary?: CatalogSummary | null;
  error?: string;
}

export interface PreparedCall {
  endpoint: Endpoint;
  url: string;
  method: 'GET' | 'POST';
  body: Record<string, unknown> | null;
  local: Record<string, unknown>;
}

type Args = Record<string, unknown> | undefined;

function coerceValue(param: EndpointParam, value: unknown): unknown {
  if (value === null) {
    if (param.nullable) return null;
    throw new AppError(
      'INVALID_ARGUMENTS',
      `El parámetro "${param.name}" no puede ser null.`,
      400,
    );
  }

  if (value === undefined) return undefined;

  switch (param.type) {
    case 'integer': {
      const parsed = typeof value === 'number' ? value : Number(value);
      if (!Number.isInteger(parsed)) {
        throw new AppError('INVALID_ARGUMENTS', `El parámetro "${param.name}" debe ser entero.`, 400);
      }
      checkRange(param, parsed);
      return parsed;
    }
    case 'number': {
      const parsed = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(parsed)) {
        throw new AppError('INVALID_ARGUMENTS', `El parámetro "${param.name}" debe ser numérico.`, 400);
      }
      checkRange(param, parsed);
      return parsed;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      throw new AppError('INVALID_ARGUMENTS', `El parámetro "${param.name}" debe ser booleano.`, 400);
    }
    case 'string': {
      if (typeof value !== 'string') {
        throw new AppError('INVALID_ARGUMENTS', `El parámetro "${param.name}" debe ser texto.`, 400);
      }
      if (param.maxLength !== undefined && value.length > param.maxLength) {
        throw new AppError(
          'INVALID_ARGUMENTS',
          `El parámetro "${param.name}" supera los ${param.maxLength} caracteres.`,
          400,
        );
      }
      return value;
    }
  }
}

function checkRange(param: EndpointParam, value: number): void {
  if (param.minimum !== undefined && value < param.minimum) {
    throw new AppError(
      'INVALID_ARGUMENTS',
      `El parámetro "${param.name}" debe ser mayor o igual a ${param.minimum}.`,
      400,
    );
  }
  if (param.maximum !== undefined && value > param.maximum) {
    throw new AppError(
      'INVALID_ARGUMENTS',
      `El parámetro "${param.name}" debe ser menor o igual a ${param.maximum}.`,
      400,
    );
  }
}

function validateArgs(endpoint: Endpoint, args: Args): Record<string, unknown> {
  const provided = args ?? {};
  const allowed = new Set(endpoint.params.map((param) => param.name));

  for (const key of Object.keys(provided)) {
    if (!allowed.has(key)) {
      throw new AppError(
        'INVALID_ARGUMENTS',
        `El parámetro "${key}" no existe en ${endpoint.id}.`,
        400,
      );
    }
  }

  const values: Record<string, unknown> = {};

  for (const param of endpoint.params) {
    const coerced = coerceValue(param, provided[param.name]);

    if (coerced === undefined) {
      if (param.required) {
        throw new AppError(
          'INVALID_ARGUMENTS',
          `Falta el parámetro obligatorio "${param.name}".`,
          400,
        );
      }
      continue;
    }

    if (coerced !== null && param.enum && !param.enum.includes(String(coerced))) {
      throw new AppError(
        'INVALID_ARGUMENTS',
        `El parámetro "${param.name}" debe ser uno de: ${param.enum.join(', ')}.`,
        400,
      );
    }

    values[param.name] = coerced;
  }

  return values;
}

function buildUrl(endpoint: Endpoint, values: Record<string, unknown>): string {
  const base = new URL(config.EXTERNAL_API_BASE_URL);
  const pathParamNames = new Set(
    endpoint.params.filter((param) => param.in === 'path').map((param) => param.name),
  );
  let path = endpoint.path;

  for (const [name, value] of Object.entries(values)) {
    if (pathParamNames.has(name)) {
      path = path.replace(`{${name}}`, encodeURIComponent(String(value)));
    }
  }

  if (path.includes('{')) {
    throw new AppError('INVALID_ARGUMENTS', 'Faltan parámetros de ruta.', 400);
  }

  const url = new URL(path, base.origin);

  if (url.origin !== base.origin) {
    throw new AppError('TOOL_NOT_ALLOWED', 'Destino no permitido.', 403);
  }

  for (const param of endpoint.params) {
    if (param.in !== 'query') continue;
    const value = values[param.name];
    if (value !== undefined && value !== null) {
      url.searchParams.set(param.name, String(value));
    }
  }

  return url.toString();
}

function countItems(data: unknown): number | null {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    const items = (data as Record<string, unknown>).items;
    if (Array.isArray(items)) return items.length;
  }
  return null;
}

export function describeWrite(prepared: PreparedCall): Record<string, unknown> {
  const body = prepared.body ?? {};
  return {
    name: typeof body.name === 'string' ? body.name : '',
    price: typeof body.price === 'number' ? body.price : 0,
    stock: typeof body.stock === 'number' ? body.stock : 0,
    image_url:
      typeof body.image_url === 'string' || body.image_url === null
        ? body.image_url
        : null,
  };
}

export class ApiExecutor {
  describe(endpointId: string): Endpoint {
    const endpoint = findEndpoint(endpointId);
    if (!endpoint) {
      throw new AppError(
        'TOOL_NOT_ALLOWED',
        `La acción "${endpointId}" no está declarada en el mapa de endpoints.`,
        403,
      );
    }
    return endpoint;
  }

  prepare(endpointId: string, args: Args): PreparedCall {
    const endpoint = this.describe(endpointId);
    const values = validateArgs(endpoint, args);
    const url = buildUrl(endpoint, values);

    const bodyParams = endpoint.params.filter((param) => param.in === 'body');
    let body: Record<string, unknown> | null = null;

    if (bodyParams.length > 0) {
      body = {};
      for (const param of bodyParams) {
        const value = values[param.name];
        if (value !== undefined) {
          body[param.name] = value;
        } else if (param.nullable) {
          body[param.name] = null;
        }
      }
    }

    const local: Record<string, unknown> = {};
    for (const param of endpoint.params) {
      if (param.in !== 'local') continue;
      const value = values[param.name];
      if (value !== undefined) {
        local[param.name] = value;
      }
    }

    return {
      endpoint,
      url,
      method: endpoint.method,
      body,
      local,
    };
  }

  async executePrepared(
    prepared: PreparedCall,
    signal?: AbortSignal,
  ): Promise<ApiCallResult> {
    const startedAt = performance.now();

    try {
      const response = await fetchJson({
        url: prepared.url,
        timeoutMs: config.EXTERNAL_API_TIMEOUT_MS,
        signal,
        method: prepared.method,
        body: prepared.body,
        retry: prepared.method === 'GET',
      });

      if (prepared.method === 'POST') {
        const created = extractProduct(response.data);
        return {
          ok: true,
          endpointId: prepared.endpoint.id,
          method: prepared.method,
          path: prepared.endpoint.path,
          status: response.status,
          durationMs: response.durationMs,
          itemCount: created ? 1 : null,
          bytes: response.bytes,
          data: created ?? response.data,
          view: created ? buildCreatedView() : undefined,
          catalogSummary: null,
        };
      }

      const all = extractProducts(response.data);

      if (all.length > 0) {
        const items = shapeProducts(all, prepared.local);
        return {
          ok: true,
          endpointId: prepared.endpoint.id,
          method: prepared.method,
          path: prepared.endpoint.path,
          status: response.status,
          durationMs: response.durationMs,
          itemCount: items.length,
          bytes: response.bytes,
          data: items,
          view: buildView(all, items, prepared.local),
          catalogSummary: summarizeProducts(all),
        };
      }

      return {
        ok: true,
        endpointId: prepared.endpoint.id,
        method: prepared.method,
        path: prepared.endpoint.path,
        status: response.status,
        durationMs: response.durationMs,
        itemCount: countItems(response.data),
        bytes: response.bytes,
        data: response.data,
        catalogSummary: null,
      };
    } catch (error) {
      return {
        ok: false,
        endpointId: prepared.endpoint.id,
        method: prepared.method,
        path: prepared.endpoint.path,
        status: null,
        durationMs: Math.round(performance.now() - startedAt),
        itemCount: null,
        bytes: 0,
        data: null,
        error: error instanceof Error ? error.message : 'Error desconocido al consultar la API.',
      };
    }
  }

  async execute(
    endpointId: string,
    args: Args,
    signal?: AbortSignal,
  ): Promise<ApiCallResult> {
    const startedAt = performance.now();
    let endpoint: Endpoint | undefined;

    try {
      endpoint = this.describe(endpointId);
      const prepared = this.prepare(endpointId, args);
      return await this.executePrepared(prepared, signal);
    } catch (error) {
      return {
        ok: false,
        endpointId,
        method: endpoint?.method ?? 'GET',
        path: endpoint?.path ?? '',
        status: null,
        durationMs: Math.round(performance.now() - startedAt),
        itemCount: null,
        bytes: 0,
        data: null,
        error: error instanceof Error ? error.message : 'Error desconocido al consultar la API.',
      };
    }
  }
}
