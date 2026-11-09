import { useEffect, useRef, useState } from 'react'
import { MenuIcon, RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ChatPanel } from '@/features/chat/chat-panel'
import { CatalogRail, CatalogStrip } from '@/features/catalog/catalog-rail'
import { SidebarContent } from '@/features/shell/sidebar'
import { TopBar } from '@/features/shell/top-bar'
import { useChat } from '@/hooks/use-chat'
import { getCatalog, getEndpoints, getHealth } from '@/lib/api'
import { computeCatalogStats } from '@/lib/format'
import type { CatalogResponse, EndpointsResponse, HealthResponse } from '@/lib/types'

export default function App() {
  const chat = useChat()
  const { send, confirm, cancel, catalogVersion } = chat
  const [endpointsData, setEndpointsData] = useState<EndpointsResponse | null>(null)
  const [endpointsLoading, setEndpointsLoading] = useState(true)
  const [endpointsError, setEndpointsError] = useState<string | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthFailed, setHealthFailed] = useState(false)
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const autoSentRef = useRef(false)

  useEffect(() => {
    if (autoSentRef.current) return
    const question = new URLSearchParams(window.location.search).get('q')
    if (!question) return
    autoSentRef.current = true
    void send(question)
  }, [send])

  useEffect(() => {
    const controller = new AbortController()

    getEndpoints(controller.signal)
      .then((data) => {
        setEndpointsData(data)
        setEndpointsError(null)
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setEndpointsError('No se pudo cargar el mapa de endpoints.')
        }
      })
      .finally(() => setEndpointsLoading(false))

    getHealth(controller.signal)
      .then((data) => {
        setHealth(data)
        setHealthFailed(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHealthFailed(true)
        }
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    getCatalog(controller.signal)
      .then((data) => setCatalog(data))
      .catch(() => {
        // La precarga es opcional: si falla, el agente sigue funcionando.
      })
    return () => controller.abort()
  }, [catalogVersion])

  const endpoints = endpointsData?.endpoints ?? []
  const railProducts = catalog?.products ?? []
  const stats = computeCatalogStats(railProducts)
  const lastDataAt = catalog ? new Date(catalog.fetchedAt) : chat.lastDataAt
  const online = healthFailed ? false : health ? true : null

  const subtitle =
    railProducts.length > 0
      ? `${stats.count} productos · ${stats.lowStock} con stock bajo`
      : 'El catálogo de productos, consultado en vivo.'

  const sidebar = (
    <SidebarContent
      endpoints={endpoints}
      endpointsLoading={endpointsLoading}
      endpointsError={endpointsError}
      online={online}
      model={health?.model ?? null}
      docsUrl={endpointsData?.api.docsUrl ?? null}
    />
  )

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-ground text-ink">
      <TopBar
        online={online}
        menu={
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger
              aria-label="Abrir menú"
              className="inline-flex size-8 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none lg:hidden"
            >
              <MenuIcon className="size-4" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[272px] border-hairline bg-ground p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Agente Demo</SheetTitle>
                <SheetDescription>Navegación y acciones del agente</SheetDescription>
              </SheetHeader>
              {sidebar}
            </SheetContent>
          </Sheet>
        }
      />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[228px] shrink-0 lg:block">{sidebar}</aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex min-h-0 flex-1 overflow-hidden border-hairline bg-surface max-lg:mb-0 max-lg:mr-0 max-lg:rounded-none max-lg:border-0 lg:mb-2 lg:mr-2 lg:rounded-2xl lg:border">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-hairline bg-title-band px-4 py-4 sm:px-6">
                <div className="min-w-0">
                  <h1 className="text-[20px] font-semibold leading-6 tracking-[-0.01em] text-ink sm:text-[22px]">
                    Consulta
                  </h1>
                  <p className="mt-1 text-[12.5px] leading-4 text-ink-soft">{subtitle}</p>
                </div>

                {chat.messages.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label="Nueva consulta"
                    onClick={chat.reset}
                    className="mt-0.5 bg-surface/70"
                  >
                    <RotateCcwIcon data-icon="inline-start" />
                    <span className="hidden sm:inline">Nueva consulta</span>
                  </Button>
                ) : null}
              </div>

              <CatalogStrip products={railProducts} />

              <ChatPanel
                messages={chat.messages}
                isStreaming={chat.isStreaming}
                endpoints={endpoints}
                products={railProducts}
                onSend={send}
                onStop={chat.stop}
                onConfirm={confirm}
                onCancel={cancel}
              />
            </div>

            <CatalogRail
              products={railProducts}
              lastDataAt={lastDataAt}
              docsUrl={endpointsData?.api.docsUrl ?? null}
            />
          </main>
        </div>
      </div>
    </div>
  )
}
