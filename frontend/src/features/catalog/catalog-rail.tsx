import { ExternalLinkIcon } from 'lucide-react'
import {
  computeCatalogStats,
  formatNumber,
  formatPrice,
  LOW_STOCK,
  productLabel,
  relativeTime,
} from '@/lib/format'
import type { Product } from '@/lib/types'
import { cn } from '@/lib/utils'

interface CatalogRailProps {
  products: Product[]
  lastDataAt: Date | null
  docsUrl: string | null
}

function Metric({
  label,
  value,
  index,
  tone = 'brand',
}: {
  label: string
  value: string
  index: number
  tone?: 'brand' | 'warning'
}) {
  return (
    <div
      className={cn(
        'px-3 py-2.5',
        index < 2 && 'border-b border-hairline',
        index % 2 === 0 && 'border-r border-hairline',
      )}
    >
      <div className="text-[11px] leading-4 text-ink-soft">{label}</div>
      <div
        className={cn(
          'numeric mt-0.5 text-[22px] font-normal leading-7 tracking-[-0.01em]',
          tone === 'warning' ? 'text-warning' : 'text-brand-deep',
        )}
      >
        {value}
      </div>
    </div>
  )
}

export function CatalogStrip({ products }: { products: Product[] }) {
  if (products.length === 0) return null

  const stats = computeCatalogStats(products)

  return (
    <div className="border-b border-hairline bg-surface/85 px-4 py-3 xl:hidden">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        <div>
          <div className="text-[11px] text-ink-soft">Productos</div>
          <div className="numeric font-mono text-[14px] text-brand-deep">{stats.count}</div>
        </div>
        <div>
          <div className="text-[11px] text-ink-soft">Stock total</div>
          <div className="numeric font-mono text-[14px] text-brand-deep">
            {formatNumber(stats.totalStock)}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-ink-soft">Stock bajo</div>
          <div
            className={cn(
              'numeric font-mono text-[14px]',
              stats.lowStock > 0 ? 'text-warning' : 'text-brand-deep',
            )}
          >
            {stats.lowStock}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-ink-soft">Valor</div>
          <div className="numeric font-mono text-[14px] text-brand-deep">
            {formatPrice(stats.inventoryValue)}
          </div>
        </div>
      </div>
    </div>
  )
}

export function CatalogRail({ products, lastDataAt, docsUrl }: CatalogRailProps) {
  const stats = computeCatalogStats(products)
  const lowStock = products
    .filter((product) => product.stock < LOW_STOCK)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 4)

  return (
    <aside className="hidden w-[320px] shrink-0 flex-col gap-6 overflow-y-auto border-l border-hairline bg-rail px-5 py-6 xl:flex">
      <div>
        <h2 className="text-[16px] font-semibold leading-5 text-ink">Catálogo</h2>
        <p className="mt-1 flex items-center gap-1.5 text-[12px] leading-4 text-ink-soft">
          {products.length > 0 ? (
            <>
              <span aria-hidden="true" className="size-1.5 rounded-full bg-positive" />
              Catálogo en vivo · datos reales
            </>
          ) : (
            'Sin datos disponibles'
          )}
        </p>
      </div>

      {products.length === 0 ? (
        <div className="rounded-lg border border-dashed border-control px-3 py-4">
          <p className="text-[12.5px] leading-[1.5] text-ink-soft">
            Todavía no se pudo leer el catálogo.
          </p>
          <p className="mt-1 text-[11.5px] leading-[1.5] text-ink-faint">
            El agente lo consulta cuando le preguntas.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-hairline bg-surface">
            <Metric label="Productos" value={formatNumber(stats.count)} index={0} />
            <Metric label="Stock total" value={formatNumber(stats.totalStock)} index={1} />
            <Metric
              label="Stock bajo"
              value={formatNumber(stats.lowStock)}
              index={2}
              tone={stats.lowStock > 0 ? 'warning' : 'brand'}
            />
            <Metric label="Valor" value={formatPrice(stats.inventoryValue)} index={3} />
          </div>

          <p className="-mt-3 text-[11px] leading-[1.5] text-ink-faint">
            Los precios no declaran moneda en la API. El valor es precio por stock.
          </p>

          {lowStock.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[13px] font-semibold text-ink">Stock bajo</h3>
                <span className="numeric font-mono text-[11px] text-ink-faint">
                  {stats.lowStock} de {stats.count}
                </span>
              </div>
              <ul className="flex flex-col">
                {lowStock.map((product) => (
                  <li
                    key={product.id}
                    className="flex items-center justify-between gap-3 border-t border-rule py-2"
                  >
                    <span className="truncate text-[12.5px] text-ink">{productLabel(product)}</span>
                    <span className="numeric shrink-0 font-mono text-[12px] text-warning">
                      {product.stock}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {lastDataAt ? (
            <p className="text-[11px] text-ink-faint" title={lastDataAt.toLocaleString('es-BO')}>
              Actualizado {relativeTime(lastDataAt)}
            </p>
          ) : null}
        </>
      )}

      {docsUrl ? (
        <a
          href={docsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-brand hover:text-brand-deep hover:underline"
        >
          Documentación de la API
          <ExternalLinkIcon className="size-3.5" />
        </a>
      ) : null}
    </aside>
  )
}
