import { z } from 'zod'
import type { UsuarioResumen } from './prospectos.js'
import type { Comportamiento, EstadoTarea } from './tareas.js'

export const ESTADOS_ENTREGABLE = ['pendiente', 'en_proceso', 'en_revision', 'observado', 'aprobado', 'entregado', 'observado_cliente', 'cerrado'] as const
export type EstadoEntregable = (typeof ESTADOS_ENTREGABLE)[number]
export const NOMBRE_ESTADO_ENTREGABLE: Record<EstadoEntregable, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  en_revision: 'En revisión',
  observado: 'Observado',
  aprobado: 'Aprobado',
  entregado: 'Entregado',
  observado_cliente: 'Observado por el cliente',
  cerrado: 'Cerrado',
}

export const CANALES_ENTREGA = ['whatsapp', 'correo', 'presencial', 'otro'] as const
export type CanalEntrega = (typeof CANALES_ENTREGA)[number]
export const NOMBRE_CANAL_ENTREGA: Record<CanalEntrega, string> = { whatsapp: 'WhatsApp', correo: 'Correo', presencial: 'Presencial', otro: 'Otro' }

/**
 * Holgura de una tarea o entregable: días entre el fin planificado y la fecha límite.
 * verde: cómoda · ambar: justa (0 o 1 día) · rojo: no llega · sin_plan: no entra en el horizonte de la cola.
 */
export type Semaforo = 'verde' | 'ambar' | 'rojo' | 'sin_plan'

// ─── Esquemas ───────────────────────────────────────────────

const opcional = <T extends z.ZodType>(esquema: T) => z.preprocess((v) => (v === '' || v === null ? undefined : v), esquema.optional())
const dia = z.iso.date('Fecha no válida')
const texto = (max: number) =>
  opcional(
    z
      .string()
      .trim()
      .max(max, `Máximo ${max} caracteres`)
      .transform((v) => v || undefined),
  )
const porcentaje = opcional(z.coerce.number('Número no válido').min(0, 'Entre 0 y 100').max(100, 'Entre 0 y 100'))

export const entregableSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre').max(120),
  fechaLimite: z.string().min(1, 'Elige la fecha límite').pipe(dia),
  esFinal: z.boolean().default(false),
})
export type EntregableFormulario = z.input<typeof entregableSchema>
export type EntregableDatos = z.output<typeof entregableSchema>

export const tareaEntregableSchema = z.object({
  actividadId: z.string().min(1, 'Elige la actividad').pipe(z.uuid()),
  titulo: z.string().trim().min(1, 'Describe la tarea').max(150),
  minutosEstimados: z.coerce.number('Indica el tiempo').int().min(15, 'Mínimo 15 minutos').max(60 * 200, 'Máximo 200 horas'),
  /** Por defecto, el auxiliar principal (o el jefe responsable, en revisiones). */
  usuarioId: opcional(z.uuid()),
  /** La tarea no empieza antes de este día (por defecto, hoy). */
  noAntesDe: opcional(dia),
})
export type TareaEntregableFormulario = z.input<typeof tareaEntregableSchema>
export type TareaEntregableDatos = z.output<typeof tareaEntregableSchema>

export const revisarEntregableSchema = z
  .object({
    resultado: z.enum(['aprobado', 'observado']),
    observaciones: texto(3000),
    similitud: porcentaje,
    ia: porcentaje,
    /** Tiempo estimado de la corrección (si se observa). */
    minutosCorreccion: opcional(z.coerce.number().int().min(15).max(60 * 100)),
  })
  .refine((r) => r.resultado === 'aprobado' || Boolean(r.observaciones), { message: 'Escribe las observaciones', path: ['observaciones'] })
export type RevisarEntregableFormulario = z.input<typeof revisarEntregableSchema>
export type RevisarEntregableDatos = z.output<typeof revisarEntregableSchema>

export const entregarSchema = z.object({ canal: z.enum(CANALES_ENTREGA).default('whatsapp'), notas: texto(1000) })
export type EntregarFormulario = z.input<typeof entregarSchema>
export type EntregarDatos = z.output<typeof entregarSchema>

export const respuestaClienteSchema = z
  .object({ conforme: z.boolean(), observaciones: texto(3000), minutosCorreccion: opcional(z.coerce.number().int().min(15).max(60 * 100)) })
  .refine((r) => r.conforme || Boolean(r.observaciones), { message: 'Escribe lo que observó el cliente', path: ['observaciones'] })
export type RespuestaClienteFormulario = z.input<typeof respuestaClienteSchema>
export type RespuestaClienteDatos = z.output<typeof respuestaClienteSchema>

export const ordenColaSchema = z.object({ tareaIds: z.array(z.uuid()).min(1) })

export const bandejaEntregablesSchema = z.object({
  vista: z.enum(['revision', 'por_entregar', 'con_cliente', 'activos']).default('activos'),
})
export type VistaBandeja = z.output<typeof bandejaEntregablesSchema>['vista']

// ─── Respuestas ─────────────────────────────────────────────

/** Inicio y fin planificados (instantes ISO) de una tarea en la cola. */
export interface PlanTarea {
  inicio: string
  fin: string
}

export interface TareaDeEntregable {
  id: string
  titulo: string | null
  actividad: { id: string; nombre: string; comportamiento: Comportamiento; color: string }
  estado: EstadoTarea
  minutos: number
  responsable: UsuarioResumen | null
  plan: PlanTarea | null
  holguraDias: number | null
  semaforo: Semaforo | null
  notas: string | null
}

export interface RevisionItem {
  id: string
  resultado: 'aprobado' | 'observado'
  observaciones: string | null
  similitud: number | null
  ia: number | null
  revisor: UsuarioResumen
  fecha: string
}

export interface EntregaItem {
  id: string
  fecha: string
  canal: string
  notas: string | null
  enviadoPor: UsuarioResumen
  respuesta: 'pendiente' | 'conforme' | 'observado'
  observacionesCliente: string | null
  respondidoEn: string | null
}

export interface EntregableItem {
  id: string
  nombre: string
  orden: number
  esFinal: boolean
  fechaLimite: string
  estado: EstadoEntregable
  similitud: number | null
  ia: number | null
  tareas: TareaDeEntregable[]
  revisiones: RevisionItem[]
  entregas: EntregaItem[]
  /** Fin planificado de la última tarea activa y su semáforo respecto de la fecha límite. */
  finPlan: string | null
  semaforo: Semaforo | null
}

export interface ColaItem {
  tareaId: string
  orden: number
  titulo: string | null
  actividad: { nombre: string; comportamiento: Comportamiento; color: string }
  estado: EstadoTarea
  minutos: number
  /** Minutos reales de los tramos cerrados (la cola planifica solo lo que falta). */
  minutosReales: number
  /** Si la persona tiene el cronómetro corriendo en esta tarea, desde cuándo. */
  enCursoDesde: string | null
  trabajo: { id: string; codigo: string; titulo: string | null; prioridad: { nombre: string; color: string } }
  entregable: { id: string; nombre: string } | null
  /** Fecha límite del entregable (o del trabajo). */
  fechaLimite: string
  noAntesDe: string
  plan: PlanTarea | null
  holguraDias: number | null
  semaforo: Semaforo
}

export interface ColaPersona {
  usuario: UsuarioResumen
  roles: string[]
  items: ColaItem[]
  minutosPendientes: number
  /** Cuándo termina la última tarea de la cola. */
  finCola: string | null
  enRojo: number
}

export interface BandejaEntregable {
  id: string
  nombre: string
  esFinal: boolean
  fechaLimite: string
  estado: EstadoEntregable
  trabajo: { id: string; codigo: string; titulo: string | null; prioridad: { nombre: string; color: string } }
  auxiliarPrincipal: UsuarioResumen | null
  jefeResponsable: UsuarioResumen | null
  ultimaRevision: RevisionItem | null
  ultimaEntrega: EntregaItem | null
  finPlan: string | null
  semaforo: Semaforo | null
}
