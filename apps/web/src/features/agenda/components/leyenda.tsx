import { cn } from '@/lib/utils'

const ITEMS = [
  { etiqueta: 'Horario de trabajo', clase: 'border bg-background' },
  { etiqueta: 'Fuera de horario', clase: 'bg-muted' },
  { etiqueta: 'No laborable', clase: 'bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--color-violet-400)_3px_4px)] border border-violet-300' },
]

export function Leyenda({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground', className)}>
      {ITEMS.map((i) => (
        <li key={i.etiqueta} className="flex items-center gap-1.5">
          <span className={cn('size-3 rounded-sm', i.clase)} aria-hidden="true" />
          {i.etiqueta}
        </li>
      ))}
    </ul>
  )
}
