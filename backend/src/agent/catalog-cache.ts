import type { CatalogSummary, ProductLike } from './summarize.js';

export interface CatalogBody {
  products: ProductLike[];
  summary: CatalogSummary | null;
  fetchedAt: string;
  source: string;
}

const TTL_MS = 30_000;

let cache: { storedAt: number; body: CatalogBody } | null = null;

export function getCatalogCache(): CatalogBody | null {
  if (!cache) return null;
  if (Date.now() - cache.storedAt > TTL_MS) {
    cache = null;
    return null;
  }
  return cache.body;
}

export function setCatalogCache(body: CatalogBody): void {
  cache = { storedAt: Date.now(), body };
}

export function invalidateCatalogCache(): void {
  cache = null;
}
