import { useRef, useState } from 'react'
import { ArrowUpIcon, SquareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const MAX_LENGTH = 2000

interface ComposerProps {
  isStreaming: boolean
  onSend: (message: string) => void
  onStop: () => void
}

export function Composer({ isStreaming, onSend, onStop }: ComposerProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const submit = () => {
    const message = value.trim()
    if (!message || isStreaming) return
    onSend(message)
    setValue('')
    textareaRef.current?.focus()
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="rounded-lg border border-control bg-surface p-2.5 shadow-[0_1px_4px_rgba(19,20,22,0.06)] transition-colors focus-within:border-brand"
    >
      <label htmlFor="composer" className="sr-only">
        Pregunta sobre el catálogo
      </label>
      <Textarea
        id="composer"
        ref={textareaRef}
        value={value}
        rows={1}
        maxLength={MAX_LENGTH}
        placeholder="Pregunta por productos, precios o stock..."
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit()
          }
        }}
        className="max-h-40 min-h-0 resize-none border-0 bg-transparent p-1 text-[14px] leading-[1.5] shadow-none focus-visible:border-0 focus-visible:ring-0"
      />

      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className="text-[11px] text-ink-faint">
          Enter envía · Shift+Enter salto de línea
        </span>
        <div className="flex items-center gap-2">
          {value.length > MAX_LENGTH - 200 ? (
            <span className="numeric font-mono text-[11px] text-ink-faint">
              {value.length}/{MAX_LENGTH}
            </span>
          ) : null}
          {isStreaming ? (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Detener respuesta"
              onClick={onStop}
            >
              <SquareIcon />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-sm"
              aria-label="Enviar consulta"
              disabled={!value.trim()}
            >
              <ArrowUpIcon />
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}
