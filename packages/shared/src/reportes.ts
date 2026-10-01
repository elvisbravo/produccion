import { z } from 'zod'
import type { UsuarioResumen } from './prospectos.js'

export const periodoSchema = z
  .object({ desde: z.iso.date().optional(), hasta: z.iso.date().optional() })
  .refine((p) => !p.desde || !p.hasta || p.desde <= p.hasta, { message: 'Rango no válido', path: ['hasta'] })
export type Periodo = { desde: string; hasta: string }

// ─── Costo por hora (confidencial) ──────────────────────────

export const costoHoraSchema = z.object({
  costo: z.coerce.number('Monto no válido').min(0, 'No puede ser negativo').max(10_000),
  vigenteDesde: z.string().min(1, 'Elige desde cuándo rige').pipe(z.iso.date('Fecha no válida')),
})
export type CostoHoraFormulario = z.input<typeof costoHoraSchema>
export type CostoHoraDatos = z.output<typeof costoHoraSchema>

export interface CostoHoraItem {
  id: string
  costo: number
  vigenteDesde: string
  creadoPor: UsuarioResumen | null
  creadoEn: string
}

// ─── Puntualidad ────────────────────────────────────────────

export interface FilaPuntualidad {
  clave: string
  nombre: string
  total: number
  aTiempo: number
  /** a tiempo / total (0 a 1); null si no hay entregables. */
  porcentaje: number | null
}

export interface ReportePuntualidad extends Periodo {
  total: FilaPuntualidad
  porAuxiliar: FilaPuntualidad[]
  porTipo: FilaPuntualidad[]
  porMes: FilaPuntualidad[]
  /** Entregados tarde o vencidos sin entregar. */
  atrasados: {
    id: string
    nombre: string
    trabajo: { id: string; codigo: string }
    auxiliar: UsuarioResumen | null
    fechaLimite: string
    entregadoEl: string | null
    diasAtraso: number
  }[]
}

// ─── Retrabajo ──────────────────────────────────────────────

export interface FilaRetrabajo {
  clave: string
  nombre: string
  entregables: number
  observacionesInternas: number
  observacionesCliente: number
  /** Observaciones por entregable. */
  promedio: number
}

export interface ReporteRetrabajo extends Periodo {
  total: FilaRetrabajo
  porAuxiliar: FilaRetrabajo[]
  porTipo: FilaRetrabajo[]
  masObservados: { id: string; nombre: string; trabajo: { id: string; codigo: string }; auxiliar: UsuarioResumen | null; internas: number; cliente: number }[]
}

// ─── Ocupación ──────────────────────────────────────────────

export interface FilaOcupacion {
  usuario: UsuarioResumen
  roles: string[]
  /** Minutos disponibles según su horario, menos días no laborables. */
  capacidad: number
  /** Minutos registrados con el cronómetro o a mano. */
  trabajado: number
  /** trabajado / capacidad; null sin capacidad. */
  porcentaje: number | null
  minutosExtra: number
  bonos: number
}

export interface ReporteOcupacion extends Periodo {
  personas: FilaOcupacion[]
  total: Omit<FilaOcupacion, 'usuario' | 'roles'>
}

// ─── Cobranza ───────────────────────────────────────────────

export interface ReporteCobranza extends Periodo {
  /** A la fecha "hasta". */
  porCobrar: number
  vencido: number
  /** vencido / por cobrar. */
  morosidad: number | null
  antiguedad: { tramo: string; monto: number; cuotas: number }[]
  cobradoEnPeriodo: number
  cobradoPorMetodo: { metodo: string; monto: number }[]
  cobradoPorMes: { mes: string; monto: number }[]
  /** Vencido por responsable de seguimiento del cliente. */
  vencidoPorResponsable: { usuario: UsuarioResumen; monto: number; cuotas: number }[]
}

// ─── Rentabilidad (confidencial) ────────────────────────────

export interface FilaRentabilidad {
  ingresos: number
  costoPersonal: number
  costoExtras: number
  bonos: number
  margen: number
  /** margen / ingresos. */
  margenPorcentaje: number | null
  horas: number
}

export interface ReporteRentabilidad extends Periodo {
  total: FilaRentabilidad
  trabajos: (FilaRentabilidad & {
    id: string
    codigo: string
    titulo: string | null
    tipoTrabajo: string
    estado: string
    /** Horas registradas por personas sin costo por hora vigente (no suman costo). */
    horasSinCosto: number
  })[]
  porTipo: (FilaRentabilidad & { nombre: string; trabajos: number })[]
  porNivel: (FilaRentabilidad & { nombre: string; trabajos: number })[]
  porUniversidad: (FilaRentabilidad & { nombre: string; trabajos: number })[]
}

// ─── Tablero ────────────────────────────────────────────────

export interface Tablero extends Periodo {
  puntualidad: number | null
  entregables: number
  retrabajo: number
  ocupacion: number | null
  porCobrar: number
  vencido: number
  cobrado: number
  /** Solo con permiso de costos. */
  margen: number | null
  margenPorcentaje: number | null
  /** Prospectos registrados en el periodo y cuántos de ellos se convirtieron (0 a 1). */
  prospectos: number
  conversion: number | null
  puntualidadPorMes: FilaPuntualidad[]
  antiguedad: ReporteCobranza['antiguedad']
  ocupacionPorPersona: { nombre: string; porcentaje: number | null }[]
}

// ─── Conversión del embudo comercial ────────────────────────

export interface FilaConversion {
  clave: string
  nombre: string
  /** Prospectos registrados en el periodo. */
  prospectos: number
  /** Se convirtieron en cliente (tienen trabajo). */
  convertidos: number
  perdidos: number
  /** Siguen en una etapa abierta. */
  abiertos: number
  /** convertidos / prospectos (0 a 1); null sin prospectos. */
  tasa: number | null
  /** Suma de los contratos de los convertidos. */
  monto: number
}

export interface ReporteConversion extends Periodo {
  total: FilaConversion & {
    /** Días promedio desde el registro del prospecto hasta su conversión. */
    diasPromedio: number | null
    /** monto / convertidos. */
    ticketPromedio: number | null
  }
  /** Cuántos prospectos del periodo llegaron a cada etapa (por la etapa actual o por su historial). */
  embudo: { id: string; nombre: string; color: string; clase: 'abierta' | 'ganada' | 'perdida'; alcanzaron: number; actuales: number }[]
  porOrigen: FilaConversion[]
  /** Por el asistente administrativo que captó al prospecto. */
  porAsistente: FilaConversion[]
  porTipo: FilaConversion[]
  porMes: FilaConversion[]
  motivosPerdida: { nombre: string; cantidad: number }[]
}
