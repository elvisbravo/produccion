import { z } from 'zod'
import type { UsuarioResumen } from './prospectos.js'

const dia = z.iso.date('Fecha no válida')
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida (HH:mm)')
const opcional = <T extends z.ZodType>(esquema: T) => z.preprocess((v) => (v === '' || v === null ? undefined : v), esquema.optional())
const texto = (max: number) =>
  opcional(
    z
      .string()
      .trim()
      .max(max, `Máximo ${max} caracteres`)
      .transform((v) => v || undefined),
  )

export const ESTADOS_OBSERVACION = ['por_valorar', 'valorada', 'confirmada', 'programada', 'resuelta', 'cancelada'] as const
export type EstadoObservacion = (typeof ESTADOS_OBSERVACION)[number]
export const NOMBRE_ESTADO_OBSERVACION: Record<EstadoObservacion, string> = {
  por_valorar: 'Por valorar',
  valorada: 'Por confirmar con el cliente',
  confirmada: 'Por programar',
  programada: 'Programada',
  resuelta: 'Resuelta',
  cancelada: 'Cancelada',
}

/** Quien valora: cuánto demora, la lista de observaciones y la fecha y hora de entrega que propone. */
export const valorarObservacionSchema = z.object({
  minutos: z.coerce.number('Indica el tiempo').int('Número entero').min(15, 'Mínimo 15 minutos').max(60 * 200, 'Máximo 200 horas'),
  fecha: z.string().min(1, 'Elige la fecha de entrega').pipe(dia),
  hora: z.string().min(1, 'Elige la hora de entrega').pipe(hora),
  items: z.array(z.string().trim().min(2, 'Escribe la observación').max(500, 'Máximo 500 caracteres')).min(1, 'Agrega al menos una observación').max(40, 'Máximo 40 observaciones'),
  nota: texto(500),
})
export type ValorarObservacionFormulario = z.input<typeof valorarObservacionSchema>
export type ValorarObservacionDatos = z.output<typeof valorarObservacionSchema>

/** La asistente administrativa confirma lo propuesto o negocia otra fecha y hora con el cliente. */
export const confirmarObservacionSchema = z
  .object({ fecha: opcional(dia), hora: opcional(hora), nota: texto(500) })
  .refine((d) => Boolean(d.fecha) === Boolean(d.hora), { message: 'Indica el día y la hora', path: ['hora'] })
export type ConfirmarObservacionFormulario = z.input<typeof confirmarObservacionSchema>
export type ConfirmarObservacionDatos = z.output<typeof confirmarObservacionSchema>

/** La asistente de producción programa la corrección: por defecto la hace quien hizo el trabajo. */
export const programarObservacionSchema = z.object({
  usuarioId: opcional(z.uuid('Elige a la persona')),
  /** Acepta que otras tareas del auxiliar dejen de llegar a su fecha, o que no alcance en horario normal. */
  confirmarImpacto: z.boolean().optional(),
  /** Acepta atrasar un trabajo de fechas inamovibles (exige permiso). */
  forzarFechasFijas: z.boolean().optional(),
  /** Para lo que no cabe en horario normal: proponer horas extra o un bono a quien la hará. */
  extra: z
    .object({
      modalidad: z.enum(['horas_extra', 'bono']),
      fecha: opcional(dia),
      horaInicio: opcional(hora),
      horaFin: opcional(hora),
      monto: opcional(z.coerce.number().positive().max(100_000)),
      acumula: z.boolean().optional(),
    })
    .optional(),
})
export type ProgramarObservacionDatos = z.output<typeof programarObservacionSchema>

export const consultaObservacionesSchema = z.object({ estado: z.enum(ESTADOS_OBSERVACION).optional(), trabajoId: z.uuid().optional() })
export type ConsultaObservaciones = z.output<typeof consultaObservacionesSchema>

export const consultaPlazoSchema = z.object({
  minutos: z.coerce.number().int().min(15).max(60 * 200),
  fecha: dia,
  hora,
})
export type ConsultaPlazo = z.output<typeof consultaPlazoSchema>

/** Si el tiempo estimado cabe antes de la hora de entrega y qué hacer si no. */
export interface PlazoEvaluado {
  /** Quien hizo el trabajo (el que se sugiere para corregirlo). */
  auxiliar: UsuarioResumen | null
  entrega: string
  cabe: boolean
  /** Minutos que no caben en su horario normal antes de la hora de entrega. */
  faltanMinutos: number
  /** Cuándo empezaría y terminaría en su horario normal (ISO). */
  inicio: string | null
  fin: string | null
  /** Si no cabe: cuándo se podría entregar en horario normal (para proponérselo al cliente). */
  sugerenciaEntrega: string | null
  /** Si no cabe y la hora de entrega pasa de su jornada: una ventana de horas extra que lo cubriría. */
  extra: { fecha: string; horaInicio: string; horaFin: string; minutos: number; cubreTodo: boolean; avisos: string[] } | null
  /** Texto corto para mostrar: «Cabe», «No cabe: …». */
  mensaje: string
}

/** Quién podría hacer la corrección: si le cabe antes de la entrega y qué atrasaría en su cola. */
export interface CandidatoCorreccion {
  usuario: UsuarioResumen
  esOriginal: boolean
  plazo: PlazoEvaluado
  /** Tareas suyas que dejarían de llegar a su fecha límite si la corrección pasa primero. */
  pasanARojo: number
  /** Códigos de trabajos de fechas inamovibles que se atrasarían. */
  fijasAfectadas: string[]
  recomendado: boolean
}

export interface ItemObservacionDto {
  id: string
  orden: number
  texto: string
  resuelto: boolean
}

export interface ObservacionItem {
  id: string
  estado: EstadoObservacion
  ronda: number
  /** Lo que dijo el cliente. */
  observaciones: string
  creadaEn: string
  creadaPor: UsuarioResumen
  trabajo: { id: string; codigo: string; titulo: string | null }
  entregable: { id: string; nombre: string }
  /** La asistente administrativa que sigue al cliente. */
  asistente: UsuarioResumen | null
  tomadaPor: UsuarioResumen | null
  valoradaPor: UsuarioResumen | null
  minutosEstimados: number | null
  entregaPropuesta: string | null
  notaValoracion: string | null
  items: ItemObservacionDto[]
  confirmadaPor: UsuarioResumen | null
  entregaConfirmada: string | null
  notaConfirmacion: string | null
  programadaPor: UsuarioResumen | null
  tareaId: string | null
  /** Quien hizo el trabajo (se sugiere para la corrección). */
  auxiliarOriginal: UsuarioResumen | null
}

export interface ObservacionDetalle extends ObservacionItem {
  /** Evaluación con la hora de entrega vigente (la confirmada o, si no, la propuesta). */
  plazo: PlazoEvaluado | null
  /** Si al programar se propuso horas extra o bono y no se pudo, el motivo. */
  avisoExtra?: string | null
}
