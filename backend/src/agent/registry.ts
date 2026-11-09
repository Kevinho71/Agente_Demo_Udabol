import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const ParamSchema = z
  .object({
    name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Nombre de parámetro inválido'),
    in: z.enum(['query', 'path', 'local', 'body']),
    required: z.boolean().default(false),
    type: z.enum(['string', 'integer', 'number', 'boolean']),
    description: z.string().min(3),
    enum: z.array(z.string()).min(1).optional(),
    nullable: z.boolean().default(false),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    maxLength: z.number().int().positive().optional(),
  })
  .strict();

const EndpointSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z][a-z0-9_]{1,63}$/, 'El id debe ser snake_case de hasta 64 caracteres'),
    method: z.enum(['GET', 'POST']),
    path: z.string().startsWith('/'),
    summary: z.string().min(5),
    description: z.string().min(10),
    enabled: z.boolean().default(true),
    effects: z.enum(['read', 'write']).default('read'),
    confirm: z.boolean().default(true),
    params: z.array(ParamSchema).default([]),
    response: z.unknown(),
    examples: z.array(z.string()).default([]),
  })
  .strict();

const EndpointsFileSchema = z
  .object({
    version: z.literal(1),
    api: z
      .object({
        name: z.string().min(1),
        description: z.string().default(''),
        baseUrlEnv: z.literal('EXTERNAL_API_BASE_URL'),
        docsUrl: z.url().optional(),
      })
      .strict(),
    definitions: z.record(z.string(), z.unknown()).default({}),
    endpoints: z.array(EndpointSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const endpoint of file.endpoints) {
      if (seen.has(endpoint.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['endpoints'],
          message: `Endpoint duplicado: ${endpoint.id}`,
        });
      }
      seen.add(endpoint.id);

      const pathParams = [...endpoint.path.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)]
        .map((match) => match[1])
        .filter((name): name is string => Boolean(name));
      const declaredPathParams = endpoint.params
        .filter((param) => param.in === 'path')
        .map((param) => param.name);

      for (const name of pathParams) {
        if (!declaredPathParams.includes(name)) {
          ctx.addIssue({
            code: 'custom',
            path: ['endpoints', endpoint.id],
            message: `El path usa {${name}} pero no está declarado en params`,
          });
        }
      }

      const names = endpoint.params.map((param) => param.name);
      if (new Set(names).size !== names.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['endpoints', endpoint.id],
          message: 'Hay parámetros repetidos',
        });
      }

      const hasBody = endpoint.params.some((param) => param.in === 'body');
      if (endpoint.method === 'GET' && hasBody) {
        ctx.addIssue({
          code: 'custom',
          path: ['endpoints', endpoint.id],
          message: 'Un endpoint GET no puede declarar parámetros de body',
        });
      }

      if (endpoint.effects === 'write' && endpoint.method !== 'POST') {
        ctx.addIssue({
          code: 'custom',
          path: ['endpoints', endpoint.id],
          message: 'Las acciones de escritura deben usar POST',
        });
      }
    }
  });

export type EndpointParam = z.infer<typeof ParamSchema>;
export type Endpoint = z.infer<typeof EndpointSchema>;
export type EndpointsFile = z.infer<typeof EndpointsFileSchema>;

function loadEndpointsFile(): EndpointsFile {
  const filePath = join(import.meta.dirname, 'endpoints.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  const parsed = EndpointsFileSchema.safeParse(raw);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`endpoints.json inválido:\n${details}`);
  }

  return parsed.data;
}

export const endpointsFile = loadEndpointsFile();

export const endpoints = endpointsFile.endpoints.filter((endpoint) => endpoint.enabled);

export function findEndpoint(id: string): Endpoint | undefined {
  return endpoints.find((endpoint) => endpoint.id === id);
}

export function publicEndpoints() {
  return endpoints.map((endpoint) => ({
    id: endpoint.id,
    method: endpoint.method,
    path: endpoint.path,
    summary: endpoint.summary,
    description: endpoint.description,
    effects: endpoint.effects,
    params: endpoint.params.map((param) => ({
      name: param.name,
      in: param.in,
      required: param.required,
      type: param.type,
      description: param.description,
    })),
    examples: endpoint.examples,
  }));
}
