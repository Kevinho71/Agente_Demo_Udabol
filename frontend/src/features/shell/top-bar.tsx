import type { ReactNode } from 'react'
import { BrandMark } from '@/components/brand-mark'

interface TopBarProps {
  online: boolean | null
  menu: ReactNode
}

export function TopBar({ online, menu }: TopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 bg-masthead px-3 text-white sm:px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        {menu}
        <BrandMark className="size-5 shrink-0 text-white" />
        <span className="truncate text-[14px] font-semibold leading-5">Agente Demo</span>
        <span className="hidden text-[11px] text-white/40 sm:inline">|</span>
        <span className="hidden truncate text-[12px] text-white/70 sm:inline">
          Catálogo de productos
        </span>
      </div>

      <div className="flex items-center gap-2 text-[11.5px] text-white/80">
        <span
          aria-hidden="true"
          className={
            online === null
              ? 'size-1.5 rounded-full bg-masthead-muted'
              : online
                ? 'size-1.5 rounded-full bg-masthead-positive'
                : 'size-1.5 rounded-full bg-masthead-negative'
          }
        />
        <span className="hidden sm:inline">
          {online === null ? 'Conectando' : online ? 'En línea' : 'Sin conexión'}
        </span>
      </div>
    </header>
  )
}
