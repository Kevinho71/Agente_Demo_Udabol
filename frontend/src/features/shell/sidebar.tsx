import { ExternalLinkIcon, MessagesSquareIcon } from 'lucide-react'
import { EndpointPanel } from '@/features/endpoints/endpoint-panel'
import type { EndpointInfo } from '@/lib/types'

interface SidebarContentProps {
  endpoints: EndpointInfo[]
  endpointsLoading: boolean
  endpointsError: string | null
  online: boolean | null
  model: string | null
  docsUrl: string | null
}

function StatusDot({ online }: { online: boolean | null }) {
  return (
    <span
      aria-hidden="true"
      className={
        online === null
          ? 'size-1.5 rounded-full bg-control'
          : online
            ? 'size-1.5 rounded-full bg-positive'
            : 'size-1.5 rounded-full bg-negative'
      }
    />
  )
}

export function SidebarContent({
  endpoints,
  endpointsLoading,
  endpointsError,
  online,
  model,
  docsUrl,
}: SidebarContentProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-5 px-3 py-4">
      <div className="flex flex-col gap-0.5 px-2">
        <span className="text-[12px] font-medium leading-4 text-ink">Catálogo de productos</span>
        <span className="font-mono text-[11px] leading-4 text-ink-faint">API v1</span>
      </div>

      <nav aria-label="Secciones">
        <div className="flex h-8 items-center gap-2 rounded-md border-l-[3px] border-brand bg-active px-2 text-[13px] font-medium text-brand-deep">
          <MessagesSquareIcon className="size-4 text-brand" />
          Consulta
        </div>
      </nav>

      <EndpointPanel
        endpoints={endpoints}
        loading={endpointsLoading}
        error={endpointsError}
      />

      <div className="mt-auto flex flex-col gap-2.5 rounded-lg border border-hairline bg-surface/85 p-3">
        <div className="flex items-center gap-2 text-[11.5px] text-ink-soft">
          <StatusDot online={online} />
          <span>{online === null ? 'Conectando' : online ? 'Agente en línea' : 'Sin conexión'}</span>
        </div>
        {model ? (
          <p className="truncate font-mono text-[11px] leading-4 text-ink-faint" title={model}>
            modelo: {model}
          </p>
        ) : null}
        <p className="text-[11px] leading-4 text-ink-faint">
          Historial en memoria, sin base de datos.
        </p>

        {docsUrl ? (
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand hover:text-brand-deep hover:underline"
          >
            Documentación de la API
            <ExternalLinkIcon className="size-3.5" />
          </a>
        ) : null}
      </div>
    </div>
  )
}
