import type {
  CatalogResponse,
  ChatEvent,
  ConfirmActionResponse,
  EndpointsResponse,
  HealthResponse,
  Product,
} from './types'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  readonly code: string

  constructor(message: string, code = 'NETWORK') {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { accept: 'application/json' },
    signal,
  })

  if (!response.ok) {
    throw new ApiError(`El servicio respondió ${response.status}.`, 'HTTP')
  }

  return (await response.json()) as T
}

export function getEndpoints(signal?: AbortSignal) {
  return getJson<EndpointsResponse>('/api/endpoints', signal)
}

export function getHealth(signal?: AbortSignal) {
  return getJson<HealthResponse>('/health', signal)
}

export function getCatalog(signal?: AbortSignal) {
  return getJson<CatalogResponse>('/api/catalog', signal)
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })

  const payload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message ?? `El servicio respondió ${response.status}.`,
      payload?.error?.code ?? 'HTTP',
    )
  }

  return payload as T
}

export function confirmAction(input: {
  actionId: string
  sessionId: string
  signal?: AbortSignal
}) {
  return postJson<ConfirmActionResponse>(
    `/api/actions/${input.actionId}/confirm`,
    { sessionId: input.sessionId },
    input.signal,
  )
}

export function cancelAction(input: { actionId: string; sessionId: string }) {
  return postJson<{ ok: boolean; cancelled: boolean; message: string }>(
    `/api/actions/${input.actionId}/cancel`,
    { sessionId: input.sessionId },
  )
}

interface StreamChatOptions {
  message: string
  sessionId?: string | null
  signal: AbortSignal
  onEvent: (event: ChatEvent) => void
}

function parseBlock(block: string): ChatEvent | null {
  let eventName = 'message'
  const dataLines: string[] = []

  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  if (dataLines.length === 0) return null

  try {
    const data = JSON.parse(dataLines.join('\n')) as unknown
    return { type: eventName, data } as ChatEvent
  } catch {
    return null
  }
}

export async function streamChat({
  message,
  sessionId,
  signal,
  onEvent,
}: StreamChatOptions): Promise<void> {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
    },
    body: JSON.stringify({ message, sessionId: sessionId ?? undefined }),
    signal,
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null
    throw new ApiError(
      payload?.error?.message ?? 'No se pudo iniciar la consulta.',
      payload?.error?.code ?? 'HTTP',
    )
  }

  if (!response.body) {
    throw new ApiError('El navegador no puede leer la respuesta en streaming.', 'NO_BODY')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const event = parseBlock(block)
      if (event) onEvent(event)
      boundary = buffer.indexOf('\n\n')
    }
  }

  if (buffer.trim()) {
    const event = parseBlock(buffer)
    if (event) onEvent(event)
  }
}

export function isProductList(value: unknown): value is Product[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === 'object' &&
    value[0] !== null &&
    'name' in value[0] &&
    'price' in value[0] &&
    'stock' in value[0]
  )
}
