import type { PreparedCall } from './executor.js';

type Extreme = {
  sortBy: 'price' | 'stock';
  order: 'asc' | 'desc';
};

const EXTREMES: Array<{ pattern: RegExp; extreme: Extreme }> = [
  {
    pattern: /m[aá]s caro|mayor precio|precio m[aá]ximo/g,
    extreme: { sortBy: 'price', order: 'desc' },
  },
  {
    pattern: /m[aá]s barato|menor precio|precio m[ií]nimo/g,
    extreme: { sortBy: 'price', order: 'asc' },
  },
  {
    pattern: /m[aá]s stock|mayor stock|stock m[aá]ximo|m[aá]s unidades/g,
    extreme: { sortBy: 'stock', order: 'desc' },
  },
  {
    pattern: /menos stock|menor stock|stock m[ií]nimo|menos unidades/g,
    extreme: { sortBy: 'stock', order: 'asc' },
  },
];

const SINGULAR = /cu[aá]l|de estos|de estas|de los|de las|el m[aá]s|la m[aá]s/;
const ASKS_FOR_LIST =
  /\b(?:top|los|las|mu[eé]strame|mostrame|dame|quiero)\s+\d+\b|\b\d+\s+m[aá]s\b/;

function detectLastExtreme(text: string): Extreme | null {
  const matches: Array<{ index: number; extreme: Extreme }> = [];

  for (const { pattern, extreme } of EXTREMES) {
    for (const match of text.matchAll(pattern)) {
      matches.push({ index: match.index ?? 0, extreme });
    }
  }

  matches.sort((a, b) => a.index - b.index);
  return matches[matches.length - 1]?.extreme ?? null;
}

/**
 * Si la pregunta pide un único ganador dentro de un conjunto
 * ("de estos 2, ¿cuál es el más caro?"), fuerza limit 1 y, si el
 * modelo no eligió orden, lo completa. Los empates se expanden en
 * shapeProducts, así que no se pierden.
 */
export function applySingularIntent(
  userMessage: string,
  prepared: PreparedCall,
): void {
  if (prepared.endpoint.id !== 'list_products') return;

  const text = userMessage.toLowerCase();
  if (!SINGULAR.test(text) || ASKS_FOR_LIST.test(text)) return;

  const extreme = detectLastExtreme(text);
  if (!extreme) return;

  if (!prepared.local.sort_by) {
    prepared.local.sort_by = extreme.sortBy;
    prepared.local.order = extreme.order;
  }

  const limit = prepared.local.limit;
  if (typeof limit !== 'number' || limit > 1 || limit < 1) {
    prepared.local.limit = 1;
  }
}
