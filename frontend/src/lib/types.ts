export interface EndpointParam {
  name: string
  in: 'query' | 'path' | 'local' | 'body'
  required: boolean
  type: 'string' | 'integer' | 'number' | 'boolean'
  description: string
  enum?: string[]
}

export interface EndpointInfo {
  id: string
  method: string
  path: string
  summary: string
  description: string
  effects: 'read' | 'write'
  params: EndpointParam[]
  examples: string[]
}

export interface EndpointsResponse {
  api: {
    name: string
    description: string
    docsUrl: string | null
  }
  endpoints: EndpointInfo[]
}

export interface HealthResponse {
  status: string
  service: string
  uptimeSeconds: number
  model: string
  endpoints: number
}

export interface CatalogResponse {
  products: Product[]
  summary: {
    count: number
    totalStock: number
    inventoryValue: number
    lowStockCount: number
    outOfStockCount: number
  } | null
  fetchedAt: string
  source: string
}

export interface Product {
  id: number
  name: string
  price: number
  stock: number
  image_url?: string | null
}

export type ViewMode = 'single' | 'ranking' | 'filter' | 'all' | 'none'
export type ColumnKey = 'rank' | 'name' | 'price' | 'stock' | 'id'

export interface TableView {
  mode: ViewMode
  title: string
  columns: ColumnKey[]
  returned: number
  totalMatched: number
  totalCatalog: number | null
  showTable: boolean
  limit: number | null
  sortBy: string | null
  order: 'asc' | 'desc' | null
  created: boolean
}

export type ToolStatus = 'running' | 'ok' | 'error'

export interface ToolCall {
  callId: string
  endpointId: string
  method?: string
  path?: string
  status: ToolStatus
  httpStatus?: number | null
  durationMs?: number
  itemCount?: number | null
  error?: string
}

export type ConfirmationStatus = 'pending' | 'confirmed' | 'cancelled' | 'error'

export interface ConfirmationSummary {
  name?: string
  price?: number
  stock?: number
  image_url?: string | null
}

export interface PendingConfirmation {
  actionId: string
  endpointId: string
  method: string
  path: string
  items: ConfirmationSummary[]
  count: number
  status: ConfirmationStatus
  error?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  tools: ToolCall[]
  products?: Product[]
  view?: TableView
  confirmation?: PendingConfirmation
  failed?: Array<{ name: string; error: string }>
  streaming: boolean
  error?: string
}

export interface ConfirmActionResponse {
  ok: boolean
  message: string
  created: Product[]
  failed: Array<{ name: string; error: string }>
  view: TableView
  httpStatus: number | null
  durationMs: number
}

export type ChatEvent =
  | { type: 'meta'; data: { sessionId: string; messageId: string; model: string } }
  | { type: 'token'; data: { text: string } }
  | {
      type: 'tool'
      data: {
        callId: string
        endpointId: string
        method?: string
        path?: string
        status: ToolStatus
        httpStatus?: number | null
        durationMs?: number
        itemCount?: number | null
        error?: string
      }
    }
  | {
      type: 'result'
      data: {
        endpointId: string | null
        kind: 'products' | 'data'
        items: unknown
        view?: TableView
      }
    }
  | {
      type: 'confirm'
      data: {
        actionId: string
        endpointId: string
        method: string
        path: string
        items: ConfirmationSummary[]
        count: number
      }
    }
  | {
      type: 'done'
      data: {
        sessionId: string
        messageId: string
        model: string
        pendingConfirmation?: boolean
      }
    }
  | { type: 'error'; data: { code: string; message: string } }
