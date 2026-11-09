import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ApiExecutor } from '../src/agent/executor.js';
import { createPendingAction } from '../src/agent/pending-actions.js';

const executor = new ApiExecutor();

function makeAction(sessionId: string, names: string[]) {
  const items = names.map((name, index) => {
    const price = index + 1;
    const stock = index + 1;
    const prepared = executor.prepare('create_product', { name, price, stock });
    return {
      prepared,
      summary: { name, price, stock, image_url: null },
    };
  });

  return createPendingAction({ sessionId, items });
}

function stubSequence(statuses: number[]) {
  let call = 0;
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const index = call;
    call += 1;
    const status = statuses[index] ?? 201;
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      name?: string;
      price?: number;
      stock?: number;
    };
    const product = {
      id: 30 + index,
      name: body.name ?? `Producto ${index}`,
      price: body.price ?? index,
      stock: body.stock ?? index,
      image_url: null,
    };
    return new Response(JSON.stringify(product), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('acciones confirmadas', () => {
  it('confirma una creación y consume la acción', async () => {
    stubSequence([201]);
    const sessionId = `session-confirm-${Date.now()}`;
    const action = makeAction(sessionId, ['Producto de prueba']);
    const app = createApp();

    const response = await request(app)
      .post(`/api/actions/${action.id}/confirm`)
      .send({ sessionId })
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.created).toHaveLength(1);
    expect(response.body.created[0].id).toBe(30);
    expect(response.body.failed).toEqual([]);
    expect(response.body.view.created).toBe(true);
    expect(response.body.view.title).toBe('Producto creado');
    expect(response.body.message).toContain('#30');

    await request(app)
      .post(`/api/actions/${action.id}/confirm`)
      .send({ sessionId })
      .expect(404);
  });

  it('crea un lote en secuencia y devuelve una vista de lote', async () => {
    stubSequence([201, 201, 201]);
    const sessionId = `session-batch-${Date.now()}`;
    const action = makeAction(sessionId, ['Batch A', 'Batch B', 'Batch C']);
    const app = createApp();

    const response = await request(app)
      .post(`/api/actions/${action.id}/confirm`)
      .send({ sessionId })
      .expect(200);

    expect(response.body.created).toHaveLength(3);
    expect(response.body.failed).toEqual([]);
    expect(response.body.view.mode).toBe('all');
    expect(response.body.view.title).toBe('3 productos creados');
    expect(response.body.httpStatus).toBe(201);
  });

  it('reporta fallos parciales sin perder los productos creados', async () => {
    stubSequence([201, 500]);
    const sessionId = `session-partial-${Date.now()}`;
    const action = makeAction(sessionId, ['Batch A', 'Batch B']);
    const app = createApp();

    const response = await request(app)
      .post(`/api/actions/${action.id}/confirm`)
      .send({ sessionId })
      .expect(200);

    expect(response.body.created).toHaveLength(1);
    expect(response.body.failed).toHaveLength(1);
    expect(response.body.failed[0].name).toBe('Batch B');
    expect(response.body.httpStatus).toBe(207);
    expect(response.body.message).toContain('No se pudieron crear');
  });

  it('devuelve error si no se pudo crear ninguno', async () => {
    stubSequence([500, 500]);
    const sessionId = `session-fail-${Date.now()}`;
    const action = makeAction(sessionId, ['Batch A', 'Batch B']);
    const app = createApp();

    const response = await request(app)
      .post(`/api/actions/${action.id}/confirm`)
      .send({ sessionId })
      .expect(502);

    expect(response.body.error.code).toBe('WRITE_FAILED');
    expect(response.body.error.message).toContain('Batch A');
  });

  it('cancela sin ejecutar la escritura', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const sessionId = `session-cancel-${Date.now()}`;
    const action = makeAction(sessionId, ['Cancelar Demo']);
    const app = createApp();

    const response = await request(app)
      .post(`/api/actions/${action.id}/cancel`)
      .send({ sessionId })
      .expect(200);

    expect(response.body.cancelled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechaza una confirmación de otra sesión', async () => {
    const sessionId = `session-owner-${Date.now()}`;
    const action = makeAction(sessionId, ['Privado']);
    const app = createApp();

    await request(app)
      .post(`/api/actions/${action.id}/confirm`)
      .send({ sessionId: 'otra-sesion' })
      .expect(404);
  });
});
