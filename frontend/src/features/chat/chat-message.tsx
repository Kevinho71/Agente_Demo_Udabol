import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageAvatar, MessageContent } from '@/components/ui/message'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { BrandMark } from '@/components/brand-mark'
import {
  formatNumber,
  formatPrice,
  hasUsableImage,
  LOW_STOCK,
  productInitial,
  productLabel,
  stripEmoji,
} from '@/lib/format'
import type {
  ChatMessage,
  ColumnKey,
  PendingConfirmation,
  Product,
  TableView,
  ToolCall,
} from '@/lib/types'
import { cn } from '@/lib/utils'

function ToolTrace({ tool }: { tool: ToolCall }) {
  const running = tool.status === 'running'
  const endpoint = tool.path ?? tool.endpointId
  const itemUnit =
    tool.method === 'POST'
      ? tool.itemCount === 1
        ? 'producto'
        : 'productos'
      : tool.itemCount === 1
        ? 'fila'
        : 'filas'

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[6px] border border-hairline bg-brand-soft/35 px-2.5 py-1.5 font-mono text-[11.5px] leading-5 text-ink-soft"
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          running ? 'bg-brand' : tool.status === 'ok' ? 'bg-positive' : 'bg-negative',
        )}
      />
      <span className="text-ink">
        {tool.method ?? 'GET'} {endpoint}
      </span>
      <span aria-hidden="true">·</span>
      {running ? (
        <span className="inline-flex items-center gap-1.5">
          consultando
          <Spinner className="size-3" />
        </span>
      ) : tool.status === 'ok' ? (
        <span className="tabular-nums">
          {tool.httpStatus ?? 200} · {tool.durationMs ?? 0} ms
          {typeof tool.itemCount === 'number'
            ? ` · ${tool.itemCount} ${itemUnit}`
            : ''}
        </span>
      ) : (
        <span className="text-negative">{tool.error ?? 'la consulta falló'}</span>
      )}
    </div>
  )
}

function ProductThumb({
  product,
  size = 'sm',
}: {
  product: Product
  size?: 'sm' | 'lg'
}) {
  const box = size === 'lg' ? 'size-12 text-[16px]' : 'size-8 text-[12px]'

  if (hasUsableImage(product)) {
    return (
      <img
        src={product.image_url ?? ''}
        alt=""
        loading="lazy"
        className={cn('shrink-0 rounded-[3px] object-cover', box)}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[3px] font-medium',
        size === 'lg' ? 'bg-brand-soft text-brand-deep' : 'bg-raised text-ink-soft',
        box,
      )}
    >
      {productInitial(product)}
    </span>
  )
}

function StockMark({ stock }: { stock: number }) {
  if (stock === 0) return <Badge variant="negative">sin stock</Badge>
  if (stock < LOW_STOCK) return <Badge variant="warning">stock bajo</Badge>
  return <Badge variant="positive">disponible</Badge>
}

function ProductDetail({ product, view }: { product: Product; view: TableView }) {
  const created = view.created

  return (
    <section
      className={cn(
        'mt-1 overflow-hidden rounded-lg border bg-surface',
        created ? 'border-positive/35' : 'border-hairline',
      )}
      aria-label={view.title}
    >
      <div
        className={cn(
          'flex items-center justify-between gap-3 border-b px-4 py-2.5',
          created ? 'border-positive/20 bg-positive-soft/60' : 'border-rule bg-brand-soft/40',
        )}
      >
        <span className="text-[12px] font-medium text-ink">{view.title}</span>
        {created ? <Badge variant="positive">creado</Badge> : null}
      </div>

      <div className="flex items-start gap-4 p-4">
        <ProductThumb product={product} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-4">
            <div className="min-w-0">
              <h3 className="truncate text-[16px] font-semibold leading-5 text-ink">
                {productLabel(product)}
              </h3>
              <p className="mt-0.5 font-mono text-[11px] text-ink-faint">#{product.id}</p>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[11px] leading-4 text-ink-soft">Precio</div>
              <div className="numeric font-mono text-[22px] leading-7 tracking-[-0.01em] text-brand-deep">
                {formatPrice(product.price)}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-ink-soft">
            <span>Stock</span>
            <span className="numeric font-mono text-[13px] text-ink">
              {formatNumber(product.stock)}
            </span>
            <StockMark stock={product.stock} />
          </div>
        </div>
      </div>
    </section>
  )
}

function fallbackView(count: number): TableView {
  return {
    mode: count === 1 ? 'single' : 'all',
    title: 'Productos del catálogo',
    columns: ['name', 'price', 'stock'],
    returned: count,
    totalMatched: count,
    totalCatalog: count,
    showTable: true,
    limit: null,
    sortBy: null,
    order: null,
    created: false,
  }
}

function ProductTable({ products, view }: { products: Product[]; view: TableView }) {
  const [expanded, setExpanded] = useState(false)

  const previewLimit =
    view.mode === 'ranking'
      ? view.returned <= 20
        ? view.returned
        : 10
      : view.mode === 'filter'
        ? 10
        : 6

  const visible = expanded ? products : products.slice(0, previewLimit)
  const canExpand = products.length > previewLimit
  const baseColumns =
    view.columns.length > 0 ? view.columns : (['name', 'price', 'stock'] as ColumnKey[])
  const columns = baseColumns.filter((column) => column !== 'id')
  if (!columns.includes('name')) columns.unshift('name')

  const countLabel =
    view.totalMatched > view.returned
      ? `${view.returned} de ${view.totalMatched}`
      : `${view.returned} ${
          view.created
            ? view.returned === 1
              ? 'producto'
              : 'productos'
            : view.returned === 1
              ? 'fila'
              : 'filas'
        }`

  const headerClass = (column: ColumnKey) => {
    if (column === 'rank') return 'w-7 py-2 pr-1 text-left font-normal'
    if (column === 'price') return 'w-20 py-2 pl-2 text-right font-normal'
    if (column === 'stock') return 'w-24 py-2 pl-2 text-right font-normal'
    return 'py-2 pr-3 text-left font-normal'
  }

  const headerLabel = (column: ColumnKey) => {
    if (column === 'rank') return '#'
    if (column === 'price') return 'Precio'
    if (column === 'stock') return 'Stock'
    return 'Producto'
  }

  const cellClass = (column: ColumnKey) => {
    if (column === 'rank') return 'py-2 pr-1 font-mono text-[11px] text-brand'
    if (column === 'price')
      return 'numeric py-2 pl-2 text-right font-mono text-[12.5px] text-brand-deep'
    if (column === 'stock') return 'py-2 pl-2 text-right'
    return 'py-2 pr-3'
  }

  const renderCell = (column: ColumnKey, product: Product, index: number) => {
    if (column === 'rank') return index + 1
    if (column === 'price') return formatPrice(product.price)
    if (column === 'stock') {
      return (
        <span className="inline-flex items-center justify-end gap-2">
          <span className="numeric font-mono text-[12.5px]">{formatNumber(product.stock)}</span>
          {product.stock === 0 ? (
            <Badge variant="negative">sin stock</Badge>
          ) : product.stock < LOW_STOCK ? (
            <Badge variant="warning">bajo</Badge>
          ) : null}
        </span>
      )
    }

    return (
      <div className="flex min-w-0 items-center gap-3">
        <ProductThumb product={product} />
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{productLabel(product)}</div>
          <div className="font-mono text-[11px] text-ink-faint">#{product.id}</div>
        </div>
      </div>
    )
  }

  return (
    <section
      className="mt-1 overflow-hidden rounded-lg border border-hairline bg-surface"
      aria-label={view.title}
    >
      <div
        className={cn(
          'flex items-baseline justify-between gap-4 border-b border-rule px-3 py-2.5',
          view.created ? 'bg-positive-soft/55' : 'bg-brand-soft/35',
        )}
      >
        <span className="text-[12px] font-medium text-ink">
          {view.title || 'Productos del catálogo'}
        </span>
        <div className="flex shrink-0 items-baseline gap-3">
          <span className="numeric font-mono text-[11px] text-ink-faint">{countLabel}</span>
          {canExpand ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="rounded-[3px] text-[11px] font-medium text-brand transition-colors hover:text-brand-deep focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              {expanded ? 'Ver menos' : `Ver los ${products.length}`}
            </button>
          ) : null}
        </div>
      </div>

      {products.length === 0 ? (
        <p className="px-3 py-4 text-[12.5px] text-ink-soft">
          No hay productos que coincidan con esta consulta.
        </p>
      ) : (
        <div className="overflow-x-auto px-3">
          <table className="w-full min-w-0 border-collapse text-[13px]">
            <thead>
              <tr className="text-[11px] text-ink-soft">
                {columns.map((column) => (
                  <th key={column} className={headerClass(column)}>
                    {headerLabel(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((product, index) => (
                <tr
                  key={product.id}
                  className="border-t border-rule align-middle last:border-t-0"
                >
                  {columns.map((column) => (
                    <td key={column} className={cellClass(column)}>
                      {renderCell(column, product, index)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function ResultView({
  products,
  view,
}: {
  products: Product[]
  view?: TableView
}) {
  const resolved = view ?? fallbackView(products.length)

  if (!resolved.showTable || resolved.mode === 'none') return null
  if (resolved.mode === 'single' && products[0]) {
    return <ProductDetail product={products[0]} view={resolved} />
  }

  return <ProductTable products={products} view={resolved} />
}

function ConfirmationCard({
  confirmation,
  onConfirm,
  onCancel,
}: {
  confirmation: PendingConfirmation
  onConfirm: (actionId: string) => Promise<void>
  onCancel: (actionId: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const items = confirmation.items
  const count = confirmation.count
  const single = items[0]

  if (confirmation.status === 'error') {
    return (
      <Alert variant="destructive" className="border-negative-soft bg-negative-soft/40">
        <AlertDescription>
          {confirmation.error ?? 'No se pudo crear el producto.'}
        </AlertDescription>
      </Alert>
    )
  }

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await onConfirm(confirmation.actionId)
    } finally {
      setBusy(false)
    }
  }

  const handleCancel = async () => {
    setBusy(true)
    try {
      await onCancel(confirmation.actionId)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="rounded-lg border border-warning-border bg-warning-soft p-3.5"
      aria-label={
        count > 1 ? `Confirmar creación de ${count} productos` : 'Confirmar creación de producto'
      }
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-ink">
          {count > 1 ? `Confirmar creación de ${count} productos` : 'Confirmar creación'}
        </h3>
        <span className="font-mono text-[11px] text-warning">
          {confirmation.method} {confirmation.path}
          {count > 1 ? ` · ${count}` : ''}
        </span>
      </div>

      {count === 1 ? (
        <dl className="mt-3 grid grid-cols-1 gap-1.5 text-[13px] sm:grid-cols-3">
          <div>
            <dt className="text-[11px] text-ink-soft">Producto</dt>
            <dd className="truncate font-medium text-ink">{single?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-soft">Precio</dt>
            <dd className="numeric font-mono text-[12.5px] text-ink">
              {typeof single?.price === 'number' ? formatPrice(single.price) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-soft">Stock</dt>
            <dd className="numeric font-mono text-[12.5px] text-ink">
              {typeof single?.stock === 'number' ? formatNumber(single.stock) : '—'}
            </dd>
          </div>
        </dl>
      ) : (
        <div className="mt-3 overflow-hidden rounded-md border border-warning-border/70 bg-surface/60">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-1.5 text-[11px] text-ink-soft">
            <span>Producto</span>
            <span className="text-right">Precio</span>
            <span className="text-right">Stock</span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {items.map((item, index) => (
              <div
                key={`${item.name ?? 'producto'}-${index}`}
                className="grid grid-cols-[1fr_auto_auto] items-baseline gap-2 border-t border-rule px-3 py-2 text-[13px]"
              >
                <span className="truncate font-medium text-ink">{item.name ?? '—'}</span>
                <span className="numeric text-right font-mono text-[12px] text-brand-deep">
                  {typeof item.price === 'number' ? formatPrice(item.price) : '—'}
                </span>
                <span className="numeric text-right font-mono text-[12px] text-ink">
                  {typeof item.stock === 'number' ? formatNumber(item.stock) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-[11.5px] leading-4 text-warning">
        {count > 1
          ? `Se van a crear ${count} productos nuevos en el catálogo real.`
          : 'Se va a crear un producto nuevo en el catálogo real.'}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          variant="warning"
          size="sm"
          disabled={busy}
          onClick={handleConfirm}
        >
          {busy ? <Spinner data-icon="inline-start" /> : null}
          {count > 1 ? `Crear los ${count}` : 'Crear producto'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={handleCancel}
        >
          Cancelar
        </Button>
      </div>
    </section>
  )
}

function AnswerSkeleton({ showTable = true }: { showTable?: boolean }) {
  return (
    <div className="flex w-full max-w-[680px] flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-3.5 w-[88%] rounded-[3px] bg-accent" />
      <Skeleton className="h-3.5 w-[72%] rounded-[3px] bg-accent" />
      <Skeleton className="h-3.5 w-[54%] rounded-[3px] bg-accent" />

      {showTable ? (
        <div className="mt-2 overflow-hidden rounded-lg border border-hairline">
          <div className="flex items-center justify-between px-3 py-2.5">
            <Skeleton className="h-2.5 w-40 rounded-[3px] bg-accent" />
            <Skeleton className="h-2.5 w-12 rounded-[3px] bg-accent" />
          </div>
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div
              key={row}
              className="flex items-center gap-3 border-t border-rule px-3 py-2.5"
            >
              <Skeleton className="size-7 shrink-0 rounded-[3px] bg-accent" />
              <Skeleton className="h-3 w-32 rounded-[3px] bg-accent" />
              <Skeleton className="ml-auto h-3 w-16 rounded-[3px] bg-accent" />
              <Skeleton className="h-3 w-10 rounded-[3px] bg-accent" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function AssistantMessage({
  message,
  onConfirm,
  onCancel,
}: {
  message: ChatMessage
  onConfirm: (actionId: string) => Promise<void>
  onCancel: (actionId: string) => Promise<void>
}) {
  const waiting = message.streaming && !message.text && !message.confirmation

  return (
    <Message align="start" className="gap-3">
      <MessageAvatar className="mt-0.5 size-5 self-start rounded-[2px] bg-transparent text-brand">
        <BrandMark className="size-5" />
      </MessageAvatar>
      <MessageContent className="gap-3">
        {message.tools.map((tool) => (
          <ToolTrace key={tool.callId} tool={tool} />
        ))}

        {waiting ? (
          <div className="flex flex-col gap-4">
            <span className="inline-flex items-center gap-2 py-0.5 text-[13px] text-ink-soft">
              <Spinner className="size-3.5" />
              Preparando respuesta
            </span>
            <AnswerSkeleton showTable={!message.products?.length} />
          </div>
        ) : null}

        {message.text ? (
          <div
            className="answer-md text-[14px] leading-[1.55] text-ink"
            aria-live="polite"
            aria-busy={message.streaming}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripEmoji(message.text)}</ReactMarkdown>
          </div>
        ) : null}

        {message.products?.length || message.view ? (
          <ResultView products={message.products ?? []} view={message.view} />
        ) : null}

        {message.failed?.length ? (
          <Alert variant="destructive" className="border-negative-soft bg-negative-soft/40">
            <AlertDescription>
              No se pudieron crear:{' '}
              {message.failed.map((item) => `${item.name} (${item.error})`).join('; ')}
            </AlertDescription>
          </Alert>
        ) : null}

        {message.confirmation ? (
          <ConfirmationCard
            confirmation={message.confirmation}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        ) : null}

        {message.error ? (
          <Alert variant="destructive" className="border-negative-soft bg-negative-soft/40">
            <AlertDescription>{message.error}</AlertDescription>
          </Alert>
        ) : null}
      </MessageContent>
    </Message>
  )
}

export function ChatMessageRow({
  message,
  onConfirm,
  onCancel,
}: {
  message: ChatMessage
  onConfirm: (actionId: string) => Promise<void>
  onCancel: (actionId: string) => Promise<void>
}) {
  if (message.role === 'user') {
    return (
      <Message align="end">
        <MessageContent>
          <Bubble variant="muted" align="end" className="max-w-[88%]">
            <BubbleContent className="rounded-lg border-hairline text-[14px] leading-[1.5]">
              {message.text}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    )
  }

  return <AssistantMessage message={message} onConfirm={onConfirm} onCancel={onCancel} />
}
