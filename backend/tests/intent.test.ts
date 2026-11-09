import { describe, expect, it } from 'vitest';
import { ApiExecutor } from '../src/agent/executor.js';
import { applySingularIntent } from '../src/agent/intent.js';

const executor = new ApiExecutor();

function prepare(args: Record<string, unknown> = {}) {
  return executor.prepare('list_products', args);
}

describe('intención de ganador único', () => {
  it('fuerza limit 1 en un seguimiento "de estos 2, cuál es el más caro"', () => {
    const prepared = prepare({ max_stock: 1, sort_by: 'price', order: 'desc' });
    applySingularIntent('y de estos 2 productos cual es el mas caro', prepared);
    expect(prepared.local.limit).toBe(1);
    expect(prepared.local.sort_by).toBe('price');
    expect(prepared.local.order).toBe('desc');
  });

  it('infiere el orden cuando el modelo no lo puso', () => {
    const prepared = prepare({ max_stock: 4 });
    applySingularIntent('de los de stock bajo, cuál tiene menos stock', prepared);
    expect(prepared.local.limit).toBe(1);
    expect(prepared.local.sort_by).toBe('stock');
    expect(prepared.local.order).toBe('asc');
  });

  it('no toca una consulta que pide una lista', () => {
    const prepared = prepare({ sort_by: 'price', order: 'asc', limit: 10 });
    applySingularIntent('top 10 más baratos', prepared);
    expect(prepared.local.limit).toBe(10);
    expect(prepared.local.sort_by).toBe('price');
  });

  it('no toca una consulta de mínimo stock sin intención de ganador', () => {
    const prepared = prepare({ sort_by: 'stock', order: 'asc', limit: 1 });
    applySingularIntent('quiero ver solo el producto con menos stock', prepared);
    expect(prepared.local.limit).toBe(1);
    expect(prepared.local.sort_by).toBe('stock');
  });

  it('no toca una pregunta de lista aunque mencione un extremo', () => {
    const prepared = prepare({ max_stock: 4, sort_by: 'price', order: 'asc' });
    applySingularIntent('de los de stock bajo, muéstrame los 3 más baratos', prepared);
    expect(prepared.local.limit).toBeUndefined();
  });

  it('no se aplica a acciones de escritura', () => {
    const prepared = executor.prepare('create_product', {
      name: 'X',
      price: 1,
      stock: 1,
    });
    applySingularIntent('cuál es el más caro', prepared);
    expect(prepared.local).toEqual({});
  });
});
