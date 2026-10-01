import { diaEnLima, type EstadoCotizacion } from '@grupoes/shared'
import { Badge } from '@/components/ui/badge'

/** Vigente, vencida (pasó su validez) o anulada. */
export function estadoVisible(c: { estado: EstadoCotizacion; validaHasta: string }) {
  return c.estado === 'anulada' ? 'anulada' : c.validaHasta < diaEnLima() ? 'vencida' : 'vigente'
}

const ESTILO = {
  vigente: 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200',
  vencida: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  anulada: 'text-muted-foreground',
} as const

const NOMBRE = { vigente: 'Vigente', vencida: 'Vencida', anulada: 'Anulada' } as const

export function InsigniaEstadoCotizacion({ cotizacion }: { cotizacion: { estado: EstadoCotizacion; validaHasta: string } }) {
  const estado = estadoVisible(cotizacion)
  return (
    <Badge variant="outline" className={ESTILO[estado]}>
      {NOMBRE[estado]}
    </Badge>
  )
}
