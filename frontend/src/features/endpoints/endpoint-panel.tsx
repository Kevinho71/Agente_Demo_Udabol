import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { EndpointInfo } from '@/lib/types'

interface EndpointPanelProps {
  endpoints: EndpointInfo[]
  loading: boolean
  error: string | null
}

export function EndpointPanel({ endpoints, loading, error }: EndpointPanelProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface/85 p-3">
      <h2 className="text-[12px] font-medium leading-4 text-ink">Acciones disponibles</h2>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ) : error ? (
        <p className="text-[12px] leading-[1.5] text-negative">{error}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {endpoints.map((endpoint) => (
            <li key={endpoint.id}>
              <div className="flex items-start gap-2">
                <Badge
                  variant={endpoint.method === 'POST' ? 'warning' : 'outline'}
                  className="mt-0.5 h-[18px] shrink-0 rounded-[3px] px-1.5 font-mono text-[11px]"
                >
                  {endpoint.method}
                </Badge>
                <span className="min-w-0 flex-1 text-[13px] leading-4 text-ink">
                  {endpoint.summary}
                </span>
              </div>
              <p className="mt-1 truncate font-mono text-[11px] text-ink-faint">
                {endpoint.path}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
