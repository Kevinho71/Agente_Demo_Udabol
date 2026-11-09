import { describe, expect, it } from 'vitest';
import { summarizeProducts } from '../src/agent/summarize.js';

const products = [
  { id: 1, name: 'Computadora', price: 1000, stock: 2 },
  { id: 2, name: 'Mouse', price: 50, stock: 10 },
  { id: 3, name: 'Teclado', price: 100, stock: 0 },
  { id: 'invalido', name: 'Basura' },
];

describe('summarizeProducts', () => {
  it('calcula totales solo con productos validos', () => {
    const summary = summarizeProducts(products);
    expect(summary?.count).toBe(3);
    expect(summary?.totalStock).toBe(12);
    expect(summary?.inventoryValue).toBe(2500);
    expect(summary?.lowStockCount).toBe(2);
    expect(summary?.outOfStockCount).toBe(1);
  });

  it('ordena extremos de precio', () => {
    const summary = summarizeProducts(products);
    expect(summary?.cheapest?.name).toBe('Mouse');
    expect(summary?.mostExpensive?.name).toBe('Computadora');
    expect(summary?.averagePrice).toBe(383.33);
  });

  it('devuelve null si no hay productos validos', () => {
    expect(summarizeProducts([{ foo: 1 }])).toBeNull();
    expect(summarizeProducts(null)).toBeNull();
  });
});
