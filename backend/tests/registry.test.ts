import { describe, expect, it } from 'vitest';
import { endpointsFile, findEndpoint, publicEndpoints } from '../src/agent/registry.js';

describe('endpoints.json', () => {
  it('declara el endpoint GET del catálogo con shaping local', () => {
    const endpoint = findEndpoint('list_products');
    expect(endpoint).toBeDefined();
    expect(endpoint?.method).toBe('GET');
    expect(endpoint?.path).toBe('/api/v1/products');
    expect(endpoint?.effects).toBe('read');
    expect(endpoint?.params.some((param) => param.in === 'local')).toBe(true);
  });

  it('declara la creación de producto como POST con confirmación', () => {
    const endpoint = findEndpoint('create_product');
    expect(endpoint).toBeDefined();
    expect(endpoint?.method).toBe('POST');
    expect(endpoint?.path).toBe('/api/v1/products');
    expect(endpoint?.effects).toBe('write');
    expect(endpoint?.confirm).toBe(true);
    expect(endpoint?.params.filter((param) => param.in === 'body')).toHaveLength(4);
  });

  it('solo los endpoints de lectura usan GET', () => {
    for (const endpoint of endpointsFile.endpoints) {
      if (endpoint.effects === 'read') {
        expect(endpoint.method).toBe('GET');
      }
    }
  });

  it('publica solo campos seguros', () => {
    const [first] = publicEndpoints();
    expect(first).toMatchObject({ id: 'list_products', method: 'GET', effects: 'read' });
    expect(first).not.toHaveProperty('enabled');
    expect(first).not.toHaveProperty('confirm');
  });

  it('rechaza ids inexistentes', () => {
    expect(findEndpoint('delete_products')).toBeUndefined();
  });
});
