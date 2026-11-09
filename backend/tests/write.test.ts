import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiExecutor } from '../src/agent/executor.js';

const executor = new ApiExecutor();
const created = {
  id: 22,
  name: 'Prueba Agente Demo',
  price: 1,
  stock: 1,
  image_url: null,
};

const validArgs = { name: 'Prueba Agente Demo', price: 1, stock: 1 };

function stubFetch(status = 201) {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify(created), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('create_product', () => {
  it('prepara el body POST y completa image_url con null', () => {
    const prepared = executor.prepare('create_product', validArgs);
    expect(prepared.method).toBe('POST');
    expect(prepared.body).toEqual({
      name: 'Prueba Agente Demo',
      price: 1,
      stock: 1,
      image_url: null,
    });
  });

  it('ejecuta una sola escritura y devuelve la vista de producto creado', async () => {
    const fetchMock = stubFetch();
    const result = await executor.execute('create_product', validArgs);

    expect(result.ok).toBe(true);
    expect(result.view?.created).toBe(true);
    expect(result.view?.title).toBe('Producto creado');
    expect(result.itemCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(String(call[1].body))).toEqual({
      name: 'Prueba Agente Demo',
      price: 1,
      stock: 1,
      image_url: null,
    });
  });

  it('no reintenta una escritura que falla', async () => {
    const fetchMock = vi.fn(async () => new Response('boom', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await executor.execute('create_product', validArgs);
    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rechaza datos inválidos', async () => {
    const missingName = await executor.execute('create_product', { price: 1, stock: 1 });
    expect(missingName.ok).toBe(false);
    expect(missingName.error).toContain('name');

    const negativePrice = await executor.execute('create_product', {
      name: 'X',
      price: -1,
      stock: 1,
    });
    expect(negativePrice.ok).toBe(false);
    expect(negativePrice.error).toContain('mayor o igual');

    const unknown = await executor.execute('create_product', {
      ...validArgs,
      sql: 'DROP TABLE products',
    });
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toContain('no existe');
  });
});
