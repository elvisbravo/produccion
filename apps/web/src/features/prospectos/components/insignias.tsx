import { NOMBRE_TEMPERATURA, type Temperatura } from '@grupoes/shared'
import { Flame, Snowflake, Thermometer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** Etapa del embudo con su color (definido en el catálogo). */
export function InsigniaEtapa({ nombre, color, className }: { nombre: string; color: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-medium', className)}>
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {nombre}
    </Badge>
  )
}

const ESTILO_TEMPERATURA: Record<Temperatura, { clase: string; Icono: typeof Flame }> = {
  caliente: { clase: 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200', Icono: Flame },
  tibio: { clase: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200', Icono: Thermometer },
  frio: { clase: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200', Icono: Snowflake },
}

export function InsigniaTemperatura({ temperatura }: { temperatura: Temperatura | null }) {
  if (!temperatura) return <span className="text-muted-foreground">—</span>
  const { clase, Icono } = ESTILO_TEMPERATURA[temperatura]
  return (
    <Badge variant="outline" className={clase}>
      <Icono aria-hidden="true" />
      {NOMBRE_TEMPERATURA[temperatura]}
    </Badge>
  )
}

export function InsigniaPrioridad({ nombre, color }: { nombre: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="size-2 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
      {nombre}
    </span>
  )
}
