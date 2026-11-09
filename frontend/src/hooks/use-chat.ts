import { useCallback, useRef, useState } from 'react'
import {
  ApiError,
  cancelAction,
  confirmAction,
  isProductList,
  streamChat,
} from '@/lib/api'
import type { ChatEvent, ChatMessage, ToolCall } from '@/lib/types'

function updateTool(tools: ToolCall[], incoming: ToolCall): ToolCall[] {
  const index = tools.findIndex((tool) => tool.callId === incoming.callId)
  if (index === -1) return [...tools, incoming]
  const next = [...tools]
  next[index] = { ...next[index], ...incoming }
  return next
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [lastDataAt, setLastDataAt] = useState<Date | null>(null)
  const [catalogVersion, setCatalogVersion] = useState(0)
  const sessionIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const streamingRef = useRef(false)

  const patchAssistant = useCallback(
    (id: string, patch: (message: ChatMessage) => ChatMessage) => {
      setMessages((prev) =>
        prev.map((message) => (message.id === id ? patch(message) : message)),
      )
    },
    [],
  )

  const handleEvent = useCallback(
    (assistantId: string, event: ChatEvent) => {
      switch (event.type) {
        case 'meta':
          sessionIdRef.current = event.data.sessionId
          break
        case 'token':
          patchAssistant(assistantId, (message) => ({
            ...message,
            text: message.text + event.data.text,
          }))
          break
        case 'tool':
          patchAssistant(assistantId, (message) => ({
            ...message,
            tools: updateTool(message.tools, event.data),
          }))
          break
        case 'result': {
          const items = event.data.items
          if (Array.isArray(items) && event.data.view) {
            setLastDataAt(new Date())
            patchAssistant(assistantId, (message) => ({
              ...message,
              products: items as ChatMessage['products'],
              view: event.data.view,
            }))
          } else if (isProductList(items)) {
            setLastDataAt(new Date())
            patchAssistant(assistantId, (message) => ({
              ...message,
              products: items,
              view: event.data.view ?? message.view,
            }))
          }
          break
        }
        case 'confirm':
          patchAssistant(assistantId, (message) => ({
            ...message,
            confirmation: {
              actionId: event.data.actionId,
              endpointId: event.data.endpointId,
              method: event.data.method,
              path: event.data.path,
              items: event.data.items,
              count: event.data.count,
              status: 'pending',
            },
          }))
          break
        case 'error':
          patchAssistant(assistantId, (message) => ({
            ...message,
            error: event.data.message,
          }))
          break
        case 'done':
          patchAssistant(assistantId, (message) => ({ ...message, streaming: false }))
          break
      }
    },
    [patchAssistant],
  )

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text || streamingRef.current) return

      const assistantId = crypto.randomUUID()

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'user',
          text,
          tools: [],
          streaming: false,
        },
        {
          id: assistantId,
          role: 'assistant',
          text: '',
          tools: [],
          streaming: true,
        },
      ])

      streamingRef.current = true
      setIsStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        await streamChat({
          message: text,
          sessionId: sessionIdRef.current,
          signal: controller.signal,
          onEvent: (event) => handleEvent(assistantId, event),
        })
      } catch (error) {
        if (controller.signal.aborted) return
        const message =
          error instanceof ApiError
            ? error.message
            : 'No se pudo conectar con el agente. Revisa que el backend esté corriendo.'
        patchAssistant(assistantId, (current) => ({
          ...current,
          error: message,
        }))
      } finally {
        streamingRef.current = false
        setIsStreaming(false)
        abortRef.current = null
        patchAssistant(assistantId, (current) => ({ ...current, streaming: false }))
      }
    },
    [handleEvent, patchAssistant],
  )

  const confirm = useCallback(
    async (actionId: string) => {
      const sessionId = sessionIdRef.current
      if (!sessionId) return

      try {
        const result = await confirmAction({ actionId, sessionId })
        setMessages((prev) =>
          prev.map((message) => {
            if (message.confirmation?.actionId !== actionId) return message

            const tool: ToolCall = {
              callId: actionId,
              endpointId: 'create_product',
              method: 'POST',
              path: '/api/v1/products',
              status: 'ok',
              httpStatus: result.httpStatus,
              durationMs: result.durationMs,
              itemCount: result.created.length,
            }

            return {
              ...message,
              confirmation: undefined,
              text: result.message,
              products: result.created,
              view: result.view,
              failed: result.failed.length > 0 ? result.failed : undefined,
              tools: [...message.tools, tool],
              error: undefined,
              streaming: false,
            }
          }),
        )
        if (result.created.length > 0) {
          setCatalogVersion((value) => value + 1)
        }
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : 'No se pudo crear el producto. Intenta de nuevo.'
        setMessages((prev) =>
          prev.map((item) =>
            item.confirmation?.actionId === actionId
              ? {
                  ...item,
                  confirmation: {
                    ...item.confirmation,
                    status: 'error',
                    error: message,
                  },
                }
              : item,
          ),
        )
      }
    },
    [],
  )

  const cancel = useCallback(async (actionId: string) => {
    const sessionId = sessionIdRef.current

    setMessages((prev) =>
      prev.map((message) =>
        message.confirmation?.actionId === actionId
          ? {
              ...message,
              confirmation: undefined,
              text: 'Cancelé la creación. No se creó ningún producto.',
              error: undefined,
              streaming: false,
            }
          : message,
      ),
    )

    if (sessionId) {
      try {
        await cancelAction({ actionId, sessionId })
      } catch {
        // La acción expira sola si no se pudo cancelar en el servidor.
      }
    }
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    streamingRef.current = false
    setIsStreaming(false)
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    streamingRef.current = false
    sessionIdRef.current = null
    setIsStreaming(false)
    setMessages([])
    setLastDataAt(null)
  }, [])

  const latestProducts =
    [...messages].reverse().find((message) => message.products?.length)?.products ?? []

  return {
    messages,
    isStreaming,
    lastDataAt,
    latestProducts,
    catalogVersion,
    send,
    confirm,
    cancel,
    stop,
    reset,
  }
}
