import { cn } from '@/lib/utils'

/** Logotipo de GRUPO ES (monograma). */
export function Monograma({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-bold tracking-tight text-primary-foreground',
        className,
      )}
    >
      ES
    </div>
  )
}
