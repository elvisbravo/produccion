import { z } from 'zod'
import type { Comportamiento } from './tareas.js'

export const MODOS_ASIGNACION = ['creador', 'directa', 'coordinada', 'responsable_trabajo'] as const
export const NOMBRE_MODO_ASIGNACION: Record<(typeof MODOS_ASIGNACION)[number], string> = {
  creador: 'A quien la crea',
  directa: 'Quien la crea elige al responsable',
  coordinada: 'Queda por asignar al coordinador',
  responsable_trabajo: 'Al auxiliar principal del trabajo',
}
export const DESCRIPCION_MODO_ASIGNACION: Record<(typeof MODOS_ASIGNACION)[number], string> = {
  creador: 'La tarea queda a nombre de quien la programa.',
  directa: 'Quien programa la tarea elige a la persona (entre quienes tienen alguno de los roles de la actividad).',
  coordinada: 'Queda «por asignar» en la bandeja del rol coordinador, que elige a la persona.',
  responsable_trabajo: 'Para actividades de clientes: va al auxiliar principal del trabajo.',
}

export const APLICA_A = ['prospecto', 'cliente', 'ambos'] as const
export const NOMBRE_APLICA_A: Record<(typeof APLICA_A)[number], string> = { prospecto: 'Prospectos', cliente: 'Clientes (trabajos)', ambos: 'Prospectos y clientes' }

const rolDeParticipacionSchema = z.object({ rolId: z.uuid('Elige el rol'), prioridadRolId: z.uuid('Elige la prioridad') })

const participacionSchema = z.object({
  /** Nulo si es nueva; si existe, se conserva (las tareas ya programadas la referencian). */
  id: z.uuid().nullish(),
  nombre: z.string().trim().min(1, 'Escribe el nombre').max(80, 'Máximo 80 caracteres'),
  cantidad: z.coerce.number('Número no válido').int('Número entero').min(1, 'Mínimo 1').max(10, 'Máximo 10'),
  obligatoria: z.boolean().default(true),
  roles: z.array(rolDeParticipacionSchema).min(1, 'Elige al menos un rol'),
})

export const actividadSchema = z
  .object({
    nombre: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100, 'Máximo 100 caracteres'),
    tipoActividadId: z.uuid('Elige el tipo'),
    minutosEstimados: z.coerce.number('Indica el tiempo').int('Número entero').min(5, 'Mínimo 5 minutos').max(60 * 24, 'Máximo 24 horas'),
    aplicaA: z.enum(APLICA_A),
    modoAsignacion: z.enum(MODOS_ASIGNACION),
    requiereHoraFija: z.boolean().default(false),
    esSeguimiento: z.boolean().default(false),
    rolCoordinadorId: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.uuid().optional()),
    participaciones: z.array(participacionSchema).min(1, 'Agrega al menos una participación'),
  })
  .refine((a) => a.modoAsignacion !== 'coordinada' || Boolean(a.rolCoordinadorId), { message: 'Elige el rol coordinador', path: ['rolCoordinadorId'] })
export type ActividadFormulario = z.input<typeof actividadSchema>
export type ActividadDatos = z.output<typeof actividadSchema>

export interface ActividadAdmin {
  id: string
  nombre: string
  tipo: { id: string; nombre: string; comportamiento: Comportamiento; color: string }
  minutosEstimados: number
  aplicaA: (typeof APLICA_A)[number]
  modoAsignacion: (typeof MODOS_ASIGNACION)[number]
  requiereHoraFija: boolean
  esSeguimiento: boolean
  rolCoordinadorId: string | null
  activa: boolean
  /** El sistema la busca por su nombre (revisión, corrección…): no se renombra ni se desactiva. */
  deSistema: boolean
  /** Cuántas tareas la usan. */
  tareas: number
  participaciones: {
    id: string
    nombre: string
    cantidad: number
    obligatoria: boolean
    roles: { rolId: string; rol: string; prioridadRolId: string; prioridad: { nombre: string; nivel: number } }[]
  }[]
}

export interface CatalogoActividades {
  actividades: ActividadAdmin[]
  tipos: { id: string; nombre: string; comportamiento: Comportamiento; color: string }[]
  roles: { id: string; codigo: string; nombre: string }[]
  prioridades: { id: string; nombre: string; nivel: number; color: string }[]
}
