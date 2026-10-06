import { z } from 'zod'
import type { Disponibilidad } from './agenda.js'
import type { PersonaResumen, Temperatura, UsuarioResumen } from './prospectos.js'

export const ESTADOS_TAREA = ['por_asignar', 'pendiente', 'en_proceso', 'completada', 'cancelada', 'no_asistio', 'en_pausa'] as const
export type EstadoTarea = (typeof ESTADOS_TAREA)[number]
export const ESTADOS_ACTIVOS: readonly EstadoTarea[] = ['por_asignar', 'pendiente', 'en_proceso']
export const NOMBRE_ESTADO_TAREA: Record<EstadoTarea, string> = {
  por_asignar: 'Por asignar',
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
  en_pausa: 'En pausa',
}

export const MODALIDADES = ['presencial', 'virtual'] as const
export type Modalidad = (typeof MODALIDADES)[number]
export const NOMBRE_MODALIDAD: Record<Modalidad, string> = { presencial: 'Presencial', virtual: 'Virtual' }

export type Comportamiento = 'reunion' | 'contacto' | 'produccion' | 'correccion' | 'revision' | 'administrativa' | 'entrega'
export type ModoAsignacion = 'creador' | 'directa' | 'coordinada' | 'responsable_trabajo'

/** Campo opcional: '' y null cuentan como vacío. */
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

const responsableSchema = z.object({ participacionId: z.uuid(), usuarioId: z.uuid('Elige a la persona') })

export const programarTareaSchema = z.object({
  actividadId: z.string().min(1, 'Elige la actividad').pipe(z.uuid()),
  fecha: z.string().min(1, 'Elige el día').pipe(dia),
  hora: opcional(hora),
  modalidad: opcional(z.enum(MODALIDADES)),
  notas: texto(1000),
  /** Contactos que participan (por defecto, todos los del prospecto). */
  personaIds: z.array(z.uuid()).optional(),
  /** Solo en actividades de asignación directa. */
  responsables: z.array(responsableSchema).optional(),
})
export type ProgramarTareaFormulario = z.input<typeof programarTareaSchema>
export type ProgramarTareaDatos = z.output<typeof programarTareaSchema>

export const asignarTareaSchema = z.object({
  responsables: z.array(responsableSchema).min(1, 'Asigna al menos a una persona'),
  /** Obligatorio si alguna persona tiene un choque de horario. */
  motivoForzado: texto(300),
})
export type AsignarTareaDatos = z.output<typeof asignarTareaSchema>

export const reprogramarTareaSchema = z.object({
  fecha: z.string().min(1, 'Elige el día').pipe(dia),
  hora: opcional(hora),
  motivo: texto(300),
})
export type ReprogramarTareaDatos = z.output<typeof reprogramarTareaSchema>

export const cancelarTareaSchema = z.object({
  motivo: z.string().trim().min(3, 'Indica el motivo').max(300),
})

export const completarTareaSchema = z.object({
  /** En reuniones: si el cliente no asistió, la tarea queda como "No asistió". */
  asistio: z.boolean().default(true),
  resultadoContactoId: opcional(z.uuid()),
  resultado: texto(2000),
  /** Siguiente paso del seguimiento. */
  siguiente: programarTareaSchema.pick({ actividadId: true, fecha: true, hora: true, modalidad: true, notas: true }).optional(),
  /** Cerrar el prospecto como perdido en lugar de agendar el siguiente paso. */
  marcarPerdido: z.object({ motivoPerdidaId: z.string().min(1, 'Elige el motivo').pipe(z.uuid()) }).optional(),
})
export type CompletarTareaDatos = z.output<typeof completarTareaSchema>

export const cambiarEtapaSchema = z.object({
  etapaId: z.uuid(),
  motivoPerdidaId: opcional(z.uuid()),
})
export type CambiarEtapaDatos = z.output<typeof cambiarEtapaSchema>

// ─── Respuestas de la API ───────────────────────────────────

export interface ActividadCatalogo {
  id: string
  nombre: string
  tipo: { nombre: string; comportamiento: Comportamiento; color: string }
  minutosEstimados: number
  aplicaA: 'prospecto' | 'cliente' | 'ambos'
  requiereHoraFija: boolean
  modoAsignacion: ModoAsignacion
  esSeguimiento: boolean
  participaciones: {
    id: string
    nombre: string
    obligatoria: boolean
    cantidad: number
    roles: { codigo: string; nombre: string; prioridad: { nombre: string; nivel: number } }[]
  }[]
}

export interface TareaItem {
  id: string
  actividad: { id: string; nombre: string; comportamiento: Comportamiento; color: string; esSeguimiento: boolean; requiereHoraFija: boolean }
  fecha: string
  /** ISO, si tiene hora. */
  inicio: string | null
  minutosEstimados: number
  modalidad: Modalidad | null
  /** Reuniones virtuales: enlace de la videollamada. */
  enlaceReunion: string | null
  estado: EstadoTarea
  vencida: boolean
  notas: string | null
  resultado: string | null
  resultadoContacto: string | null
  completadaEn: string | null
  motivoCancelacion: string | null
  vecesReprogramada: number
  prospecto: { id: string; codigo: string; responsableId: string; contacto: PersonaResumen | null } | null
  /** Tareas de producción: el trabajo y, si aplica, el entregable. */
  trabajo: { id: string; codigo: string; titulo: string | null } | null
  entregable: { id: string; nombre: string } | null
  titulo: string | null
  /** Minutos reales de los tramos cerrados (cronómetro y manual); el tramo en curso se suma desde enCurso. */
  minutosReales: number
  /** Quiénes tienen el cronómetro corriendo en esta tarea y desde cuándo. */
  enCurso: { usuarioId: string; inicio: string }[]
  responsables: { usuario: UsuarioResumen; participacion: string; rol: string; prioridad: string | null; forzado: boolean }[]
  personas: PersonaResumen[]
  creadaPor: UsuarioResumen
}

export interface ConflictoAgenda {
  tareaId: string
  actividad: string
  inicio: string
  fin: string
}

export interface CandidatosTarea {
  tarea: TareaItem
  participaciones: {
    id: string
    nombre: string
    obligatoria: boolean
    cantidad: number
    candidatos: {
      usuario: UsuarioResumen
      rol: { codigo: string; nombre: string }
      prioridad: { nombre: string; nivel: number }
      conflictos: ConflictoAgenda[]
      /** Tareas pendientes de esa persona para ese día. */
      tareasDelDia: number
      /** Horario, días no laborables y carga de ese día. */
      disponibilidad: Disponibilidad
    }[]
  }[]
}

export interface ResultadoCompletar {
  tarea: TareaItem
  /** Se alcanzó el número de intentos sin respuesta: conviene marcarlo como perdido. */
  sugerirPerdido: boolean
  intentosSinRespuesta: number
}

export interface TarjetaSeguimiento {
  id: string
  codigo: string
  tipoTrabajo: string
  nivelAcademico: string | null
  universidad: string | null
  carrera: string | null
  titulo: string | null
  temperatura: Temperatura | null
  contactoPrincipal: PersonaResumen | null
  totalContactos: number
  intentosSinRespuesta: number
  responsable: UsuarioResumen
  etapaId: string
  proxima: {
    tareaId: string
    actividad: string
    comportamiento: Comportamiento
    fecha: string
    inicio: string | null
    estado: EstadoTarea
    vencida: boolean
    responsables: string[]
  } | null
}

export interface TableroSeguimiento {
  etapas: { id: string; nombre: string; color: string; clase: 'abierta' | 'ganada' | 'perdida'; orden: number }[]
  prospectos: TarjetaSeguimiento[]
  hoy: string
}

// ─── Agenda de reuniones (tabla por días) ───────────────────

export const enlaceReunionSchema = z.object({
  enlace: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z
      .string()
      .trim()
      .max(500, 'Máximo 500 caracteres')
      .regex(/^https?:\/\/\S+$/i, 'Debe ser un enlace que empiece con http:// o https://')
      .optional(),
  ),
})
export type EnlaceReunionDatos = z.output<typeof enlaceReunionSchema>

export const listarReunionesSchema = z.object({
  /** Primer día (por defecto, hoy). */
  desde: opcional(dia),
  /** Último día (por defecto, el mismo día). Máximo 31 días. */
  hasta: opcional(dia),
  estado: z.enum(['por_asignar', 'pendiente', 'en_proceso', 'completada', 'cancelada', 'no_asistio', 'en_pausa']).optional(),
  /** La asistente administrativa que sigue al cliente. */
  responsableId: z.uuid().optional(),
  actividadId: z.uuid().optional(),
})
export type ListarReunionesConsulta = z.output<typeof listarReunionesSchema>
export type ListarReunionesFiltros = Partial<ListarReunionesConsulta>

/** Una reunión de la tabla por días, con los datos del cliente y de quienes participan. */
export interface ReunionFila {
  tarea: TareaItem
  /** Nombre y celular del contacto (del prospecto o, en un trabajo, del titular). */
  cliente: PersonaResumen | null
  nivelAcademico: string | null
  carrera: string | null
  universidad: string | null
  enlace: string | null
  jefe: UsuarioResumen | null
  auxiliar: UsuarioResumen | null
  /** La asistente administrativa que sigue al cliente. */
  asistente: UsuarioResumen | null
  condicion: 'potencial_cliente' | 'cliente'
  /** Por qué se canceló (o no asistió). */
  motivo: string | null
}
