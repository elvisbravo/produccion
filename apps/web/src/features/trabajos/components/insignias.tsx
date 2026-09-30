import { NOMBRE_ESTADO_CUOTA, NOMBRE_ESTADO_TRABAJO, type EstadoCuota, type EstadoTrabajo } from '@grupoes/shared'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const ESTILO_TRABAJO: Record<EstadoTrabajo, string> = {
  sin_asignar: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  asignado: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
  en_proceso: 'border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  finalizado: 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200',
  suspendido: 'text-muted-foreground',
  cancelado: 'text-muted-foreground line-through',
}

export function InsigniaEstadoTrabajo({ estado }: { estado: EstadoTrabajo }) {
  return (
    <Badge variant="outline" className={ESTILO_TRABAJO[estado]}>
      {NOMBRE_ESTADO_TRABAJO[estado]}
    </Badge>
  )
}

const ESTILO_CUOTA: Record<EstadoCuota, string> = {
  pagada: 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200',
  parcial: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
  pendiente: '',
  vencida: 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
}

export function InsigniaEstadoCuota({ estado, className }: { estado: EstadoCuota; className?: string }) {
  return (
    <Badge variant="outline" className={cn(ESTILO_CUOTA[estado], className)}>
      {NOMBRE_ESTADO_CUOTA[estado]}
    </Badge>
  )
}
