import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiExecutor } from '../src/agent/executor.js';

const executor = new ApiExecutor();

const products = [
  { id: 1, name: 'Computadora', price: 10000, stock: 10, image_url: 'x' },
  { id: 2, name: 'Mouse', price: 55, stock: 3, image_url: 'string' },
];

function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApiExecutor', () => {
  it('consulta el endpoint declarado y cuenta los items', async () => {
    mockFetch(products);
    const result = await executor.execute('list_products', {});
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.itemCount).toBe(2);
    expect(result.data).toEqual(products);
  });

  it('rechaza acciones fuera del mapa', async () => {
    const result = await executor.execute('drop_database', {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no está declarada');
  });

  it('rechaza argumentos desconocidos', async () => {
    const result = await executor.execute('list_products', {
      sql: 'DROP TABLE products',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no existe');
  });

  it('devuelve error controlado si la API falla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    );
    const result = await executor.execute('list_products', {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });

  it('no acepta respuestas que no son JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>', { status: 200 })),
    );
    const result = await executor.execute('list_products', {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('JSON');
  });
});
