import { z } from 'zod'
import type { UsuarioResumen } from './prospectos.js'

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida (HH:mm)')

/** Registro manual: para cuando se olvidó usar el cronómetro (queda marcado como manual). */
export const tiempoManualSchema = z
  .object({
    fecha: z.string().min(1, 'Elige el día').pipe(z.iso.date('Fecha no válida')),
    horaInicio: hora,
    horaFin: hora,
    motivo: z.string().trim().min(3, 'Cuenta por qué se registra a mano').max(300),
  })
  .refine((d) => d.horaInicio < d.horaFin, { message: 'La hora de fin debe ser posterior', path: ['horaFin'] })
export type TiempoManualFormulario = z.input<typeof tiempoManualSchema>
export type TiempoManualDatos = z.output<typeof tiempoManualSchema>

/** El cronómetro que la persona tiene corriendo (uno a la vez). */
export interface TiempoActivo {
  registroId: string
  tarea: { id: string; titulo: string; color: string; referencia: string | null; enlace: string }
  /** Instante ISO en que empezó este tramo. */
  inicio: string
  /** Minutos ya registrados en tramos anteriores de la misma tarea (de esta persona). */
  minutosPrevios: number
  minutosEstimados: number
}

export interface RegistroTiempoItem {
  id: string
  usuario: UsuarioResumen
  inicio: string
  fin: string | null
  minutos: number | null
  manual: boolean
  motivo: string | null
  autoCerrado: boolean
}

export interface TiemposDeTarea {
  minutosEstimados: number
  minutosReales: number
  registros: RegistroTiempoItem[]
}

// ─── Reporte: estimado frente a real ────────────────────────

export const reporteTiemposSchema = z.object({
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
})

export interface FilaComparacion {
  tareas: number
  minutosEstimados: number
  minutosReales: number
  /** real / estimado − 1 (0,25 = 25 % más de lo estimado). null si no hay estimado. */
  desviacion: number | null
}

export interface ReporteTiempos {
  desde: string
  hasta: string
  total: FilaComparacion
  porActividad: (FilaComparacion & {
    actividad: { id: string; nombre: string; color: string }
    estimadoCatalogo: number
    /** Mediana del tiempo real por tarea: referencia para ajustar el catálogo. */
    medianaReal: number
  })[]
  porPersona: (FilaComparacion & { usuario: UsuarioResumen; minutosManuales: number })[]
  /** Las tareas con mayor diferencia (en minutos) entre lo estimado y lo real. */
  mayoresDesvios: {
    id: string
    titulo: string
    actividad: string
    referencia: { tipo: 'prospecto' | 'trabajo'; id: string; codigo: string } | null
    responsables: string[]
    minutosEstimados: number
    minutosReales: number
    desviacion: number | null
    completadaEn: string
  }[]
}
