import {
  NOMBRE_DISPONIBILIDAD,
  NOMBRE_ESTADO_AUSENCIA,
  NOMBRE_ESTADO_DIA,
  NOMBRE_TIPO_AUSENCIA,
  type EstadoAusencia,
  type EstadoDia,
  type EstadoDisponibilidad,
  type TipoAusencia,
} from '@grupoes/shared'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const VERDE = 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
const AMBAR = 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
const ROJO = 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
const VIOLETA = 'border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200'
const GRIS = 'text-muted-foreground'

/** Colores de la carga de un día (también para la barra de la vista de equipo). */
export const COLOR_ESTADO_DIA: Record<EstadoDia, { insignia: string; barra: string }> = {
  libre: { insignia: VERDE, barra: 'bg-green-500' },
  ocupado: { insignia: AMBAR, barra: 'bg-amber-500' },
  sobrecargado: { insignia: ROJO, barra: 'bg-red-500' },
  no_laborable: { insignia: VIOLETA, barra: 'bg-violet-400' },
  descanso: { insignia: GRIS, barra: 'bg-muted-foreground/40' },
}

export function InsigniaEstadoDia({ estado, className }: { estado: EstadoDia; className?: string }) {
  return (
    <Badge variant="outline" className={cn(COLOR_ESTADO_DIA[estado].insignia, className)}>
      {NOMBRE_ESTADO_DIA[estado]}
    </Badge>
  )
}

const ESTILO_DISPONIBILIDAD: Record<EstadoDisponibilidad, string> = {
  libre: VERDE,
  fuera_horario: AMBAR,
  sobrecargado: AMBAR,
  ocupado: ROJO,
  no_laborable: VIOLETA,
}

export function InsigniaDisponibilidad({ estado }: { estado: EstadoDisponibilidad }) {
  return (
    <Badge variant="outline" className={ESTILO_DISPONIBILIDAD[estado]}>
      {NOMBRE_DISPONIBILIDAD[estado]}
    </Badge>
  )
}

const ESTILO_AUSENCIA: Record<EstadoAusencia, string> = {
  solicitada: AMBAR,
  aprobada: VERDE,
  rechazada: ROJO,
  anulada: `${GRIS} line-through`,
}

export function InsigniaEstadoAusencia({ estado }: { estado: EstadoAusencia }) {
  return (
    <Badge variant="outline" className={ESTILO_AUSENCIA[estado]}>
      {NOMBRE_ESTADO_AUSENCIA[estado]}
    </Badge>
  )
}

export function InsigniaTipoAusencia({ tipo }: { tipo: TipoAusencia }) {
  return <Badge variant="secondary">{NOMBRE_TIPO_AUSENCIA[tipo]}</Badge>
}
