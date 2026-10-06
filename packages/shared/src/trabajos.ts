import { z } from 'zod'
import type { EntregableItem, TurnitinConfig } from './produccion.js'
import { normalizarCelular } from './celular.js'
import { TIPOS_DOCUMENTO, validarDocumento, type Opcion, type PersonaResumen, type UsuarioResumen } from './prospectos.js'

// ─── Dinero ─────────────────────────────────────────────────

/** Los montos viajan en soles con 2 decimales; las sumas se hacen en céntimos para evitar errores de redondeo. */
export const aCentimos = (monto: number) => Math.round(monto * 100)
export const deCentimos = (centimos: number) => centimos / 100

const formatoSoles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 })
export const formatearSoles = (monto: number) => formatoSoles.format(monto)

const monto = (mensaje = 'Ingresa un monto mayor a 0') =>
  z.coerce
    .number({ error: mensaje })
    .positive(mensaje)
    .max(9_999_999, 'Monto demasiado alto')
    .refine((v) => Math.abs(aCentimos(v) - v * 100) < 1e-6, 'Máximo 2 decimales')

const dia = z.iso.date('Fecha no válida')
const opcional = <T extends z.ZodType>(esquema: T) => z.preprocess((v) => (v === '' || v === null ? undefined : v), esquema.optional())
const texto = (max: number) => opcional(z.string().trim().max(max, `Máximo ${max} caracteres`).transform((v) => v || undefined))

// ─── Estados y catálogos fijos ─────────────────────────────

export const ESTADOS_TRABAJO = ['sin_asignar', 'asignado', 'en_proceso', 'finalizado', 'suspendido', 'cancelado'] as const
export type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number]
export const NOMBRE_ESTADO_TRABAJO: Record<EstadoTrabajo, string> = {
  sin_asignar: 'Sin asignar',
  asignado: 'Asignado',
  en_proceso: 'En proceso',
  finalizado: 'Finalizado',
  suspendido: 'Suspendido',
  cancelado: 'Cancelado',
}

export const FUNCIONES_EQUIPO = ['auxiliar_principal', 'auxiliar_apoyo', 'jefe_responsable'] as const
export type FuncionEquipo = (typeof FUNCIONES_EQUIPO)[number]
export const NOMBRE_FUNCION_EQUIPO: Record<FuncionEquipo, string> = {
  auxiliar_principal: 'Auxiliar principal',
  auxiliar_apoyo: 'Auxiliar de apoyo',
  jefe_responsable: 'Jefe responsable',
}

export const FORMAS_PAGO = ['contado', 'cuotas'] as const
export type FormaPago = (typeof FORMAS_PAGO)[number]

export const METODOS_PAGO = ['efectivo', 'transferencia', 'deposito', 'yape', 'plin', 'tarjeta', 'otro'] as const
export type MetodoPago = (typeof METODOS_PAGO)[number]
export const NOMBRE_METODO_PAGO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  deposito: 'Depósito',
  yape: 'Yape',
  plin: 'Plin',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
}

export type EstadoCuota = 'pagada' | 'parcial' | 'pendiente' | 'vencida'
export const NOMBRE_ESTADO_CUOTA: Record<EstadoCuota, string> = { pagada: 'Pagada', parcial: 'Pago parcial', pendiente: 'Pendiente', vencida: 'Vencida' }

// ─── Esquemas ───────────────────────────────────────────────

export const pagoSchema = z.object({
  monto: monto(),
  fecha: z.string().min(1, 'Elige la fecha').pipe(dia),
  metodo: z.enum(METODOS_PAGO, { error: 'Elige el método' }),
  numeroOperacion: texto(60),
  observaciones: texto(500),
})
export type PagoFormulario = z.input<typeof pagoSchema>
export type PagoDatos = z.output<typeof pagoSchema>

/** Cobro de un trabajo de proveedor: lo paga el proveedor, en uno o varios pagos. */
export const cobroSchema = z
  .object({
    montoTotal: monto('Ingresa el monto total'),
    formaPago: z.enum(FORMAS_PAGO),
    cuotas: z.array(z.object({ monto: monto(), vencimiento: z.string().min(1, 'Elige la fecha').pipe(dia) })).min(1, 'Agrega al menos un pago'),
  })
  .superRefine((c, ctx) => {
    if (c.formaPago === 'contado' && c.cuotas.length !== 1) ctx.addIssue({ code: 'custom', path: ['cuotas'], message: 'Al contado es un solo pago' })
    const suma = c.cuotas.reduce((s, x) => s + aCentimos(x.monto), 0)
    if (suma !== aCentimos(c.montoTotal)) {
      ctx.addIssue({ code: 'custom', path: ['cuotas'], message: `Los pagos suman ${formatearSoles(deCentimos(suma))} y el total es ${formatearSoles(c.montoTotal)}` })
    }
    c.cuotas.forEach((x, i) => {
      if (i > 0 && x.vencimiento < c.cuotas[i - 1].vencimiento) ctx.addIssue({ code: 'custom', path: ['cuotas', i, 'vencimiento'], message: 'Debe ser igual o posterior al pago anterior' })
    })
  })
export type CobroFormulario = z.input<typeof cobroSchema>
export type CobroDatos = z.output<typeof cobroSchema>

const idRequerido = (mensaje: string) => z.string({ error: mensaje }).min(1, mensaje).pipe(z.uuid(mensaje))

/** Registro de un trabajo que entrega un proveedor (sin prospecto ni contrato). */
export const trabajoProveedorSchema = z.object({
  proveedorId: idRequerido('Elige al proveedor'),
  tipoTrabajoId: idRequerido('Elige el tipo de trabajo'),
  titulo: z.string({ error: 'Ingresa el título' }).trim().min(3, 'Ingresa el título del trabajo').max(300, 'Máximo 300 caracteres'),
  prioridadId: idRequerido('Elige la prioridad'),
  nivelAcademicoId: idRequerido('Elige el nivel académico'),
  universidadId: idRequerido('Elige la universidad'),
  carreraId: idRequerido('Elige la carrera'),
  fechaLimite: z.string().min(1, 'Elige la fecha de entrega').pipe(dia),
  linkDrive: z
    .string({ error: 'Ingresa el enlace de Drive' })
    .trim()
    .min(1, 'Ingresa el enlace de Drive')
    .pipe(z.url({ protocol: /^https?$/, error: 'Enlace no válido (debe empezar con https://)' }).max(500)),
  observaciones: texto(5000),
  /** La única actividad del trabajo y su tiempo estimado. */
  actividadId: idRequerido('Elige la actividad'),
  minutosEstimados: z.coerce.number('Indica el tiempo estimado').int('Número entero').min(15, 'Mínimo 15 minutos').max(60 * 200, 'Máximo 200 horas'),
  /** Opcional: lo que se le cobra al proveedor. También se puede registrar después. */
  cobro: cobroSchema.optional(),
})
export type TrabajoProveedorFormulario = z.input<typeof trabajoProveedorSchema>
export type TrabajoProveedorDatos = z.output<typeof trabajoProveedorSchema>

export const integranteConversionSchema = z
  .object({
    personaId: z.uuid(),
    nombres: z.string().trim().min(1, 'Ingresa los nombres').max(100),
    apellidos: z.string().trim().min(1, 'Ingresa los apellidos').max(100),
    /** Opcional por integrante: basta con que uno de ellos tenga correo (se valida en el conjunto). */
    email: opcional(z.string().trim().toLowerCase().pipe(z.email('Correo no válido').max(150))),
    tipoDocumento: z.enum(TIPOS_DOCUMENTO, { error: 'Elige el tipo de documento' }),
    numeroDocumento: z.string({ error: 'Ingresa el número de documento' }).trim().toUpperCase().min(1, 'Ingresa el número de documento').max(20),
    esTitular: z.boolean().default(false),
  })
  .superRefine(validarDocumento)

interface ConversionBase {
  integrantes: { esTitular: boolean; email?: string }[]
  trabajo: { fechaInicio: string; fechaLimite: string }
  /** Sin contrato (cliente directo sin monto) solo se validan los integrantes y las fechas del trabajo. */
  contrato?: { montoTotal: number; formaPago: string; cuotas: { monto: number; vencimiento: string }[] }
  pagoInicial?: { monto: number }
}

/** Reglas que valen al convertir un prospecto y al registrar un cliente directo. */
function validarConversion(d: ConversionBase, ctx: z.RefinementCtx) {
  // Sin integrantes (solo un trabajo de proveedor) no hay titular ni correo que exigir.
  if (d.integrantes.length > 0) {
    const titulares = d.integrantes.filter((i) => i.esTitular).length
    if (titulares !== 1) ctx.addIssue({ code: 'custom', path: ['integrantes'], message: 'Marca a un integrante como titular' })
    if (!d.integrantes.some((i) => i.email)) {
      ctx.addIssue({ code: 'custom', path: ['integrantes'], message: 'Al menos uno de los integrantes debe tener un correo' })
    }
  }
  if (d.trabajo.fechaLimite < d.trabajo.fechaInicio) {
    ctx.addIssue({ code: 'custom', path: ['trabajo', 'fechaLimite'], message: 'Debe ser posterior a la fecha de inicio' })
  }
  if (!d.contrato) return
  const { montoTotal, cuotas, formaPago } = d.contrato
  if (formaPago === 'contado' && cuotas.length !== 1) {
    ctx.addIssue({ code: 'custom', path: ['contrato', 'cuotas'], message: 'Al contado es un solo pago' })
  }
  const suma = cuotas.reduce((s, c) => s + aCentimos(c.monto), 0)
  if (suma !== aCentimos(montoTotal)) {
    ctx.addIssue({
      code: 'custom',
      path: ['contrato', 'cuotas'],
      message: `Las cuotas suman ${formatearSoles(deCentimos(suma))} y el total es ${formatearSoles(montoTotal)}`,
    })
  }
  cuotas.forEach((c, i) => {
    if (i > 0 && c.vencimiento < cuotas[i - 1].vencimiento) {
      ctx.addIssue({ code: 'custom', path: ['contrato', 'cuotas', i, 'vencimiento'], message: 'Debe ser igual o posterior a la cuota anterior' })
    }
  })
  if (d.pagoInicial && aCentimos(d.pagoInicial.monto) > aCentimos(montoTotal)) {
    ctx.addIssue({ code: 'custom', path: ['pagoInicial', 'monto'], message: 'No puede superar el total del contrato' })
  }
}

const trabajoConversionSchema = z.object({
  titulo: texto(300),
  fechaInicio: z.string().min(1, 'Elige la fecha de inicio').pipe(dia),
  fechaLimite: z.string().min(1, 'Elige la fecha límite de entrega').pipe(dia),
  /** Se copian del prospecto, pero deben estar completos para convertirlo. */
  nivelAcademicoId: z.string({ error: 'Elige el nivel académico' }).min(1, 'Elige el nivel académico').pipe(z.uuid('Elige el nivel académico')),
  universidadId: z.string({ error: 'Elige la universidad' }).min(1, 'Elige la universidad').pipe(z.uuid('Elige la universidad')),
  carreraId: z.string({ error: 'Elige la carrera' }).min(1, 'Elige la carrera').pipe(z.uuid('Elige la carrera')),
  linkDrive: z
    .string({ error: 'Ingresa el enlace de Drive' })
    .trim()
    .min(1, 'Ingresa el enlace de Drive')
    .pipe(z.url({ protocol: /^https?$/, error: 'Enlace no válido (debe empezar con https://)' }).max(500)),
})
const contratoConversionSchema = z.object({
  fechaFirma: z.string().min(1, 'Elige la fecha de firma').pipe(dia),
  montoTotal: monto('Ingresa el monto total'),
  formaPago: z.enum(FORMAS_PAGO),
  cuotas: z.array(z.object({ monto: monto(), vencimiento: z.string().min(1, 'Elige la fecha').pipe(dia) })).min(1, 'Agrega al menos una cuota'),
  observaciones: texto(1000),
})

export const convertirProspectoSchema = z
  .object({
    integrantes: z.array(integranteConversionSchema).min(1, 'Elige al menos un integrante'),
    trabajo: trabajoConversionSchema,
    contrato: contratoConversionSchema,
    /** Pago recibido al firmar (opcional). */
    pagoInicial: pagoSchema.optional(),
  })
  .superRefine(validarConversion)
export type ConvertirProspectoFormulario = z.input<typeof convertirProspectoSchema>
export type ConvertirProspectoDatos = z.output<typeof convertirProspectoSchema>

export const armarEquipoSchema = z
  .object({
    auxiliarPrincipalId: z.string().min(1, 'Elige al auxiliar principal').pipe(z.uuid()),
    auxiliaresApoyo: z.array(z.uuid()).max(5).default([]),
    jefeResponsableId: z.string().min(1, 'Elige al jefe responsable').pipe(z.uuid()),
    motivo: texto(300),
  })
  .superRefine((d, ctx) => {
    if (d.auxiliaresApoyo.includes(d.auxiliarPrincipalId)) {
      ctx.addIssue({ code: 'custom', path: ['auxiliaresApoyo'], message: 'El auxiliar principal no puede ser también de apoyo' })
    }
    // Quien revisa debe ser otra persona que quien elabora: alguien con ambos roles puede ser jefe en un trabajo y auxiliar en otro, no las dos cosas en el mismo.
    if (d.jefeResponsableId === d.auxiliarPrincipalId || d.auxiliaresApoyo.includes(d.jefeResponsableId)) {
      ctx.addIssue({ code: 'custom', path: ['jefeResponsableId'], message: 'El jefe responsable no puede ser también auxiliar de este trabajo: quien revisa debe ser otra persona' })
    }
  })
export type ArmarEquipoFormulario = z.input<typeof armarEquipoSchema>
export type ArmarEquipoDatos = z.output<typeof armarEquipoSchema>

export const anularPagoSchema = z.object({ motivo: z.string().trim().min(3, 'Indica el motivo').max(300) })

// ─── Fechas inamovibles ─────────────────────────────────────

export const valorarTrabajoSchema = z.object({
  fechaReunion: z.string().min(1, 'Elige la fecha de la reunión').pipe(z.iso.date('Fecha no válida')),
  diasEstimados: z.coerce.number('Indica los días').int('Número entero').min(1, 'Mínimo 1 día').max(365, 'Máximo 365 días'),
  nota: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().trim().max(500, 'Máximo 500 caracteres').optional()),
})
export type ValorarTrabajoFormulario = z.input<typeof valorarTrabajoSchema>
export type ValorarTrabajoDatos = z.output<typeof valorarTrabajoSchema>

/** Lo que se estimó en una reunión y si cabe antes de la fecha límite. */
export interface ValoracionItem {
  id: string
  fechaReunion: string
  /** Días hábiles estimados. */
  diasEstimados: number
  nota: string | null
  por: UsuarioResumen
  en: string
  /** Días hábiles que quedan desde hoy hasta la fecha límite del trabajo (feriados y domingos aparte). */
  diasDisponibles: number
  /** La estimación cabe en el tiempo que queda; si no, hay que hablarlo con el cliente. */
  alcanza: boolean
}

export const fijarFechasSchema = z.object({ motivo: z.string().trim().min(3, 'Indica por qué no se pueden mover').max(300, 'Máximo 300 caracteres') })

export interface FechasFijasItem {
  motivo: string
  por: UsuarioResumen | null
  desde: string
}

// ─── Trabajo en espera del cliente ──────────────────────────

/** Mover la fecha de entrega del trabajo (con su motivo). */
export const reprogramarTrabajoSchema = z.object({
  fechaLimite: z.string().min(1, 'Elige la nueva fecha de entrega').pipe(dia),
  motivo: z.string().trim().min(3, 'Indica el motivo').max(300, 'Máximo 300 caracteres'),
})
export type ReprogramarTrabajoFormulario = z.input<typeof reprogramarTrabajoSchema>
export type ReprogramarTrabajoDatos = z.output<typeof reprogramarTrabajoSchema>

/** Datos del trabajo que se pueden corregir (las fechas se cambian con «Reprogramar entrega»). */
export const editarTrabajoSchema = z.object({
  titulo: texto(300),
  nivelAcademicoId: z.string({ error: 'Elige el nivel académico' }).min(1, 'Elige el nivel académico').pipe(z.uuid('Elige el nivel académico')),
  universidadId: z.string({ error: 'Elige la universidad' }).min(1, 'Elige la universidad').pipe(z.uuid('Elige la universidad')),
  carreraId: z.string({ error: 'Elige la carrera' }).min(1, 'Elige la carrera').pipe(z.uuid('Elige la carrera')),
  linkDrive: z
    .string({ error: 'Ingresa el enlace de Drive' })
    .trim()
    .min(1, 'Ingresa el enlace de Drive')
    .pipe(z.url({ protocol: /^https?$/, error: 'Enlace no válido (debe empezar con https://)' }).max(500)),
  observaciones: texto(5000),
  detalles: texto(5000),
})
export type EditarTrabajoFormulario = z.input<typeof editarTrabajoSchema>
export type EditarTrabajoDatos = z.output<typeof editarTrabajoSchema>

export const pausarTrabajoSchema = z.object({ motivo: z.string().trim().min(3, 'Indica qué información falta').max(500, 'Máximo 500 caracteres') })
export const reanudarTrabajoSchema = z.object({ nota: texto(500) })

export interface PausaItem {
  id: string
  /** Qué información falta. */
  motivo: string
  desde: string
  /** Días que lleva detenido. */
  dias: number
  por: UsuarioResumen
  /** Tareas que salieron de la cola. */
  tareasPausadas: number
}

// ─── Adicionales del contrato ───────────────────────────────

export const ESTADOS_ADICIONAL = ['propuesto', 'aceptado', 'rechazado', 'anulado'] as const
export type EstadoAdicional = (typeof ESTADOS_ADICIONAL)[number]
export const NOMBRE_ESTADO_ADICIONAL: Record<EstadoAdicional, string> = {
  propuesto: 'Propuesto',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  anulado: 'Anulado',
}

/** Trabajo fuera de lo acordado, con sus propias cuotas (que suman el monto). */
export const adicionalSchema = z
  .object({
    descripcion: z.string().trim().min(3, 'Describe el adicional').max(500, 'Máximo 500 caracteres'),
    monto: monto('Ingresa el monto del adicional'),
    cuotas: z
      .array(z.object({ monto: monto(), vencimiento: z.string().min(1, 'Elige la fecha').pipe(dia) }))
      .min(1, 'Agrega al menos una cuota')
      .max(12, 'Máximo 12 cuotas'),
  })
  .superRefine((d, ctx) => {
    const suma = d.cuotas.reduce((s, c) => s + aCentimos(c.monto), 0)
    if (suma !== aCentimos(d.monto)) {
      ctx.addIssue({ code: 'custom', path: ['cuotas'], message: `Las cuotas suman ${formatearSoles(deCentimos(suma))} y el adicional es ${formatearSoles(d.monto)}` })
    }
    d.cuotas.forEach((c, i) => {
      if (i > 0 && c.vencimiento < d.cuotas[i - 1].vencimiento) {
        ctx.addIssue({ code: 'custom', path: ['cuotas', i, 'vencimiento'], message: 'Debe ser igual o posterior a la cuota anterior' })
      }
    })
  })
export type AdicionalFormulario = z.input<typeof adicionalSchema>
export type AdicionalDatos = z.output<typeof adicionalSchema>

export const motivoAdicionalSchema = z.object({ motivo: z.string().trim().min(3, 'Indica el motivo').max(300) })

export interface AdicionalItem {
  id: string
  numero: number
  descripcion: string
  monto: number
  estado: EstadoAdicional
  /** Las propuestas; una vez aceptado, son las cuotas del contrato con número. */
  cuotas: { numero: number | null; monto: number; vencimiento: string }[]
  propuestoPor: UsuarioResumen
  propuestoEn: string
  respondido: { por: UsuarioResumen | null; en: string } | null
  motivo: string | null
  /** Aceptado y con pagos aplicados: ya no se puede anular. */
  conPagos: boolean
}

// ─── Seguimiento: el estado de un trabajo con los colores que usa el equipo ───

/**
 * Cómo se ve un trabajo de un vistazo (la leyenda de colores del equipo). Se calcula con lo que ya existe:
 * el estado, la prioridad y los pagos vencidos; no se captura aparte.
 */
export const SEGUIMIENTOS = ['entregado', 'urgente', 'pendiente_pago', 'turnitin', 'abordando', 'programado', 'valorado', 'sin_asignar', 'suspendido', 'cancelado'] as const
export type Seguimiento = (typeof SEGUIMIENTOS)[number]

export const NOMBRE_SEGUIMIENTO: Record<Seguimiento, string> = {
  entregado: 'Entregado',
  urgente: 'Urgente',
  pendiente_pago: 'Pendiente de pago',
  turnitin: 'En Turnitin',
  abordando: 'Se está abordando',
  programado: 'Programado',
  valorado: 'Valorado',
  sin_asignar: 'Sin asignar',
  suspendido: 'En espera del cliente',
  cancelado: 'Cancelado',
}

export const DESCRIPCION_SEGUIMIENTO: Record<Seguimiento, string> = {
  entregado: 'El trabajo terminó: todos los entregables están cerrados con la conformidad del cliente.',
  urgente: 'Tiene prioridad urgente: pasa primero en la cola de producción.',
  pendiente_pago: 'Tiene cuotas vencidas sin pagar. Solo lo ve quien puede ver montos.',
  turnitin: 'Un entregable aprobado pasa por Turnitin antes de entregarse al cliente.',
  abordando: 'Ya se empezó a trabajar en él.',
  programado: 'Tiene equipo asignado y tareas programadas, aún sin empezar.',
  valorado: 'Se valoró en una reunión (se estimó cuánto tardará) y aún no tiene equipo de producción.',
  sin_asignar: 'Todavía no tiene equipo de producción.',
  suspendido: 'Se detuvo porque falta información del cliente: sus tareas salen de la cola hasta reanudarlo.',
  cancelado: 'Se canceló.',
}

export interface SeguimientoTrabajo {
  /** Lo más importante del trabajo ahora: el color grande. */
  principal: Seguimiento
  /** Lo demás que también le pasa, en orden de importancia. */
  etiquetas: Seguimiento[]
}

/**
 * Un trabajo puede estar en varias situaciones a la vez (urgente, con pago pendiente y abordándose). El color
 * principal sigue este orden: entregado, urgente, suspendido, pendiente de pago, Turnitin y luego su avance.
 */
export function seguimientoDe(t: { estado: EstadoTrabajo; urgente: boolean; pendientePago: boolean; enTurnitin?: boolean; valorado?: boolean }): SeguimientoTrabajo {
  if (t.estado === 'cancelado') return { principal: 'cancelado', etiquetas: [] }
  if (t.estado === 'finalizado') return { principal: 'entregado', etiquetas: t.pendientePago ? ['pendiente_pago'] : [] }
  const avance: Seguimiento = t.estado === 'en_proceso' ? 'abordando' : t.estado === 'asignado' ? 'programado' : t.estado === 'suspendido' ? 'suspendido' : t.valorado ? 'valorado' : 'sin_asignar'
  const todas: Seguimiento[] = [
    ...(t.urgente ? (['urgente'] as const) : []),
    ...(t.estado === 'suspendido' ? (['suspendido'] as const) : []),
    ...(t.pendientePago ? (['pendiente_pago'] as const) : []),
    ...(t.enTurnitin ? (['turnitin'] as const) : []),
    ...(t.estado === 'suspendido' ? [] : [avance]),
  ]
  const [principal, ...etiquetas] = todas
  return { principal, etiquetas }
}

export const listarTrabajosSchema = z.object({
  q: z.string().trim().max(100).optional(),
  estado: z.enum(ESTADOS_TRABAJO).optional(),
  /** Trabajos que están en esa situación (puede cumplir varias a la vez). */
  seguimiento: z.enum(SEGUIMIENTOS).optional(),
  /** De un proveedor en particular, o solo de clientes / solo de proveedores. */
  proveedorId: z.uuid().optional(),
  /** Trabajos de un cliente (persona integrante). */
  personaId: z.uuid().optional(),
  origen: z.enum(['cliente', 'proveedor']).optional(),
  /** Trabajos cuyo cliente sigue esa asistente administrativa (la responsable del cliente). */
  responsableId: z.uuid().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(5).max(100).default(20),
})
export type ListarTrabajosConsulta = z.output<typeof listarTrabajosSchema>
export type ListarTrabajosFiltros = Partial<ListarTrabajosConsulta>

// ─── Respuestas de la API ───────────────────────────────────

export interface MiembroEquipo {
  id: string
  usuario: UsuarioResumen
  funcion: FuncionEquipo
  desde: string
  hasta: string | null
  asignadoPor: UsuarioResumen
  motivo: string | null
}

export interface CuotaDetalle {
  id: string
  numero: number
  /** Número del adicional del que nace la cuota. */
  adicional: number | null
  monto: number
  vencimiento: string
  pagado: number
  saldo: number
  estado: EstadoCuota
}

export interface PagoDetalle {
  id: string
  numeroRecibo: string
  monto: number
  fecha: string
  metodo: MetodoPago
  numeroOperacion: string | null
  observaciones: string | null
  registradoPor: UsuarioResumen
  registradoEn: string
  anulado: { en: string; por: UsuarioResumen | null; motivo: string | null } | null
  /** Cuotas a las que se aplicó. */
  cuotas: { numero: number; monto: number }[]
}

export interface ResumenCuenta {
  total: number
  pagado: number
  saldo: number
  vencido: number
  proximaCuota: { numero: number; vencimiento: string; saldo: number } | null
}

export interface ContratoDetalle {
  id: string
  fechaFirma: string
  moneda: string
  formaPago: FormaPago
  diasGarantia: number
  finGarantia: string | null
  estado: 'vigente' | 'anulado'
  observaciones: string | null
  /** Monto firmado (sin adicionales); null si el usuario no puede ver montos. */
  montoContrato: number | null
  /** null si el usuario no puede ver montos. */
  cuenta: ResumenCuenta | null
  adicionales: AdicionalItem[] | null
  cuotas: CuotaDetalle[] | null
  pagos: PagoDetalle[] | null
}

export interface TrabajoListadoItem {
  id: string
  codigo: string
  titulo: string | null
  tipoTrabajo: string
  nivelAcademico: string | null
  universidad: string | null
  carrera: string | null
  prioridad: { nombre: string; color: string }
  estado: EstadoTrabajo
  seguimiento: SeguimientoTrabajo
  /** Las fechas no se pueden mover. */
  fechasFijas: boolean
  fechaLimite: string
  /** Si lo entregó un proveedor (no tiene titular). */
  proveedor: { id: string; nombres: string; apellidos: string } | null
  titular: PersonaResumen | null
  totalIntegrantes: number
  auxiliarPrincipal: UsuarioResumen | null
  jefeResponsable: UsuarioResumen | null
  /** null si el usuario no puede ver montos. */
  saldo: number | null
  vencido: number | null
}

export interface TrabajoEventoItem {
  id: string
  tipo: 'creado' | 'editado' | 'equipo' | 'contrato' | 'pago' | 'estado' | 'entregable' | 'adicional' | 'pausa'
  detalle: string
  usuario: UsuarioResumen | null
  fecha: string
}

export interface TrabajoDetalle {
  id: string
  codigo: string
  /** De un prospecto convertido; nulo si lo entregó un proveedor. */
  prospecto: { id: string; codigo: string } | null
  /** Cliente registrado directo (sin seguimiento comercial): su contrato puede registrarse después. */
  clienteDirecto: boolean
  proveedor: { id: string; nombres: string; apellidos: string } | null
  /** Trabajos de proveedor: la actividad y el tiempo con que se armará su tarea al generar el plan. */
  planProveedor: { actividad: string; minutos: number } | null
  titulo: string | null
  tipoTrabajo: Opcion
  prioridad: Opcion & { color: string }
  nivelAcademico: Opcion | null
  universidad: Opcion | null
  carrera: Opcion | null
  linkDrive: string | null
  observaciones: string | null
  detalles: string | null
  fechaInicio: string
  fechaLimite: string
  estado: EstadoTrabajo
  seguimiento: SeguimientoTrabajo
  /** Si está en espera del cliente. */
  pausa: PausaItem | null
  /** Si sus fechas no se pueden mover (con el motivo y quién lo decidió). */
  fechasFijas: FechasFijasItem | null
  integrantes: (PersonaResumen & { esTitular: boolean })[]
  equipo: MiembroEquipo[]
  historialEquipo: MiembroEquipo[]
  contrato: ContratoDetalle | null
  eventos: TrabajoEventoItem[]
  creadoEn: string
  /** Quien dio el enfoque al prospecto (se sugiere para el equipo). */
  dioElEnfoque: { usuario: UsuarioResumen; rol: string } | null
  entregables: EntregableItem[]
  turnitin: TurnitinConfig
  /** La valoración vigente (la última registrada). */
  valoracion: ValoracionItem | null
  /** Hay una plantilla de entregables para su tipo de trabajo. */
  hayPlantilla: boolean
}

/** Una cuota por cobrar (para la bandeja de cobranza). */
export interface CuotaPorCobrar {
  cuotaId: string
  numero: number
  totalCuotas: number
  vencimiento: string
  monto: number
  saldo: number
  estado: EstadoCuota
  trabajo: { id: string; codigo: string; tipoTrabajo: string }
  titular: PersonaResumen | null
}

export interface ResumenCobranza {
  hoy: string
  totales: { vencido: number; porVencer7Dias: number; pendienteTotal: number }
  cuotas: CuotaPorCobrar[]
}

// ─── Cliente que ya trabaja con nosotros (alta directa, sin pasar por prospecto) ───

export const integranteDirectoSchema = z
  .object({
    celular: z
      .string({ error: 'Ingresa el celular' })
      .trim()
      .min(1, 'Ingresa el celular')
      .transform((v, ctx) => {
        const n = normalizarCelular(v)
        if (!n) {
          ctx.addIssue({ code: 'custom', message: 'Celular no válido (ej. 987 654 321 o +51 987 654 321)' })
          return z.NEVER
        }
        return n
      }),
    nombres: z.string().trim().min(1, 'Ingresa los nombres').max(100),
    apellidos: z.string().trim().min(1, 'Ingresa los apellidos').max(100),
    email: opcional(z.string().trim().toLowerCase().pipe(z.email('Correo no válido').max(150))),
    tipoDocumento: z.enum(TIPOS_DOCUMENTO, { error: 'Elige el tipo de documento' }),
    numeroDocumento: z.string({ error: 'Ingresa el número de documento' }).trim().toUpperCase().min(1, 'Ingresa el número de documento').max(20),
    esTitular: z.boolean().default(false),
  })
  .superRefine(validarDocumento)

/** La primera actividad del trabajo: arranca en la fecha de inicio a la hora indicada, con su equipo. */
export const programacionInicialSchema = z.object({
  actividadId: z.string({ error: 'Elige la actividad' }).min(1, 'Elige la actividad').pipe(z.uuid('Elige la actividad')),
  /** Tiempo estimado: viene del catálogo de actividades, pero se puede ajustar. */
  minutosEstimados: z.coerce.number('Indica el tiempo estimado').int('Número entero').min(15, 'Mínimo 15 minutos').max(60 * 200, 'Máximo 200 horas'),
  hora: z.string({ error: 'Indica la hora de inicio' }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida (HH:mm)'),
  auxiliarPrincipalId: z.string({ error: 'Elige al auxiliar principal' }).min(1, 'Elige al auxiliar principal').pipe(z.uuid('Elige al auxiliar principal')),
  jefeResponsableId: z.string({ error: 'Elige al jefe responsable' }).min(1, 'Elige al jefe responsable').pipe(z.uuid('Elige al jefe responsable')),
})
export type ProgramacionInicialDatos = z.output<typeof programacionInicialSchema>

/** Un cliente que ya tiene trabajo contratado: se registra directo, con su contrato y los pagos ya recibidos. */
export const clienteDirectoSchema = z
  .object({
    /** Obligatorio, salvo que el trabajo lo haya entregado un proveedor (entonces puede no haber cliente). */
    integrantes: z.array(integranteDirectoSchema).max(5, 'Máximo 5 integrantes'),
    tipoTrabajoId: z.string({ error: 'Elige el tipo de trabajo' }).min(1, 'Elige el tipo de trabajo').pipe(z.uuid('Elige el tipo de trabajo')),
    prioridadId: z.string({ error: 'Elige la prioridad' }).min(1, 'Elige la prioridad').pipe(z.uuid('Elige la prioridad')),
    /** Quien sigue al cliente: la asistente administrativa que lo captó, el jefe de producción, etc. */
    responsableId: z.string({ error: 'Elige al responsable' }).min(1, 'Elige al responsable').pipe(z.uuid('Elige al responsable')),
    trabajo: trabajoConversionSchema,
    /** Opcional: si no se conoce el monto total, se registra después. */
    contrato: contratoConversionSchema.optional(),
    observaciones: texto(5000),
    /** Opcional: programa la primera actividad desde la fecha de inicio a la hora indicada. */
    programacion: programacionInicialSchema.optional(),
    /** Opcional: si el trabajo de este cliente lo entregó un proveedor (el proveedor es quien paga). */
    proveedorId: opcional(z.uuid('Proveedor no válido')),
    /** Pagos que el cliente ya hizo (con su fecha real). */
    pagos: z.array(pagoSchema).default([]),
  })
  .superRefine((d, ctx) => {
    validarConversion({ ...d, pagoInicial: undefined }, ctx)
    if (d.integrantes.length === 0 && !d.proveedorId) ctx.addIssue({ code: 'custom', path: ['integrantes'], message: 'Agrega al menos un integrante (solo es opcional si el trabajo es de un proveedor)' })
    if (d.programacion) {
      const [h, m] = d.programacion.hora.split(':').map(Number)
      // Fecha y hora de inicio pueden ser pasadas: el trabajo ya empezó y la actividad se programa desde ese momento.
      if (h * 60 + m < 6 * 60 || h * 60 + m > 22 * 60) ctx.addIssue({ code: 'custom', path: ['programacion', 'hora'], message: 'Elige una hora entre las 06:00 y las 22:00' })
      if (d.programacion.auxiliarPrincipalId === d.programacion.jefeResponsableId) ctx.addIssue({ code: 'custom', path: ['programacion', 'jefeResponsableId'], message: 'Quien revisa debe ser otra persona que quien elabora' })
    }
    if (!d.contrato && d.pagos.length > 0) ctx.addIssue({ code: 'custom', path: ['pagos'], message: 'Para registrar pagos indica el contrato (monto total)' })
    const pagado = d.pagos.reduce((s, p) => s + aCentimos(p.monto), 0)
    if (d.contrato && pagado > aCentimos(d.contrato.montoTotal)) {
      ctx.addIssue({ code: 'custom', path: ['pagos'], message: `Los pagos (${formatearSoles(deCentimos(pagado))}) superan el total del contrato` })
    }
    d.pagos.forEach((p, i) => {
      if (d.contrato && p.fecha < d.contrato.fechaFirma) ctx.addIssue({ code: 'custom', path: ['pagos', i, 'fecha'], message: 'No puede ser anterior a la firma del contrato' })
    })
    const documentos = d.integrantes.map((i) => `${i.tipoDocumento}${i.numeroDocumento}`)
    if (new Set(documentos).size !== documentos.length) ctx.addIssue({ code: 'custom', path: ['integrantes'], message: 'Hay dos integrantes con el mismo documento' })
    const celulares = d.integrantes.map((i) => i.celular)
    if (new Set(celulares).size !== celulares.length) ctx.addIssue({ code: 'custom', path: ['integrantes'], message: 'Hay dos integrantes con el mismo celular' })
  })
export type ClienteDirectoFormulario = z.input<typeof clienteDirectoSchema>
export type ClienteDirectoDatos = z.output<typeof clienteDirectoSchema>
