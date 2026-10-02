import { NOMBRE_ESTADO_ENTREGABLE, type EstadoEntregable, type Semaforo } from '@grupoes/shared'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatearFechaHora } from '@/lib/formato'
import { cn } from '@/lib/utils'

const VERDE = 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
const AMBAR = 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
const AZUL = 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200'
const VIOLETA = 'border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200'

/** El magenta de la leyenda del equipo para Turnitin. */
export const ESTILO_TURNITIN = 'border-fuchsia-400 bg-fuchsia-200 text-fuchsia-950 hover:bg-fuchsia-300 dark:border-fuchsia-700 dark:bg-fuchsia-900/60 dark:text-fuchsia-50'

const ESTILO_ENTREGABLE: Record<EstadoEntregable, string> = {
  pendiente: '',
  en_proceso: AZUL,
  en_revision: VIOLETA,
  observado: AMBAR,
  aprobado: VERDE,
  en_turnitin: ESTILO_TURNITIN,
  entregado: AZUL,
  observado_cliente: AMBAR,
  cerrado: 'text-muted-foreground',
}

export function InsigniaEstadoEntregable({ estado }: { estado: EstadoEntregable }) {
  return (
    <Badge variant="outline" className={ESTILO_ENTREGABLE[estado]}>
      {NOMBRE_ESTADO_ENTREGABLE[estado]}
    </Badge>
  )
}

const COLOR_SEMAFORO: Record<Semaforo, string> = {
  verde: 'bg-green-500',
  ambar: 'bg-amber-500',
  rojo: 'bg-red-500',
  sin_plan: 'bg-red-500 ring-2 ring-red-200 dark:ring-red-900',
}

export function describirHolgura(semaforo: Semaforo, dias: number | null): string {
  if (semaforo === 'sin_plan') return 'No entra en la agenda de los próximos meses'
  if (dias === null) return ''
  if (dias < 0) return `No llega: termina ${-dias} ${dias === -1 ? 'día' : 'días'} tarde`
  if (dias === 0) return 'Termina el mismo día de la fecha límite'
  return `${dias} ${dias === 1 ? 'día' : 'días'} de holgura`
}

/** Punto de color con la holgura (verde, ámbar, rojo) y, al pasar el mouse, el detalle. */
export function PuntoSemaforo({ semaforo, dias, fin, className }: { semaforo: Semaforo; dias?: number | null; fin?: string | null; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-block size-2.5 shrink-0 rounded-full', COLOR_SEMAFORO[semaforo], className)} aria-label={describirHolgura(semaforo, dias ?? null)} />
      </TooltipTrigger>
      <TooltipContent>
        {fin && <p>Termina: {formatearFechaHora(fin)}</p>}
        <p>{describirHolgura(semaforo, dias ?? null) || 'Holgura según el plan'}</p>
      </TooltipContent>
    </Tooltip>
  )
}
