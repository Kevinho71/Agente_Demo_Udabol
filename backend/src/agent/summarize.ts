export interface ProductLike {
  id: number;
  name: string;
  price: number;
  stock: number;
  image_url?: string | null;
}

export const LOW_STOCK_THRESHOLD = 5;

export type ColumnKey = 'rank' | 'name' | 'price' | 'stock' | 'id';
export type ViewMode = 'single' | 'ranking' | 'filter' | 'all' | 'none';

export interface TableView {
  mode: ViewMode;
  title: string;
  columns: ColumnKey[];
  returned: number;
  totalMatched: number;
  totalCatalog: number | null;
  showTable: boolean;
  limit: number | null;
  sortBy: string | null;
  order: 'asc' | 'desc' | null;
  created: boolean;
}

function isProduct(value: unknown): value is ProductLike {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'number' &&
    typeof item.name === 'string' &&
    typeof item.price === 'number' &&
    typeof item.stock === 'number'
  );
}

export function extractProducts(data: unknown): ProductLike[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isProduct);
}

export function extractProduct(data: unknown): ProductLike | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  return isProduct(data) ? data : null;
}

export interface CatalogSummary {
  count: number;
  totalStock: number;
  inventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  cheapest: { id: number; name: string; price: number } | null;
  mostExpensive: { id: number; name: string; price: number } | null;
  averagePrice: number | null;
  lowStock: Array<{ id: number; name: string; stock: number }>;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const numberFormatter = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 });
const formatNumber = (value: number) => numberFormatter.format(value);

export function summarizeProducts(data: unknown): CatalogSummary | null {
  const products = extractProducts(data);
  if (products.length === 0) return null;

  const totalStock = products.reduce((sum, product) => sum + product.stock, 0);
  const inventoryValue = products.reduce(
    (sum, product) => sum + product.price * product.stock,
    0,
  );
  const sortedByPrice = [...products].sort((a, b) => a.price - b.price || a.id - b.id);
  const lowStock = products
    .filter((product) => product.stock < LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.stock - b.stock || a.id - b.id)
    .map((product) => ({ id: product.id, name: product.name, stock: product.stock }));

  const cheapest = sortedByPrice[0];
  const mostExpensive = sortedByPrice[sortedByPrice.length - 1];

  return {
    count: products.length,
    totalStock,
    inventoryValue: round2(inventoryValue),
    lowStockCount: lowStock.length,
    outOfStockCount: products.filter((product) => product.stock === 0).length,
    cheapest: cheapest
      ? { id: cheapest.id, name: cheapest.name, price: cheapest.price }
      : null,
    mostExpensive: mostExpensive
      ? { id: mostExpensive.id, name: mostExpensive.name, price: mostExpensive.price }
      : null,
    averagePrice: round2(
      products.reduce((sum, product) => sum + product.price, 0) / products.length,
    ),
    lowStock,
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sortField(local: Record<string, unknown>): 'price' | 'stock' | 'name' | null {
  return local.sort_by === 'price' || local.sort_by === 'stock' || local.sort_by === 'name'
    ? local.sort_by
    : null;
}

function sortOrder(local: Record<string, unknown>): 'asc' | 'desc' {
  return local.order === 'desc' ? 'desc' : 'asc';
}

function nameFilter(local: Record<string, unknown>): string | null {
  return typeof local.name_contains === 'string' && local.name_contains.trim()
    ? local.name_contains.trim()
    : null;
}

function hasFilters(local: Record<string, unknown>): boolean {
  return (
    nameFilter(local) !== null ||
    toNumber(local.min_price) !== null ||
    toNumber(local.max_price) !== null ||
    toNumber(local.min_stock) !== null ||
    toNumber(local.max_stock) !== null
  );
}

export function shapeProducts(
  all: ProductLike[],
  local: Record<string, unknown>,
): ProductLike[] {
  let items = [...all];

  const name = nameFilter(local);
  if (name) {
    const needle = name.toLowerCase();
    items = items.filter((product) => product.name.toLowerCase().includes(needle));
  }

  const minPrice = toNumber(local.min_price);
  if (minPrice !== null) items = items.filter((product) => product.price >= minPrice);

  const maxPrice = toNumber(local.max_price);
  if (maxPrice !== null) items = items.filter((product) => product.price <= maxPrice);

  const minStock = toNumber(local.min_stock);
  if (minStock !== null) items = items.filter((product) => product.stock >= minStock);

  const maxStock = toNumber(local.max_stock);
  if (maxStock !== null) items = items.filter((product) => product.stock <= maxStock);

  const explicitField = sortField(local);
  const hasStockFilter =
    toNumber(local.min_stock) !== null || toNumber(local.max_stock) !== null;
  const hasPriceFilter =
    toNumber(local.min_price) !== null || toNumber(local.max_price) !== null;
  const field = explicitField ?? (hasStockFilter ? 'stock' : hasPriceFilter ? 'price' : null);
  if (field) {
    const order = sortOrder(local);
    items.sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      let comparison =
        typeof av === 'string' && typeof bv === 'string'
          ? av.localeCompare(bv, 'es')
          : Number(av) - Number(bv);
      if (order === 'desc') comparison = -comparison;
      return comparison !== 0 ? comparison : a.id - b.id;
    });
  }

  const limit = toNumber(local.limit);
  if (limit !== null && limit > 0) {
    if (limit === 1 && field) {
      const first = items[0];
      if (!first) return [];
      const firstValue = first[field];
      return items.filter((product) => product[field] === firstValue);
    }
    return items.slice(0, limit);
  }

  return items;
}

function columnsFor(
  mode: ViewMode,
  local: Record<string, unknown>,
): ColumnKey[] {
  if (mode === 'ranking') return ['rank', 'name', 'price', 'stock'];
  if (mode === 'single') return ['name', 'id', 'price', 'stock'];
  if (
    mode === 'filter' &&
    (toNumber(local.max_stock) !== null || toNumber(local.min_stock) !== null)
  ) {
    return ['name', 'stock', 'price'];
  }
  return ['name', 'price', 'stock'];
}

function titleFor(
  mode: ViewMode,
  local: Record<string, unknown>,
  returned: number,
  totalCatalog: number,
): string {
  const field = sortField(local);
  const order = sortOrder(local);
  const limit = toNumber(local.limit);
  const name = nameFilter(local);
  const minPrice = toNumber(local.min_price);
  const maxPrice = toNumber(local.max_price);
  const minStock = toNumber(local.min_stock);
  const maxStock = toNumber(local.max_stock);

  if (mode === 'none') return '';
  if (mode === 'all') return `Catálogo completo (${totalCatalog})`;

  if (mode === 'single') {
    if (field === 'price') {
      return order === 'desc' ? 'Producto más caro' : 'Producto más barato';
    }
    if (field === 'stock') {
      return order === 'desc' ? 'Producto con más stock' : 'Producto con menos stock';
    }
    if (name) return `Coincidencia para “${name}”`;
    if (minStock !== null || maxStock !== null) return 'Producto filtrado por stock';
    return 'Producto';
  }

  if (mode === 'filter') {
    if (name) return `Coincidencias para “${name}”`;
    if (minStock !== null && maxStock !== null) {
      return `Stock entre ${formatNumber(minStock)} y ${formatNumber(maxStock)}`;
    }
    if (maxStock !== null) return `Stock menor a ${formatNumber(maxStock + 1)}`;
    if (minStock !== null) return `Stock desde ${formatNumber(minStock)}`;
    if (minPrice !== null && maxPrice !== null) {
      return `Precios entre ${formatNumber(minPrice)} y ${formatNumber(maxPrice)}`;
    }
    if (minPrice !== null) return `Precios desde ${formatNumber(minPrice)}`;
    if (maxPrice !== null) return `Precios hasta ${formatNumber(maxPrice)}`;
    return 'Resultados filtrados';
  }

  if (limit === 1 && field && returned > 1) {
    const base =
      field === 'price'
        ? order === 'desc'
          ? 'Precio máximo'
          : 'Precio mínimo'
        : field === 'stock'
          ? order === 'desc'
            ? 'Mayor stock'
            : 'Menor stock'
          : 'Coincidencias por nombre';
    return `${base} · ${returned} productos`;
  }

  if (field === 'price') {
    return `Top ${returned} ${order === 'desc' ? 'más caros' : 'más baratos'}`;
  }
  if (field === 'stock') {
    return `Top ${returned} con ${order === 'desc' ? 'más' : 'menos'} stock`;
  }
  if (field === 'name') {
    return `${returned} productos por nombre`;
  }
  if (name) return `Coincidencias para “${name}”`;
  if (minStock !== null && maxStock !== null) {
    return `Stock entre ${formatNumber(minStock)} y ${formatNumber(maxStock)}`;
  }
  if (maxStock !== null) return `Stock menor a ${formatNumber(maxStock + 1)}`;
  if (minStock !== null) return `Stock desde ${formatNumber(minStock)}`;
  if (minPrice !== null && maxPrice !== null) {
    return `Precios entre ${formatNumber(minPrice)} y ${formatNumber(maxPrice)}`;
  }
  if (minPrice !== null) return `Precios desde ${formatNumber(minPrice)}`;
  if (maxPrice !== null) return `Precios hasta ${formatNumber(maxPrice)}`;
  return `Catálogo completo (${totalCatalog})`;
}

export function buildView(
  all: ProductLike[],
  items: ProductLike[],
  local: Record<string, unknown>,
): TableView {
  const showTable = local.show_table !== false;
  const matched = shapeProducts(all, { ...local, limit: undefined });
  const totalMatched = matched.length;
  const limit = toNumber(local.limit);
  const field = sortField(local);
  const order = field ? sortOrder(local) : null;
  const filtered = hasFilters(local);

  let mode: ViewMode;
  if (!showTable) mode = 'none';
  else if (items.length === 1) mode = 'single';
  else if (field && limit !== null) mode = 'ranking';
  else if (filtered || items.length === 0) mode = 'filter';
  else mode = 'all';

  const isTieView = field !== null && limit === 1 && items.length > 1;

  return {
    mode,
    title: titleFor(mode, local, items.length, all.length),
    columns: mode === 'none' ? [] : columnsFor(mode, local),
    returned: items.length,
    totalMatched: isTieView ? items.length : totalMatched,
    totalCatalog: all.length,
    showTable,
    limit,
    sortBy: field,
    order,
    created: false,
  };
}

export function buildCreatedView(count = 1): TableView {
  const total = Math.max(1, count);
  return {
    mode: total === 1 ? 'single' : 'all',
    title: total === 1 ? 'Producto creado' : `${total} productos creados`,
    columns: ['name', 'id', 'price', 'stock'],
    returned: total,
    totalMatched: total,
    totalCatalog: null,
    showTable: true,
    limit: null,
    sortBy: null,
    order: null,
    created: true,
  };
}

export function toolPayload(result: {
  ok: boolean;
  endpointId: string;
  data: unknown;
  error?: string;
  view?: TableView;
  catalogSummary?: CatalogSummary | null;
}): Record<string, unknown> {
  if (!result.ok) {
    return {
      ok: false,
      endpoint: result.endpointId,
      error: result.error ?? 'La consulta falló.',
    };
  }

  if (result.view?.created) {
    return {
      ok: true,
      endpoint: result.endpointId,
      created: result.data,
      view: result.view,
      note: 'El producto se creó correctamente. Confirmalo al usuario con su id.',
    };
  }

  const products = extractProducts(result.data);
  const summary = result.catalogSummary ?? summarizeProducts(result.data);

  if (products.length > 0 || result.view) {
    return {
      ok: true,
      endpoint: result.endpointId,
      returned: products.length,
      totalMatched: result.view?.totalMatched ?? products.length,
      catalogSummary: summary,
      view: result.view,
      items: products,
      note: 'La tabla de la interfaz muestra exactamente estos items. Los precios no tienen moneda definida: no agregues símbolos.',
    };
  }

  return {
    ok: true,
    endpoint: result.endpointId,
    data: result.data,
  };
}
