/** Panel de inicio: lo que cada persona necesita ver al entrar, según sus permisos. */

export type TonoIndicador = 'normal' | 'alerta' | 'ok'

export interface IndicadorInicio {
  clave: string
  titulo: string
  valor: string
  detalle?: string
  tono: TonoIndicador
  /** Ruta de la web a la que lleva. */
  enlace?: string
}

/** Algo que espera una acción de quien entra (solo se incluye si hay al menos uno). */
export interface PendienteInicio {
  clave: string
  titulo: string
  cantidad: number
  enlace: string
}

export interface PanelInicio {
  /** Qué grupos de información se calcularon (según los permisos). */
  secciones: ('trabajos' | 'entregables' | 'comercial' | 'cobranza' | 'equipo' | 'mi_cola' | 'ausencias' | 'actividad')[]
  indicadores: IndicadorInicio[]
  pendientes: PendienteInicio[]
  miCola: {
    /** Tareas pendientes o en proceso a su nombre. */
    total: number
    deHoy: number
    minutos: number
    siguiente: { titulo: string; actividad: string; trabajo: string | null; enlace: string } | null
  } | null
  ausenciasHoy: { nombre: string; tipo: string }[] | null
  graficos: {
    /** Ocupación de los últimos 7 días por persona (0 a 100). */
    ocupacion: { nombre: string; porcentaje: number }[] | null
    /** Prospectos abiertos por etapa. */
    embudo: { nombre: string; color: string; cantidad: number }[] | null
    /** Saldo por cobrar según su atraso. */
    cobranza: { tramo: string; monto: number }[] | null
    /** Puntualidad de los últimos 6 meses (0 a 100). */
    puntualidad: { mes: string; porcentaje: number; total: number }[] | null
  }
  actividad: { id: string; accion: string; entidad: string; usuario: string | null; fecha: string }[] | null
}
