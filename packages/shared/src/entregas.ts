import { z } from 'zod'
import type { Semaforo } from './produccion.js'
import type { UsuarioResumen } from './prospectos.js'
import { SEGUIMIENTOS, type TrabajoListadoItem } from './trabajos.js'

const dia = z.iso.date('Fecha no válida')
const opcional = <T extends z.ZodType>(esquema: T) => z.preprocess((v) => (v === '' || v === null ? undefined : v), esquema.optional())

export const consultaEntregasSchema = z.object({
  /** Primer día (por defecto, el lunes de esta semana). */
  desde: opcional(dia),
  /** Último día (por defecto, el domingo de esa semana). Máximo 31 días. */
  hasta: opcional(dia),
  /** Quien tiene la actividad (el auxiliar de la tarea o el principal del trabajo). */
  auxiliarId: z.uuid().optional(),
  jefeId: z.uuid().optional(),
  /** La asistente administrativa que sigue al cliente. */
  asistenteId: z.uuid().optional(),
  seguimiento: z.enum(SEGUIMIENTOS).optional(),
})
export type ConsultaEntregas = z.output<typeof consultaEntregasSchema>
export type ConsultaEntregasFiltros = Partial<ConsultaEntregas>

export const notaEntregaSchema = z.object({
  nota: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().trim().max(300, 'Máximo 300 caracteres').optional()),
})
export type NotaEntregaDatos = z.output<typeof notaEntregaSchema>

/** Un trabajo en el tablero de entregas: la actividad que toca ahora, quién la hace y cuándo se entrega. */
export interface EntregaFila {
  trabajo: TrabajoListadoItem
  /** La actividad que se está haciendo (o la próxima). Nulo si el trabajo aún no tiene tareas. */
  actividad: { tareaId: string; nombre: string; titulo: string | null; color: string; estado: 'pendiente' | 'en_proceso'; minutosEstimados: number; minutosHechos: number } | null
  /** Quienes tienen esa actividad (en un trabajo sin tareas, el auxiliar principal). */
  auxiliares: UsuarioResumen[]
  asistente: UsuarioResumen | null
  enlace: string | null
  /** Fecha de entrega que pidió el cliente. */
  entregaCliente: string
  /** Fecha de entrega interna de esa actividad (la de su entregable). */
  entregaInterna: string
  /** Inicio planificado de la actividad en la cola (ISO). */
  inicio: string | null
  fin: string | null
  semaforo: Semaforo | null
  /** Ya se trabajó más de lo estimado. */
  revisarTiempos: boolean
  nota: string | null
}

export interface DiaEntregas {
  fecha: string
  feriado: { nombre: string; medioDia: boolean } | null
  /** Nombres de quienes cumplen años ese día. */
  cumpleanos: string[]
  filas: EntregaFila[]
}

export interface TableroEntregas {
  desde: string
  hasta: string
  dias: DiaEntregas[]
}
