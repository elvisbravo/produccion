import { z } from 'zod'
import type { Semaforo } from './produccion.js'
import type { UsuarioResumen } from './prospectos.js'

const opcional = <T extends z.ZodType>(esquema: T) => z.preprocess((v) => (v === '' || v === null ? undefined : v), esquema.optional())
const dia = z.iso.date('Fecha no válida')
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida (HH:mm)')
const texto = (max: number) =>
  opcional(
    z
      .string()
      .trim()
      .max(max, `Máximo ${max} caracteres`)
      .transform((v) => v || undefined),
  )

/** Resultado planificado de una tarea: cuándo termina y con qué holgura. */
export interface ResultadoPlan {
  fin: string | null
  semaforo: Semaforo
  holguraDias: number | null
}

// ─── Reasignación por ausencia ──────────────────────────────

export type MotivoCandidato = 'equipo' | 'auxiliar' | 'jefe'
export const NOMBRE_MOTIVO_CANDIDATO: Record<MotivoCandidato, string> = {
  equipo: 'Del equipo del trabajo',
  auxiliar: 'Otro auxiliar',
  jefe: 'Jefe de producción',
}

export interface CandidatoReasignacion {
  usuario: UsuarioResumen
  motivo: MotivoCandidato
  /** Cómo quedaría la tarea en su cola (tareas en cola) o si está libre a esa hora (reuniones). */
  resultado: ResultadoPlan | null
  disponible: boolean
  aviso: string | null
}

/**
 * posponer: la cola se corre sola y aún llega a la fecha límite.
 * reasignar: no llega (o es una reunión ese día): conviene pasarla a otra persona.
 * coordinar: reunión sin nadie disponible: reprogramarla con el cliente.
 */
export type SugerenciaReasignacion = 'posponer' | 'reasignar' | 'coordinar'

export interface PropuestaReasignacion {
  tarea: {
    id: string
    titulo: string
    color: string
    enCola: boolean
    /** Reuniones: día y hora. */
    fecha: string
    hora: string | null
    minutos: number
    referencia: { tipo: 'prospecto' | 'trabajo'; id: string; codigo: string } | null
    fechaLimite: string | null
  }
  actual: ResultadoPlan | null
  sugerencia: SugerenciaReasignacion
  sugerido: string | null
  candidatos: CandidatoReasignacion[]
}

export interface PlanReasignacion {
  ausenciaId: string
  usuario: UsuarioResumen
  propuestas: PropuestaReasignacion[]
}

export const aplicarReasignacionSchema = z.object({
  cambios: z.array(z.object({ tareaId: z.uuid(), usuarioId: z.uuid() })).min(1, 'Elige al menos una tarea para reasignar'),
})
export type AplicarReasignacionDatos = z.output<typeof aplicarReasignacionSchema>

// ─── Inserción urgente ──────────────────────────────────────

export const ESTADOS_URGENTE = ['pendiente', 'ejecutada', 'rechazada'] as const
export type EstadoUrgente = (typeof ESTADOS_URGENTE)[number]
export const NOMBRE_ESTADO_URGENTE: Record<EstadoUrgente, string> = { pendiente: 'Por ejecutar', ejecutada: 'Ejecutada', rechazada: 'Rechazada' }

export const solicitarUrgenteSchema = z.object({ motivo: z.string().trim().min(5, 'Explica por qué es urgente').max(1000) })
/** Personas distintas entre las que se puede repartir una urgencia. */
export const MAX_PERSONAS_URGENTE = 4

/** A quién va cada entregable de la urgencia; `entregableId: null` son las tareas del trabajo sin entregable. */
export const repartoUrgenteSchema = z
  .array(z.object({ entregableId: z.uuid().nullable(), usuarioId: z.string().min(1, 'Elige a la persona').pipe(z.uuid()) }))
  .min(1, 'Asigna al menos un entregable')
  .superRefine((reparto, ctx) => {
    if (new Set(reparto.map((r) => r.entregableId)).size !== reparto.length) ctx.addIssue({ code: 'custom', message: 'Un entregable solo puede ir a una persona' })
    if (new Set(reparto.map((r) => r.usuarioId)).size > MAX_PERSONAS_URGENTE) {
      ctx.addIssue({ code: 'custom', message: `Reparte entre ${MAX_PERSONAS_URGENTE} personas como máximo` })
    }
  })
export type RepartoUrgente = z.output<typeof repartoUrgenteSchema>

/**
 * Se ejecuta con un reparto por entregable o, como siempre, con un solo auxiliar para todo (`usuarioId`).
 */
export const ejecutarUrgenteSchema = z
  .object({
    usuarioId: opcional(z.string().pipe(z.uuid())),
    reparto: repartoUrgenteSchema.optional(),
    /** Ejecutar aunque atrase trabajos con fechas fijas (solo quien puede fijarlas). */
    forzarFechasFijas: z.boolean().optional(),
    observacion: texto(500),
  })
  .superRefine((d, ctx) => {
    if (!d.usuarioId && !d.reparto) ctx.addIssue({ code: 'custom', path: ['reparto'], message: 'Elige a quién se asigna' })
    if (d.usuarioId && d.reparto) ctx.addIssue({ code: 'custom', path: ['reparto'], message: 'Indica un auxiliar o un reparto, no ambos' })
  })
export type EjecutarUrgenteDatos = z.output<typeof ejecutarUrgenteSchema>
export const simularRepartoSchema = z.object({ reparto: repartoUrgenteSchema })
export const rechazarUrgenteSchema = z.object({ observacion: z.string().trim().min(3, 'Explica el motivo').max(500) })

export interface SolicitudUrgenteItem {
  id: string
  trabajo: { id: string; codigo: string; titulo: string | null; fechaLimite: string; prioridad: { nombre: string; color: string } }
  motivo: string
  estado: EstadoUrgente
  solicitadaPor: UsuarioResumen
  solicitadaEn: string
  resueltaPor: UsuarioResumen | null
  resueltaEn: string | null
  /** Quien recibió más trabajo (o el único auxiliar). */
  usuarioAsignado: UsuarioResumen | null
  /** Cómo se repartió; vacío si aún no se ejecuta. */
  asignaciones: { usuario: UsuarioResumen; tareas: number; minutos: number }[]
  observacion: string | null
  /** Tareas del trabajo que aún no se hacen (las que pasan adelante). */
  tareasPendientes: number
  minutosPendientes: number
}

export interface ImpactoItem {
  tareaId: string
  titulo: string
  trabajo: { id: string; codigo: string }
  esUrgente: boolean
  /** De un trabajo con fechas fijas: no debería atrasarse. */
  fija: boolean
  antes: ResultadoPlan | null
  despues: ResultadoPlan
}

/** Tareas de la urgencia agrupadas por entregable: lo que se reparte entre las personas. */
export interface BloqueUrgente {
  /** null = tareas del trabajo sin entregable. */
  entregableId: string | null
  nombre: string
  tareas: number
  minutos: number
  fechaLimite: string | null
  /** Quien lo tiene hoy en su cola. */
  responsableActual: UsuarioResumen | null
  /** Quienes pueden tomarlo: con un rol permitido para sus tareas (y, si se elabora, que no sea el jefe que lo revisa). */
  elegibles: UsuarioResumen[]
}

export interface PropuestaUrgente {
  bloques: BloqueUrgente[]
  /** Reparto que termina antes, repartiendo lo más parejo posible (se puede cambiar a mano). */
  sugerencia: RepartoUrgente
}

/** Cómo queda cada cola si se ejecuta el reparto. */
export interface ImpactoReparto {
  personas: (ImpactoUrgente & { entregables: string[]; minutos: number })[]
  /** Cuándo termina la última tarea urgente. */
  terminaEl: string | null
  pasanARojo: number
  /** Tareas de trabajos con fechas fijas que llegaban a tiempo y dejarían de llegar. */
  pasanFijasARojo: number
  /** Códigos de esos trabajos. */
  trabajosFijosAfectados: string[]
}

/** Cómo queda la cola del auxiliar si se ejecuta la urgencia. */
export interface ImpactoUrgente {
  usuario: UsuarioResumen
  items: ImpactoItem[]
  /** Tareas que llegaban a tiempo y dejarían de llegar. */
  pasanARojo: number
  /** La tarea en proceso que se pausaría. */
  pausada: { tareaId: string; titulo: string } | null
}

// ─── Horas extra y bonos ────────────────────────────────────

export const MODALIDADES_EXTRA = ['horas_extra', 'bono'] as const
export type ModalidadExtra = (typeof MODALIDADES_EXTRA)[number]
export const NOMBRE_MODALIDAD_EXTRA: Record<ModalidadExtra, string> = { horas_extra: 'Horas extra', bono: 'Bono' }

export const ESTADOS_EXTRA = ['propuesta', 'aceptada', 'rechazada', 'aprobada', 'realizada', 'anulada'] as const
export type EstadoExtra = (typeof ESTADOS_EXTRA)[number]
export const NOMBRE_ESTADO_EXTRA: Record<EstadoExtra, string> = {
  propuesta: 'Por responder',
  aceptada: 'Por aprobar',
  rechazada: 'Rechazada',
  aprobada: 'Aprobada',
  realizada: 'Realizada',
  anulada: 'Anulada',
}

export const proponerExtraSchema = z
  .object({
    usuarioId: z.string().min(1, 'Elige a la persona').pipe(z.uuid()),
    modalidad: z.enum(MODALIDADES_EXTRA),
    trabajoId: z.string().min(1, 'Elige el trabajo').pipe(z.uuid()),
    entregableId: opcional(z.uuid()),
    descripcion: z.string().trim().min(3, 'Describe qué se hará').max(500),
    fecha: opcional(dia),
    horaInicio: opcional(hora),
    horaFin: opcional(hora),
    monto: opcional(z.coerce.number('Monto no válido').positive('Debe ser mayor que cero').max(100_000)),
  })
  .superRefine((d, ctx) => {
    if (d.modalidad === 'horas_extra') {
      if (!d.fecha) ctx.addIssue({ code: 'custom', message: 'Elige el día', path: ['fecha'] })
      if (!d.horaInicio) ctx.addIssue({ code: 'custom', message: 'Indica la hora de inicio', path: ['horaInicio'] })
      if (!d.horaFin) ctx.addIssue({ code: 'custom', message: 'Indica la hora de fin', path: ['horaFin'] })
      if (d.horaInicio && d.horaFin && d.horaInicio >= d.horaFin) ctx.addIssue({ code: 'custom', message: 'La hora de fin debe ser posterior', path: ['horaFin'] })
    } else if (!d.monto) {
      ctx.addIssue({ code: 'custom', message: 'Indica el monto del bono', path: ['monto'] })
    }
  })
export type ProponerExtraFormulario = z.input<typeof proponerExtraSchema>
export type ProponerExtraDatos = z.output<typeof proponerExtraSchema>

export const responderExtraSchema = z.object({ acepta: z.boolean(), motivo: texto(500) })
export const realizarExtraSchema = z.object({ minutosReales: opcional(z.coerce.number().int().min(1).max(24 * 60)) })
export const topesExtraSchema = z.object({
  semanal: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().min(0).max(80).nullable()),
  mensual: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().min(0).max(300).nullable()),
})
export type TopesExtra = z.output<typeof topesExtraSchema>
export const listarExtrasSchema = z.object({
  vista: z.enum(['mias', 'por_aprobar', 'todas']).default('todas'),
  desde: dia.optional(),
  hasta: dia.optional(),
})
export type VistaExtras = z.output<typeof listarExtrasSchema>['vista']

export interface HoraExtraItem {
  id: string
  usuario: UsuarioResumen
  modalidad: ModalidadExtra
  trabajo: { id: string; codigo: string; titulo: string | null }
  entregable: { id: string; nombre: string } | null
  descripcion: string
  fecha: string | null
  horaInicio: string | null
  horaFin: string | null
  minutos: number | null
  monto: number | null
  estado: EstadoExtra
  propuestaPor: UsuarioResumen
  propuestaEn: string
  motivoRechazo: string | null
  aprobadaPor: UsuarioResumen | null
  minutosReales: number | null
  /** Avisos: tope superado, cae en feriado o cumpleaños (requiere aceptación)… */
  avisos: string[]
}

export interface ResumenExtras {
  desde: string
  hasta: string
  topes: TopesExtra
  personas: { usuario: UsuarioResumen; minutosPlanificados: number; minutosReales: number; bonos: number; cantidad: number }[]
  items: HoraExtraItem[]
}
