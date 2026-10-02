import { z } from 'zod'
import type { Alcance } from './permisos.js'
import type { FuncionEquipo } from './trabajos.js'
import { TIPOS_DOCUMENTO, validarDocumento, type TipoDocumento, type UsuarioResumen } from './prospectos.js'

// ─── Parámetros configurables ───────────────────────────────

export interface DefinicionParametro {
  grupo: string
  nombre: string
  descripcion: string
  unidad: string
  /** Valor por defecto (null = sin valor, p. ej. "sin tope"). */
  porDefecto: number | null
  min: number
  max: number
  /** Admite quedar vacío. */
  opcional?: boolean
}

export const PARAMETROS = {
  'seguridad.intentos_login_max': {
    grupo: 'Seguridad',
    nombre: 'Intentos de ingreso',
    descripcion: 'Intentos fallidos antes de bloquear la cuenta',
    unidad: 'intentos',
    porDefecto: 5,
    min: 3,
    max: 20,
  },
  'seguridad.bloqueo_minutos': {
    grupo: 'Seguridad',
    nombre: 'Duración del bloqueo',
    descripcion: 'Minutos que dura el bloqueo por intentos fallidos',
    unidad: 'min',
    porDefecto: 15,
    min: 1,
    max: 1440,
  },
  'seguridad.inactividad_minutos': {
    grupo: 'Seguridad',
    nombre: 'Cierre por inactividad',
    descripcion: 'Minutos sin actividad antes de cerrar la sesión',
    unidad: 'min',
    porDefecto: 30,
    min: 5,
    max: 480,
  },
  'prospectos.intentos_sin_respuesta': {
    grupo: 'Comercial',
    nombre: 'Intentos sin respuesta',
    descripcion: 'Seguimientos sin respuesta antes de sugerir marcar el prospecto como perdido',
    unidad: 'intentos',
    porDefecto: 3,
    min: 1,
    max: 20,
  },
  'notificaciones.minutos_aviso_reunion': {
    grupo: 'Avisos',
    nombre: 'Aviso antes de una reunión',
    descripcion: 'Con cuánta anticipación se recuerda una reunión a sus responsables',
    unidad: 'min',
    porDefecto: 15,
    min: 5,
    max: 240,
  },
  'notificaciones.dias_aviso_vencimiento': {
    grupo: 'Avisos',
    nombre: 'Aviso de vencimiento',
    descripcion: 'Días antes de que venza un entregable o una cuota para avisar',
    unidad: 'días',
    porDefecto: 3,
    min: 1,
    max: 30,
  },
  'pausas.dias_recordatorio': {
    grupo: 'Avisos',
    nombre: 'Recordar un trabajo en espera',
    descripcion: 'Cada cuántos días se recuerda que un trabajo sigue detenido porque falta información del cliente',
    unidad: 'días',
    porDefecto: 3,
    min: 1,
    max: 30,
  },
  'turnitin.obligatorio': {
    grupo: 'Turnitin',
    nombre: 'Turnitin obligatorio',
    descripcion: '1 = un entregable aprobado debe pasar por Turnitin (o que se omita con motivo) antes de entregarse al cliente; 0 = es opcional',
    unidad: '1 = sí, 0 = no',
    porDefecto: 1,
    min: 0,
    max: 1,
  },
  'turnitin.similitud_max': {
    grupo: 'Turnitin',
    nombre: 'Similitud máxima aceptada',
    descripcion: 'Si la similitud pasa de este porcentaje, el entregable vuelve a corrección. 100 = sin límite (solo se registra)',
    unidad: '%',
    porDefecto: 100,
    min: 0,
    max: 100,
  },
  'turnitin.ia_max': {
    grupo: 'Turnitin',
    nombre: 'Detección de IA máxima aceptada',
    descripcion: 'Si la detección de IA pasa de este porcentaje, el entregable vuelve a corrección. 100 = sin límite (solo se registra)',
    unidad: '%',
    porDefecto: 100,
    min: 0,
    max: 100,
  },
  'horas_extra.recargo': {
    grupo: 'Horas extra',
    nombre: 'Recargo en el costo',
    descripcion: 'Porcentaje que se suma al costo por hora de las horas extra al calcular la rentabilidad (en Perú suele ser 25 %). 0 = cuestan igual que una hora normal. No calcula pagos',
    unidad: '%',
    porDefecto: 25,
    min: 0,
    max: 200,
  },
  'horas_extra.tope_semanal': {
    grupo: 'Horas extra',
    nombre: 'Tope semanal',
    descripcion: 'Horas extra por persona a la semana; al superarlo, el sistema avisa. Vacío = sin tope',
    unidad: 'h',
    porDefecto: null,
    min: 0,
    max: 80,
    opcional: true,
  },
  'horas_extra.tope_mensual': {
    grupo: 'Horas extra',
    nombre: 'Tope mensual',
    descripcion: 'Horas extra por persona al mes; al superarlo, el sistema avisa. Vacío = sin tope',
    unidad: 'h',
    porDefecto: null,
    min: 0,
    max: 300,
    opcional: true,
  },
} as const satisfies Record<string, DefinicionParametro>

export type ClaveParametro = keyof typeof PARAMETROS

export interface ParametroItem extends DefinicionParametro {
  clave: ClaveParametro
  valor: number | null
}

export const guardarParametrosSchema = z.object({
  valores: z.record(z.string(), z.number().nullable()),
})

// ─── Contraseñas ────────────────────────────────────────────

export const MIN_CLAVE = 10

/** Política de contraseñas: al menos 10 caracteres, con letras y números. */
export const claveSchema = z
  .string()
  .min(MIN_CLAVE, `Usa al menos ${MIN_CLAVE} caracteres`)
  .max(128, 'Máximo 128 caracteres')
  .refine((v) => /[a-záéíóúñ]/i.test(v) && /\d/.test(v), 'Combina letras y números')

export const cambiarClaveSchema = z
  .object({
    actual: z.string().min(1, 'Ingresa tu contraseña actual'),
    nueva: claveSchema,
    confirmacion: z.string(),
  })
  .refine((d) => d.nueva === d.confirmacion, { message: 'No coincide con la nueva contraseña', path: ['confirmacion'] })
  .refine((d) => d.nueva !== d.actual, { message: 'Debe ser distinta de la actual', path: ['nueva'] })
export type CambiarClaveFormulario = z.input<typeof cambiarClaveSchema>

// ─── Usuarios ───────────────────────────────────────────────

const opcional = <T extends z.ZodType>(esquema: T) => z.preprocess((v) => (v === '' || v === null ? undefined : v), esquema.optional())

const datosUsuario = {
  nombres: z.string().trim().min(1, 'Escribe los nombres').max(100),
  apellidos: z.string().trim().min(1, 'Escribe los apellidos').max(100),
  email: z.email('Correo no válido').trim().toLowerCase().max(150),
  celular: opcional(z.string().trim().max(20)),
  fechaNacimiento: opcional(z.iso.date('Fecha no válida')),
  /** Obligatorio: identifica a la persona (y evita registrarla dos veces). */
  tipoDocumento: z.enum(TIPOS_DOCUMENTO, 'Elige el tipo de documento'),
  numeroDocumento: z.string().trim().toUpperCase().min(1, 'Ingresa el número de documento').max(20, 'Máximo 20 caracteres'),
}

export const crearUsuarioSchema = z
  .object({
    ...datosUsuario,
    rolIds: z.array(z.uuid()).min(1, 'Asigna al menos un rol'),
    /** Si se deja vacía, el sistema genera una contraseña temporal. */
    clave: opcional(claveSchema),
  })
  .superRefine(validarDocumento)
export type CrearUsuarioFormulario = z.input<typeof crearUsuarioSchema>
export type CrearUsuarioDatos = z.output<typeof crearUsuarioSchema>

export const editarUsuarioSchema = z.object(datosUsuario).superRefine(validarDocumento)
export type EditarUsuarioFormulario = z.input<typeof editarUsuarioSchema>
export type EditarUsuarioDatos = z.output<typeof editarUsuarioSchema>

export const rolesUsuarioSchema = z.object({ rolIds: z.array(z.uuid()).min(1, 'Debe tener al menos un rol') })

export const excepcionPermisoSchema = z.object({
  permiso: z.string().regex(/^[a-z_]+\.[a-z_]+$/, 'Permiso no válido'),
  tipo: z.enum(['conceder', 'denegar']),
  alcance: z.enum(['propios', 'equipo', 'todos']).nullable().optional(),
  motivo: z.string().trim().min(3, 'Explica el motivo').max(300),
})
export type ExcepcionPermisoDatos = z.output<typeof excepcionPermisoSchema>

export const topesUsuarioSchema = z.object({
  semanal: z.number().min(0).max(80).nullable(),
  mensual: z.number().min(0).max(300).nullable(),
})
export type TopesUsuario = z.output<typeof topesUsuarioSchema>

export const listarUsuariosSchema = z.object({
  q: z.string().trim().max(100).optional(),
  rol: z.string().max(40).optional(),
  estado: z.enum(['activos', 'inactivos', 'todos']).default('activos'),
})
export type ListarUsuariosFiltros = Partial<z.input<typeof listarUsuariosSchema>>

export interface UsuarioListadoItem {
  id: string
  nombres: string
  apellidos: string
  email: string
  celular: string | null
  /** Vacío en los usuarios anteriores a este dato, hasta que se editen. */
  tipoDocumento: TipoDocumento | null
  numeroDocumento: string | null
  activo: boolean
  bloqueado: boolean
  roles: { id: string; codigo: string; nombre: string }[]
  ultimoAcceso: string | null
}

export type OrigenPermiso = 'admin' | 'rol' | 'concedido'

export interface PermisoEfectivoItem {
  permiso: string
  alcance: Alcance | null
  origen: OrigenPermiso
  /** Roles que lo dan (si viene de roles). */
  roles: string[]
}

export interface ExcepcionItem {
  id: string
  permiso: string
  tipo: 'conceder' | 'denegar'
  alcance: Alcance | null
  motivo: string | null
  otorgadoPor: UsuarioResumen | null
  fecha: string
}

export interface AccesoItem {
  fecha: string
  resultado: 'exito' | 'fallo' | 'bloqueado'
  ip: string | null
  dispositivo: string | null
}

export interface UsuarioDetalle extends UsuarioListadoItem {
  fechaNacimiento: string | null
  debeCambiarClave: boolean
  bloqueadoHasta: string | null
  efectivos: PermisoEfectivoItem[]
  excepciones: ExcepcionItem[]
  topes: TopesUsuario
  accesos: AccesoItem[]
}

/** Lo que una persona deja a su nombre: se muestra antes de desactivarla, para reasignarlo. */
export interface PendientesUsuario {
  tareas: {
    total: number
    /** En su cola de trabajo (sin hora fija). */
    enCola: number
    /** Con día y hora (reuniones, enfoques). */
    conHora: number
  }
  /** Trabajos activos en los que está en el equipo. */
  trabajos: { id: string; codigo: string; titulo: string | null; funcion: FuncionEquipo }[]
  /** Prospectos abiertos a su cargo. */
  prospectos: number
  total: number
}

/** Respuesta al crear un usuario o restablecer su contraseña: la temporal se muestra una sola vez. */
export interface ClaveTemporal {
  usuario: UsuarioDetalle
  claveTemporal: string | null
}

// ─── Roles ──────────────────────────────────────────────────

export const rolSchema = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre').max(80),
  descripcion: opcional(z.string().trim().max(300)),
  activo: z.boolean().default(true),
})
export type RolFormulario = z.input<typeof rolSchema>
export type RolDatos = z.output<typeof rolSchema>

export const matrizRolSchema = z.object({
  permisos: z.array(z.object({ permiso: z.string().regex(/^[a-z_]+\.[a-z_]+$/), alcance: z.enum(['propios', 'equipo', 'todos']).nullable() })),
})
export type MatrizRolDatos = z.output<typeof matrizRolSchema>

export interface RolItem {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  esSistema: boolean
  activo: boolean
  usuarios: number
  permisos: number
}

export interface RolDetalle extends RolItem {
  /** El administrador tiene siempre todos los permisos: su matriz no se edita. */
  esAdministrador: boolean
  matriz: { permiso: string; alcance: Alcance | null }[]
}

// ─── Auditoría ──────────────────────────────────────────────

export const listarAuditoriaSchema = z.object({
  entidad: z.string().max(60).optional(),
  usuarioId: z.uuid().optional(),
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
})
export type ListarAuditoriaFiltros = Partial<z.input<typeof listarAuditoriaSchema>>

export interface AuditoriaItem {
  id: string
  fecha: string
  usuario: UsuarioResumen | null
  accion: string
  entidad: string
  entidadId: string | null
  antes: unknown
  despues: unknown
  ip: string | null
}

// ─── En vivo ────────────────────────────────────────────────

/** Cambiaron los roles o permisos del usuario: la web vuelve a pedir su sesión. */
export const EVENTO_SESION_ACTUALIZADA = 'sesion_actualizada'
/** El usuario fue desactivado: la web cierra la sesión. */
export const EVENTO_SESION_CERRADA = 'sesion_cerrada'
