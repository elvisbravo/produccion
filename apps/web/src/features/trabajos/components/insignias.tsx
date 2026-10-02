import { DESCRIPCION_SEGUIMIENTO, NOMBRE_ESTADO_CUOTA, NOMBRE_ESTADO_TRABAJO, NOMBRE_SEGUIMIENTO, SEGUIMIENTOS, type EstadoCuota, type EstadoTrabajo, type Seguimiento, type SeguimientoTrabajo } from '@grupoes/shared'
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

// ─── Seguimiento: el estado del trabajo con los colores que usa el equipo ───

/** Amarillo entregado, celeste abordándose, verde programado, rojo urgente, gris pendiente de pago. */
export const ESTILO_SEGUIMIENTO: Record<Seguimiento, string> = {
  entregado: 'border-yellow-400 bg-yellow-200 text-yellow-950 dark:border-yellow-600 dark:bg-yellow-800/60 dark:text-yellow-50',
  urgente: 'border-red-400 bg-red-200 text-red-950 dark:border-red-700 dark:bg-red-900/60 dark:text-red-50',
  pendiente_pago: 'border-zinc-400 bg-zinc-300 text-zinc-900 dark:border-zinc-500 dark:bg-zinc-600 dark:text-zinc-50',
  abordando: 'border-cyan-400 bg-cyan-200 text-cyan-950 dark:border-cyan-700 dark:bg-cyan-900/60 dark:text-cyan-50',
  programado: 'border-green-400 bg-green-200 text-green-950 dark:border-green-700 dark:bg-green-900/60 dark:text-green-50',
  sin_asignar: 'border-dashed text-muted-foreground',
  suspendido: 'border-orange-400 bg-orange-200 text-orange-950 dark:border-orange-700 dark:bg-orange-900/60 dark:text-orange-50',
  cancelado: 'text-muted-foreground line-through',
}

/** El estado principal del trabajo en grande y, al lado, lo demás que también le pasa. */
export function EtiquetasSeguimiento({ seguimiento }: { seguimiento: SeguimientoTrabajo }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge variant="outline" className={cn('font-medium', ESTILO_SEGUIMIENTO[seguimiento.principal])}>
        {NOMBRE_SEGUIMIENTO[seguimiento.principal]}
      </Badge>
      {seguimiento.etiquetas.map((e) => (
        <Badge key={e} variant="outline" className={cn('px-1.5 text-[11px]', ESTILO_SEGUIMIENTO[e])}>
          {NOMBRE_SEGUIMIENTO[e]}
        </Badge>
      ))}
    </span>
  )
}

/** Qué significa cada color (los que aplican hoy). */
export function LeyendaSeguimiento() {
  const mostrar = SEGUIMIENTOS.filter((x) => x !== 'cancelado')
  return (
    <ul className="flex flex-col gap-2.5 text-sm">
      {mostrar.map((x) => (
        <li key={x} className="flex items-start gap-3">
          <Badge variant="outline" className={cn('w-36 shrink-0 justify-center font-medium', ESTILO_SEGUIMIENTO[x])}>
            {NOMBRE_SEGUIMIENTO[x]}
          </Badge>
          <span className="text-muted-foreground">{DESCRIPCION_SEGUIMIENTO[x]}</span>
        </li>
      ))}
      <li className="flex items-start gap-3">
        <Badge variant="outline" className="w-36 shrink-0 justify-center gap-1 border-blue-400 bg-blue-200 font-medium text-blue-950 dark:border-blue-700 dark:bg-blue-900/60 dark:text-blue-50">
          Fechas fijas
        </Badge>
        <span className="text-muted-foreground">Las fechas no se pueden mover: deben cumplirse por su prioridad. Se suma a cualquiera de los estados.</span>
      </li>
      <li className="border-t pt-2 text-xs text-muted-foreground">
        Un trabajo puede cumplir varias a la vez: el color grande es el más importante (entregado, urgente, pendiente de pago y luego su avance) y las demás aparecen como etiquetas pequeñas.
      </li>
    </ul>
  )
}
