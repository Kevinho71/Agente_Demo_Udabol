import { describe, expect, it } from 'vitest';
import {
  buildView,
  shapeProducts,
  type ProductLike,
} from '../src/agent/summarize.js';

const products: ProductLike[] = [
  { id: 1, name: 'Computadora', price: 1000, stock: 10 },
  { id: 2, name: 'Mouse', price: 50, stock: 3 },
  { id: 3, name: 'Teclado', price: 100, stock: 1 },
  { id: 4, name: 'Notebook', price: 1000, stock: 8 },
  { id: 5, name: 'Monitor', price: 200, stock: 15 },
];

function view(local: Record<string, unknown>) {
  const items = shapeProducts(products, local);
  return { items, view: buildView(products, items, local) };
}

describe('shaping local', () => {
  it('ordena de mayor a menor precio y expande empates con limit 1', () => {
    const { items, view: result } = view({ sort_by: 'price', order: 'desc', limit: 1 });
    expect(items.map((item) => item.id)).toEqual([1, 4]);
    expect(result.mode).toBe('ranking');
    expect(result.title).toContain('Precio máximo');
    expect(result.returned).toBe(2);
  });

  it('devuelve el top 2 más baratos', () => {
    const { items, view: result } = view({ sort_by: 'price', order: 'asc', limit: 2 });
    expect(items.map((item) => item.price)).toEqual([50, 100]);
    expect(result.mode).toBe('ranking');
    expect(result.title).toBe('Top 2 más baratos');
    expect(result.columns).toEqual(['rank', 'name', 'price', 'stock']);
  });

  it('filtra stock menor a 5', () => {
    const { items, view: result } = view({ max_stock: 4, sort_by: 'stock', order: 'asc' });
    expect(items.map((item) => item.stock)).toEqual([1, 3]);
    expect(result.mode).toBe('filter');
    expect(result.title).toBe('Stock menor a 5');
    expect(result.columns).toEqual(['name', 'stock', 'price']);
  });

  it('busca por nombre sin distinguir mayúsculas', () => {
    const { items, view: result } = view({ name_contains: 'mouse' });
    expect(items).toHaveLength(1);
    expect(result.mode).toBe('single');
    expect(result.title).toBe('Coincidencia para “mouse”');
  });

  it('filtra por rango de precios', () => {
    const { items, view: result } = view({ min_price: 100, max_price: 500 });
    expect(items.map((item) => item.id)).toEqual([3, 5]);
    expect(result.title).toBe('Precios entre 100 y 500');
  });

  it('oculta la tabla cuando show_table es false', () => {
    const { items, view: result } = view({ show_table: false });
    expect(items).toHaveLength(5);
    expect(result.mode).toBe('none');
    expect(result.showTable).toBe(false);
  });

  it('sin shaping devuelve el catálogo completo', () => {
    const { view: result } = view({});
    expect(result.mode).toBe('all');
    expect(result.title).toBe('Catálogo completo (5)');
  });

  it('reporta cuántas coincidencias hay antes del límite', () => {
    const { view: result } = view({ min_price: 100, limit: 2, sort_by: 'price' });
    expect(result.returned).toBe(2);
    expect(result.totalMatched).toBe(4);
  });
});
