import { ArrowRightIcon } from 'lucide-react'
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { ChatMessageRow } from './chat-message'
import { Composer } from './composer'
import type { ChatMessage, EndpointInfo, Product } from '@/lib/types'
import { formatPrice, productLabel } from '@/lib/format'

interface ChatPanelProps {
  messages: ChatMessage[]
  isStreaming: boolean
  endpoints: EndpointInfo[]
  products: Product[]
  onSend: (message: string) => void
  onStop: () => void
  onConfirm: (actionId: string) => Promise<void>
  onCancel: (actionId: string) => Promise<void>
}

function CatalogPreview({ products }: { products: Product[] }) {
  const visible = products.slice(0, 4)

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-4 border-t border-rule py-2">
        <span className="text-[12px] text-ink-soft">Ahora en el catálogo</span>
        <span className="text-[11px] text-ink-faint">Precio</span>
      </div>
      {visible.map((product) => (
        <div
          key={product.id}
          className="flex items-baseline justify-between gap-4 border-t border-rule py-2"
        >
          <span className="truncate text-[13px] text-ink">{productLabel(product)}</span>
          <span className="numeric shrink-0 font-mono text-[12px] text-ink-soft">
            {formatPrice(product.price)}
          </span>
        </div>
      ))}
    </div>
  )
}

function EmptyState({
  endpoints,
  products,
  onSend,
}: {
  endpoints: EndpointInfo[]
  products: Product[]
  onSend: (message: string) => void
}) {
  const fromApi = endpoints.flatMap((endpoint) => endpoint.examples.slice(0, 2)).slice(0, 4)
  const examples =
    fromApi.length > 0
      ? fromApi
      : [
          '¿Qué productos hay en el catálogo?',
          '¿Cuáles son los 3 más caros?',
          '¿Qué productos tienen stock menor a 5?',
          'Crea un producto llamado Monitor 24 con precio 145 y stock 15',
        ]

  return (
    <div className="mx-auto flex w-full max-w-[620px] flex-col gap-8 pb-8 pt-10">
      <div className="flex flex-col gap-2 rounded-lg border border-hairline border-l-[3px] border-l-brand bg-brand-soft/45 p-4">
        <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">
          Pregúntale al catálogo
        </h2>
        <p className="max-w-[48ch] text-[14px] leading-[1.55] text-ink-soft">
          Precios, stock y totales del catálogo real. También puedes crear productos, con
          confirmación antes de escribir.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-[13px] font-semibold text-ink">Consultas de ejemplo</h3>
        <ul className="flex flex-col">
          {examples.map((example) => (
            <li key={example}>
              <button
                type="button"
                onClick={() => onSend(example)}
                className="group flex w-full items-center justify-between gap-4 border-t border-rule py-3 text-left text-[13.5px] text-ink transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span>{example}</span>
                <ArrowRightIcon className="size-3.5 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[12px] leading-[1.5] text-ink-faint">
        El agente consulta y crea productos. No edita ni borra.
      </p>

      {products.length > 0 ? <CatalogPreview products={products} /> : null}
    </div>
  )
}

export function ChatPanel({
  messages,
  isStreaming,
  endpoints,
  products,
  onSend,
  onStop,
  onConfirm,
  onCancel,
}: ChatPanelProps) {
  const lastMessageId = messages[messages.length - 1]?.id

  return (
    <MessageScrollerProvider>
      <div className="flex min-h-0 flex-1 flex-col">
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport className="px-4 py-5 sm:px-6">
            <MessageScrollerContent className="mx-auto w-full max-w-[760px] gap-6">
              {messages.length === 0 ? (
                <EmptyState endpoints={endpoints} products={products} onSend={onSend} />
              ) : (
                messages.map((message) => (
                  <MessageScrollerItem
                    key={message.id}
                    scrollAnchor={message.id === lastMessageId}
                  >
                    <ChatMessageRow
                      message={message}
                      onConfirm={onConfirm}
                      onCancel={onCancel}
                    />
                  </MessageScrollerItem>
                ))
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
        </MessageScroller>

        <div className="border-t border-rule px-4 py-3 sm:px-6 sm:py-4">
          <div className="mx-auto w-full max-w-[760px]">
            <Composer isStreaming={isStreaming} onSend={onSend} onStop={onStop} />
          </div>
        </div>
      </div>
    </MessageScrollerProvider>
  )
}
