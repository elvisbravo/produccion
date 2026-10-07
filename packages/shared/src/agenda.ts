import { z } from 'zod'
import type { UsuarioResumen } from './prospectos.js'
import type { Comportamiento, EstadoTarea } from './tareas.js'

// ─── Horas y tramos ─────────────────────────────────────────

/** Minutos desde las 00:00 → "HH:mm". */
export function minutosAHora(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
}

/** "HH:mm" → minutos desde las 00:00. */
export function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

/** Tramo de trabajo en minutos desde las 00:00 (480 = 8:00). */
export interface Intervalo {
  inicio: number
  fin: number
}

export interface TramoSemanal extends Intervalo {
  /** 1 = lunes … 7 = domingo */
  diaSemana: number
}

export const NOMBRE_DIA_SEMANA = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const
const INICIAL_DIA = ['', 'L', 'M', 'X', 'J', 'V', 'S', 'D'] as const

/** Día de la semana (1 = lunes … 7 = domingo) de un día YYYY-MM-DD. */
export function diaSemanaDe(dia: string): number {
  return ((new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7) + 1
}

const horaCorta = (m: number) => minutosAHora(m).replace(/^0/, '')

/** Resumen legible de un horario semanal: "L–V 8:00–13:00, 15:00–19:00 · S 8:00–13:00". */
export function resumirHorario(tramos: TramoSemanal[]): string {
  const porDia = new Map<number, string>()
  for (let d = 1; d <= 7; d++) {
    const texto = tramos
      .filter((t) => t.diaSemana === d)
      .sort((a, b) => a.inicio - b.inicio)
      .map((t) => `${horaCorta(t.inicio)}–${horaCorta(t.fin)}`)
      .join(', ')
    if (texto) porDia.set(d, texto)
  }
  const grupos: { desde: number; hasta: number; texto: string }[] = []
  for (const [d, texto] of porDia) {
    const ultimo = grupos.at(-1)
    if (ultimo && ultimo.texto === texto && ultimo.hasta === d - 1) ultimo.hasta = d
    else grupos.push({ desde: d, hasta: d, texto })
  }
  if (grupos.length === 0) return 'Sin horario'
  return grupos
    .map((g) => `${INICIAL_DIA[g.desde]}${g.hasta > g.desde ? `–${INICIAL_DIA[g.hasta]}` : ''} ${g.texto}`)
    .join(' · ')
}

// ─── Esquemas ───────────────────────────────────────────────

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

export const tramoSchema = z
  .object({ diaSemana: z.number().int().min(1).max(7), inicio: hora, fin: hora })
  .refine((t) => t.inicio < t.fin, { message: 'La hora de fin debe ser posterior al inicio', path: ['fin'] })
export type TramoFormulario = z.input<typeof tramoSchema>

/** Tramos sin cruces dentro del mismo día. */
const tramosSchema = z.array(tramoSchema).superRefine((tramos, ctx) => {
  tramos.forEach((t, i) => {
    const cruce = tramos.findIndex((o, j) => j < i && o.diaSemana === t.diaSemana && o.inicio < t.fin && t.inicio < o.fin)
    if (cruce >= 0) ctx.addIssue({ code: 'custom', message: `Se cruza con otro tramo del ${NOMBRE_DIA_SEMANA[t.diaSemana].toLowerCase()}`, path: [i, 'inicio'] })
  })
})

export const plantillaHorarioSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe un nombre').max(80),
  porDefecto: z.boolean().default(false),
  tramos: tramosSchema,
})
export type PlantillaHorarioFormulario = z.input<typeof plantillaHorarioSchema>
export type PlantillaHorarioDatos = z.output<typeof plantillaHorarioSchema>

export const horarioUsuarioSchema = z.object({
  vigenteDesde: z.string().min(1, 'Elige desde cuándo rige').pipe(dia),
  plantillaId: opcional(z.uuid()),
  tramos: tramosSchema,
})
export type HorarioUsuarioFormulario = z.input<typeof horarioUsuarioSchema>
export type HorarioUsuarioDatos = z.output<typeof horarioUsuarioSchema>

export const datosPersonalSchema = z.object({ fechaNacimiento: opcional(dia).nullable() })
export type DatosPersonalDatos = z.output<typeof datosPersonalSchema>

export const ALCANCES_FERIADO = ['nacional', 'empresa'] as const
export type AlcanceFeriado = (typeof ALCANCES_FERIADO)[number]
export const NOMBRE_ALCANCE_FERIADO: Record<AlcanceFeriado, string> = { nacional: 'Nacional', empresa: 'De la empresa' }

export const feriadoSchema = z.object({
  fecha: z.string().min(1, 'Elige la fecha').pipe(dia),
  nombre: z.string().trim().min(1, 'Escribe el nombre').max(120),
  alcance: z.enum(ALCANCES_FERIADO).default('nacional'),
  medioDia: z.boolean().default(false),
})
export type FeriadoFormulario = z.input<typeof feriadoSchema>
export type FeriadoDatos = z.output<typeof feriadoSchema>

export const TIPOS_AUSENCIA = ['vacaciones', 'permiso', 'descanso_medico', 'otro', 'compensacion'] as const
export type TipoAusencia = (typeof TIPOS_AUSENCIA)[number]
export const NOMBRE_TIPO_AUSENCIA: Record<TipoAusencia, string> = {
  vacaciones: 'Vacaciones',
  permiso: 'Permiso',
  descanso_medico: 'Descanso médico',
  otro: 'Otro',
  compensacion: 'Días por horas extra',
}
/** Los que la persona solicita (el descanso médico lo registra producción o el administrador). */
export const TIPOS_AUSENCIA_SOLICITABLES = ['vacaciones', 'permiso', 'otro'] as const satisfies readonly TipoAusencia[]

export const ESTADOS_AUSENCIA = ['solicitada', 'aprobada', 'rechazada', 'anulada'] as const
export type EstadoAusencia = (typeof ESTADOS_AUSENCIA)[number]
export const NOMBRE_ESTADO_AUSENCIA: Record<EstadoAusencia, string> = {
  solicitada: 'Por aprobar',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  anulada: 'Anulada',
}

const ausenciaBase = z.object({
  tipo: z.enum(TIPOS_AUSENCIA, 'Elige el tipo'),
  fechaDesde: z.string().min(1, 'Elige el primer día').pipe(dia),
  fechaHasta: z.string().min(1, 'Elige el último día').pipe(dia),
  /** Solo para permisos por horas (un mismo día). */
  horaDesde: opcional(hora),
  horaHasta: opcional(hora),
  motivo: texto(500),
})

type AusenciaBase = z.output<typeof ausenciaBase>
const validarAusencia = (a: AusenciaBase, ctx: z.RefinementCtx) => {
  if (a.fechaHasta < a.fechaDesde) ctx.addIssue({ code: 'custom', message: 'El último día no puede ser anterior al primero', path: ['fechaHasta'] })
  if (!a.horaDesde !== !a.horaHasta) {
    ctx.addIssue({ code: 'custom', message: 'Indica la hora de inicio y la de fin', path: [a.horaDesde ? 'horaHasta' : 'horaDesde'] })
  }
  if (a.horaDesde && a.horaHasta) {
    if (a.tipo !== 'permiso') ctx.addIssue({ code: 'custom', message: 'Solo los permisos pueden ser por horas', path: ['horaDesde'] })
    if (a.fechaDesde !== a.fechaHasta) ctx.addIssue({ code: 'custom', message: 'Un permiso por horas es de un solo día', path: ['fechaHasta'] })
    if (a.horaDesde >= a.horaHasta) ctx.addIssue({ code: 'custom', message: 'La hora de fin debe ser posterior al inicio', path: ['horaHasta'] })
  }
}

export const solicitarAusenciaSchema = ausenciaBase.superRefine(validarAusencia)
export type AusenciaFormulario = z.input<typeof solicitarAusenciaSchema>
export type SolicitarAusenciaDatos = z.output<typeof solicitarAusenciaSchema>

export const registrarAusenciaSchema = ausenciaBase.extend({ usuarioId: z.string().min(1, 'Elige a la persona').pipe(z.uuid()) }).superRefine(validarAusencia)
export type RegistrarAusenciaFormulario = z.input<typeof registrarAusenciaSchema>
export type RegistrarAusenciaDatos = z.output<typeof registrarAusenciaSchema>

export const resolverAusenciaSchema = z.object({ observacion: texto(500) })
export const rechazarAusenciaSchema = z.object({ observacion: z.string().trim().min(1, 'Explica el motivo del rechazo').max(500) })

export const listarAusenciasSchema = z.object({
  estado: z.enum(ESTADOS_AUSENCIA).optional(),
  usuarioId: z.uuid().optional(),
  /** Ausencias que terminan desde este día (por defecto, desde hace 30 días). */
  desde: dia.optional(),
})

export const rangoAgendaSchema = z
  .object({ desde: dia, hasta: dia, rol: z.string().max(40).optional() })
  .refine((r) => r.hasta >= r.desde, { message: 'Rango no válido', path: ['hasta'] })
  .refine((r) => (Date.parse(r.hasta) - Date.parse(r.desde)) / 86_400_000 <= 62, { message: 'Máximo dos meses', path: ['hasta'] })

// ─── Respuestas ─────────────────────────────────────────────

export type TipoBloqueo = 'feriado' | 'cumpleanos' | TipoAusencia

export interface BloqueoDia {
  tipo: TipoBloqueo
  nombre: string
  /** null = todo el día; si no, solo esas horas. */
  intervalo: Intervalo | null
}

/**
 * libre / ocupado (más del 75 % de su capacidad) / sobrecargado (más del 100 %) /
 * no_laborable (feriado, cumpleaños o ausencia) / descanso (el horario no incluye ese día).
 */
export type EstadoDia = 'libre' | 'ocupado' | 'sobrecargado' | 'no_laborable' | 'descanso'
export const NOMBRE_ESTADO_DIA: Record<EstadoDia, string> = {
  libre: 'Libre',
  ocupado: 'Ocupado',
  sobrecargado: 'Sobrecargado',
  no_laborable: 'No laborable',
  descanso: 'Descanso',
}

export interface TareaAgenda {
  id: string
  actividad: string
  comportamiento: Comportamiento
  color: string | null
  estado: EstadoTarea
  /** Minutos desde las 00:00; null si no tiene hora fija. */
  inicio: number | null
  fin: number | null
  minutos: number
  referencia: { tipo: 'prospecto' | 'trabajo'; id: string; codigo: string; nombre: string | null } | null
  /** Tramo planificado de una tarea de la cola de trabajo (se acomoda sola alrededor de las reuniones). */
  enCola: boolean
}

export interface DiaAgenda {
  fecha: string
  diaSemana: number
  /** Horario de ese día. */
  tramos: Intervalo[]
  /** Horas extra aprobadas (fuera del horario). */
  extras: Intervalo[]
  bloqueos: BloqueoDia[]
  /** Horario menos los bloqueos parciales: el tiempo en que se puede programar. */
  libres: Intervalo[]
  /** Minutos disponibles (suma de los libres). */
  capacidad: number
  /** Minutos de tareas activas o hechas ese día. */
  ocupado: number
  estado: EstadoDia
  tareas: TareaAgenda[]
}

export interface AgendaPersona {
  usuario: UsuarioResumen
  roles: string[]
  dias: DiaAgenda[]
}

/** Una reunión con día y hora que aún espera responsable: se ve en el calendario del equipo sin ser de nadie todavía. */
export interface ReunionPorAsignarAgenda {
  fecha: string
  tarea: TareaAgenda
}

export interface AgendaEquipo {
  desde: string
  hasta: string
  personas: AgendaPersona[]
  /** Reuniones que esperan responsable en esos días. */
  porAsignar: ReunionPorAsignarAgenda[]
}

/** Disponibilidad de una persona para una tarea concreta (al asignar). */
export type EstadoDisponibilidad = 'libre' | 'fuera_horario' | 'sobrecargado' | 'ocupado' | 'no_laborable'
export const NOMBRE_DISPONIBILIDAD: Record<EstadoDisponibilidad, string> = {
  libre: 'Libre',
  fuera_horario: 'Fuera de horario',
  sobrecargado: 'Sobrecargado',
  ocupado: 'Ocupado',
  no_laborable: 'No laborable',
}

export interface Disponibilidad {
  estado: EstadoDisponibilidad
  /** Por qué no trabaja (solo en no_laborable). Bloquea la asignación. */
  bloqueo: string | null
  /** Advertencias que se pueden forzar con un motivo. */
  avisos: string[]
  capacidad: number
  ocupado: number
}

export interface TareaAfectada {
  id: string
  actividad: string
  fecha: string
  hora: string | null
}

export interface AusenciaItem {
  id: string
  usuario: UsuarioResumen
  tipo: TipoAusencia
  fechaDesde: string
  fechaHasta: string
  horaDesde: string | null
  horaHasta: string | null
  motivo: string | null
  estado: EstadoAusencia
  solicitadaPor: UsuarioResumen
  solicitadaEn: string
  resueltaPor: UsuarioResumen | null
  resueltaEn: string | null
  observacion: string | null
  /** Tareas activas de la persona dentro de la ausencia (hay que reprogramarlas o reasignarlas). */
  tareasAfectadas: TareaAfectada[]
}

export interface PlantillaHorarioItem {
  id: string
  nombre: string
  porDefecto: boolean
  tramos: TramoSemanal[]
  /** Personas que tienen hoy un horario copiado de esta plantilla. */
  enUso: number
}

export interface HorarioVigente {
  id: string | null
  vigenteDesde: string | null
  plantilla: { id: string; nombre: string } | null
  /** true si la persona no tiene horario propio y usa la plantilla por defecto. */
  porDefecto: boolean
  tramos: TramoSemanal[]
}

export interface PersonalItem {
  usuario: UsuarioResumen
  roles: string[]
  fechaNacimiento: string | null
  horario: HorarioVigente
  /** Cambio de horario programado para una fecha futura. */
  proximo: HorarioVigente | null
}

export interface FeriadoItem {
  id: string
  fecha: string
  nombre: string
  alcance: AlcanceFeriado
  medioDia: boolean
}
