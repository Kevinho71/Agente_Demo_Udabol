import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const products = [
  { id: 1, name: 'Computadora', price: 10000, stock: 10, image_url: 'x' },
  { id: 2, name: 'Celular', price: 3000, stock: 3, image_url: 'string' },
];

function stubUpstream() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(products), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/chat', () => {
  it('devuelve un stream SSE con tool call, tokens y resultado', async () => {
    stubUpstream();
    const app = createApp();

    const response = await request(app)
      .post('/api/chat')
      .send({ message: '¿Qué productos hay?' })
      .expect(200)
      .expect('content-type', /text\/event-stream/);

    const body = response.text;
    expect(body).toContain('event: meta');
    expect(body).toContain('event: tool');
    expect(body).toContain('"endpointId":"list_products"');
    expect(body).toContain('event: token');
    expect(body).toContain('event: result');
    expect(body).toContain('"kind":"products"');
    expect(body).toContain('"view"');
    expect(body).toContain('"title":"Catálogo completo (2)"');
    expect(body).toContain('event: done');
  });

  it('rechaza consultas vacias con JSON de error', async () => {
    const app = createApp();
    const response = await request(app).post('/api/chat').send({ message: '   ' }).expect(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
  });
});
