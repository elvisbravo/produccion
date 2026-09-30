import { z } from 'zod'
import { normalizarCelular } from './celular.js'
import { programarTareaSchema, type TareaItem } from './tareas.js'

export const TIPOS_DOCUMENTO = ['DNI', 'CE', 'PASAPORTE'] as const
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]
export const NOMBRE_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  DNI: 'DNI',
  CE: 'Carné de extranjería',
  PASAPORTE: 'Pasaporte',
}

export const TEMPERATURAS = ['caliente', 'tibio', 'frio'] as const
export type Temperatura = (typeof TEMPERATURAS)[number]
export const NOMBRE_TEMPERATURA: Record<Temperatura, string> = { caliente: 'Caliente', tibio: 'Tibio', frio: 'Frío' }

const FORMATO_DOCUMENTO: Record<TipoDocumento, { patron: RegExp; mensaje: string }> = {
  DNI: { patron: /^\d{8}$/, mensaje: 'El DNI debe tener 8 dígitos' },
  CE: { patron: /^[A-Z0-9]{8,12}$/, mensaje: 'El carné de extranjería debe tener de 8 a 12 caracteres' },
  PASAPORTE: { patron: /^[A-Z0-9]{6,12}$/, mensaje: 'El pasaporte debe tener de 6 a 12 caracteres' },
}

/** Texto opcional: recorta espacios y convierte "" en undefined. */
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : undefined))

const idOpcional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.uuid().optional())

const idRequerido = (mensaje: string) => z.string({ error: mensaje }).min(1, mensaje).pipe(z.uuid(mensaje))

export const contactoSchema = z
  .object({
    celular: z
      .string()
      .trim()
      .min(1, 'El celular es obligatorio')
      .transform((v, ctx) => {
        const normalizado = normalizarCelular(v)
        if (!normalizado) {
          ctx.addIssue({ code: 'custom', message: 'Celular no válido (ej. 987 654 321 o +51 987 654 321)' })
          return z.NEVER
        }
        return normalizado
      }),
    nombres: textoOpcional(100),
    apellidos: textoOpcional(100),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .optional()
      .transform((v) => (v ? v : undefined))
      .pipe(z.email('Correo no válido').max(150).optional()),
    tipoDocumento: z
      .enum(TIPOS_DOCUMENTO)
      .or(z.literal(''))
      .optional()
      .transform((v) => (v ? v : undefined)),
    numeroDocumento: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .transform((v) => (v ? v : undefined)),
    esPrincipal: z.boolean().default(false),
  })
  .superRefine((c, ctx) => {
    if (c.tipoDocumento && !c.numeroDocumento) {
      ctx.addIssue({ code: 'custom', path: ['numeroDocumento'], message: 'Ingresa el número de documento' })
    } else if (!c.tipoDocumento && c.numeroDocumento) {
      ctx.addIssue({ code: 'custom', path: ['tipoDocumento'], message: 'Elige el tipo de documento' })
    } else if (c.tipoDocumento && c.numeroDocumento && !FORMATO_DOCUMENTO[c.tipoDocumento].patron.test(c.numeroDocumento)) {
      ctx.addIssue({ code: 'custom', path: ['numeroDocumento'], message: FORMATO_DOCUMENTO[c.tipoDocumento].mensaje })
    }
  })

export const MAX_CONTACTOS = 5

export const prospectoSchema = z
  .object({
    contactos: z.array(contactoSchema).min(1, 'Agrega al menos un contacto').max(MAX_CONTACTOS, `Máximo ${MAX_CONTACTOS} contactos`),
    tipoTrabajoId: idRequerido('Elige el tipo de trabajo'),
    prioridadId: idRequerido('Elige la prioridad'),
    origenId: idRequerido('Elige el origen del contacto'),
    nivelAcademicoId: idOpcional,
    universidadId: idOpcional,
    carreraId: idOpcional,
    referidoPorId: idOpcional,
    titulo: textoOpcional(300),
    fechaEntregaTentativa: z
      .string()
      .optional()
      .transform((v) => (v ? v : undefined))
      .pipe(z.iso.date('Fecha no válida').optional()),
    linkDrive: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : undefined))
      .pipe(z.url({ protocol: /^https?$/, error: 'Enlace no válido (debe empezar con https://)' }).max(500).optional()),
    observaciones: textoOpcional(1000),
    detalles: textoOpcional(5000),
    temperatura: z
      .enum(TEMPERATURAS)
      .or(z.literal(''))
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .superRefine((p, ctx) => {
    const principales = p.contactos.filter((c) => c.esPrincipal).length
    if (principales !== 1) {
      ctx.addIssue({ code: 'custom', path: ['contactos'], message: 'Marca un contacto como principal' })
    }
    const vistos = new Map<string, number>()
    p.contactos.forEach((c, i) => {
      if (vistos.has(c.celular)) {
        ctx.addIssue({ code: 'custom', path: ['contactos', i, 'celular'], message: 'Este celular ya está en otro contacto' })
      }
      vistos.set(c.celular, i)
    })
  })

/** Alta: además de los datos, opcionalmente la primera actividad (p. ej. el enfoque). */
export const crearProspectoSchema = prospectoSchema.safeExtend({
  primeraActividad: programarTareaSchema.omit({ responsables: true, personaIds: true }).optional(),
})
export type CrearProspectoFormulario = z.input<typeof crearProspectoSchema>
export type CrearProspectoDatos = z.output<typeof crearProspectoSchema>

/** Valores del formulario (lo que se escribe). */
export type ProspectoFormulario = z.input<typeof prospectoSchema>
/** Datos ya validados y normalizados (lo que recibe la API). */
export type ProspectoDatos = z.output<typeof prospectoSchema>
export type ContactoDatos = z.output<typeof contactoSchema>

export const listarProspectosSchema = z.object({
  q: z.string().trim().max(100).optional(),
  etapaId: z.uuid().optional(),
  temperatura: z.enum(TEMPERATURAS).optional(),
  tipoTrabajoId: z.uuid().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(5).max(100).default(20),
})
/** Filtros tal como se envían (la página y el tamaño son opcionales). */
export type ListarProspectosFiltros = Partial<z.output<typeof listarProspectosSchema>>
/** Filtros ya validados, con valores por defecto aplicados. */
export type ListarProspectosConsulta = z.output<typeof listarProspectosSchema>

export const nuevoCatalogoSchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres').max(200),
})

// ─── Respuestas de la API ───────────────────────────────────

export interface Opcion {
  id: string
  nombre: string
}

export interface CatalogosProspecto {
  tiposTrabajo: (Opcion & { maxIntegrantes: number })[]
  prioridades: (Opcion & { nivel: number; color: string; porDefecto: boolean })[]
  nivelesAcademicos: Opcion[]
  origenes: (Opcion & { esReferido: boolean })[]
  etapas: (Opcion & { color: string; clase: 'abierta' | 'ganada' | 'perdida'; orden: number; inicial: boolean })[]
  resultadosContacto: (Opcion & { cuentaSinRespuesta: boolean })[]
  motivosPerdida: Opcion[]
}

export interface PersonaResumen {
  id: string
  celular: string
  nombres: string | null
  apellidos: string | null
  email: string | null
  tipoDocumento: TipoDocumento | null
  numeroDocumento: string | null
}

/** Resultado de buscar una persona por celular para detectar duplicados. */
export interface CoincidenciaPersona {
  persona: PersonaResumen
  prospectos: { id: string; codigo: string; etapa: string; abierto: boolean; tipoTrabajo: string }[]
}

export interface UsuarioResumen {
  id: string
  nombres: string
  apellidos: string
}

export interface ProspectoListadoItem {
  id: string
  codigo: string
  titulo: string | null
  tipoTrabajo: string
  nivelAcademico: string | null
  universidad: string | null
  carrera: string | null
  etapa: { id: string; nombre: string; color: string; clase: 'abierta' | 'ganada' | 'perdida' }
  prioridad: { nombre: string; color: string }
  temperatura: Temperatura | null
  contactoPrincipal: PersonaResumen | null
  totalContactos: number
  responsable: UsuarioResumen
  creadoEn: string
}

export interface Paginado<T> {
  datos: T[]
  total: number
  pagina: number
  porPagina: number
}

export interface ProspectoEventoItem {
  id: string
  tipo: 'creado' | 'editado' | 'cambio_etapa' | 'nota' | 'contacto' | 'reasignado' | 'tarea'
  detalle: string
  usuario: UsuarioResumen | null
  fecha: string
}

export interface ProspectoDetalle {
  id: string
  codigo: string
  titulo: string | null
  tipoTrabajo: Opcion
  prioridad: Opcion & { color: string }
  nivelAcademico: Opcion | null
  universidad: Opcion | null
  carrera: Opcion | null
  origen: Opcion
  referidoPor: PersonaResumen | null
  fechaEntregaTentativa: string | null
  linkDrive: string | null
  observaciones: string | null
  detalles: string | null
  etapa: { id: string; nombre: string; color: string; clase: 'abierta' | 'ganada' | 'perdida' }
  temperatura: Temperatura | null
  contactos: (PersonaResumen & { esPrincipal: boolean })[]
  captadoPor: UsuarioResumen
  responsable: UsuarioResumen
  creadoEn: string
  actualizadoEn: string
  eventos: ProspectoEventoItem[]
  /** Actividades del prospecto: primero las pendientes. */
  tareas: TareaItem[]
}
