import { z } from 'zod'
import { sumarDias } from './fechas.js'
import type { UsuarioResumen } from './prospectos.js'

// ─── Datos de la empresa (membrete) ─────────────────────────

const texto = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`)

export const empresaSchema = z.object({
  razonSocial: texto(150).min(1, 'Escribe la razón social'),
  nombreComercial: texto(100),
  ruc: z
    .string()
    .trim()
    .refine((v) => v === '' || /^(10|15|17|20)\d{9}$/.test(v), 'El RUC tiene 11 dígitos y empieza con 10, 15, 17 o 20'),
  direccion: texto(250),
  telefono: texto(60),
  correo: z.union([z.literal(''), z.email('Correo no válido').max(150)]),
  web: texto(150),
  /** Cuentas para depósitos o Yape/Plin; se imprimen en la cotización. */
  cuentas: texto(1000),
})
export type EmpresaDatos = z.output<typeof empresaSchema>

export const EMPRESA_POR_DEFECTO: EmpresaDatos = {
  razonSocial: 'GRUPO ES',
  nombreComercial: '',
  ruc: '',
  direccion: '',
  telefono: '',
  correo: '',
  web: '',
  cuentas: '',
}

// ─── Plantillas con variables ───────────────────────────────

export const TIPOS_PLANTILLA = ['cotizacion', 'contrato', 'recibo'] as const
export type TipoPlantilla = (typeof TIPOS_PLANTILLA)[number]

export const NOMBRE_PLANTILLA: Record<TipoPlantilla, string> = {
  cotizacion: 'Cotización',
  contrato: 'Contrato',
  recibo: 'Recibo de pago',
}

export interface VariablePlantilla {
  clave: string
  descripcion: string
  ejemplo: string
}

const COMUNES: VariablePlantilla[] = [
  { clave: 'empresa', descripcion: 'Razón social', ejemplo: 'GRUPO ES S.A.C.' },
  { clave: 'ruc', descripcion: 'RUC de la empresa', ejemplo: '20601234567' },
  { clave: 'direccion_empresa', descripcion: 'Dirección de la empresa', ejemplo: 'Av. Los Próceres 123, Lima' },
  { clave: 'telefono_empresa', descripcion: 'Teléfono de la empresa', ejemplo: '987 654 321' },
  { clave: 'correo_empresa', descripcion: 'Correo de la empresa', ejemplo: 'contacto@grupoes.pe' },
]

export const VARIABLES_PLANTILLA: Record<TipoPlantilla, VariablePlantilla[]> = {
  cotizacion: [
    { clave: 'numero', descripcion: 'Número de la cotización', ejemplo: 'C-2026-0001' },
    { clave: 'fecha', descripcion: 'Fecha de emisión', ejemplo: '1 de octubre de 2026' },
    { clave: 'valido_hasta', descripcion: 'Válida hasta', ejemplo: '15 de octubre de 2026' },
    { clave: 'validez_dias', descripcion: 'Días de validez', ejemplo: '15' },
    { clave: 'cliente', descripcion: 'Nombre del prospecto', ejemplo: 'María Quispe Rojas' },
    { clave: 'tipo_trabajo', descripcion: 'Tipo de trabajo', ejemplo: 'Tesis' },
    { clave: 'titulo', descripcion: 'Título del trabajo', ejemplo: 'Calidad de servicio y satisfacción del cliente' },
    { clave: 'total', descripcion: 'Total en soles', ejemplo: 'S/ 3,500.00' },
    { clave: 'total_letras', descripcion: 'Total en letras', ejemplo: 'TRES MIL QUINIENTOS CON 00/100 SOLES' },
    { clave: 'forma_pago', descripcion: 'Forma de pago sugerida', ejemplo: 'tres cuotas mensuales' },
    { clave: 'asesor', descripcion: 'Quien emite la cotización', ejemplo: 'Andrea Torres' },
    ...COMUNES,
  ],
  contrato: [
    { clave: 'codigo', descripcion: 'Código del trabajo', ejemplo: 'T-2026-0001' },
    { clave: 'fecha_firma', descripcion: 'Fecha de firma', ejemplo: '1 de octubre de 2026' },
    { clave: 'cliente', descripcion: 'Titular del contrato', ejemplo: 'María Quispe Rojas' },
    { clave: 'documento_cliente', descripcion: 'Documento del titular', ejemplo: 'DNI 45678912' },
    { clave: 'integrantes', descripcion: 'Todos los integrantes con su documento', ejemplo: 'María Quispe Rojas (DNI 45678912)' },
    { clave: 'tipo_trabajo', descripcion: 'Tipo de trabajo', ejemplo: 'Tesis' },
    { clave: 'titulo', descripcion: 'Título del trabajo', ejemplo: 'Calidad de servicio y satisfacción del cliente' },
    { clave: 'nivel', descripcion: 'Nivel académico', ejemplo: 'Pregrado' },
    { clave: 'universidad', descripcion: 'Universidad', ejemplo: 'Universidad Nacional Mayor de San Marcos' },
    { clave: 'carrera', descripcion: 'Carrera', ejemplo: 'Administración' },
    { clave: 'fecha_inicio', descripcion: 'Inicio del trabajo', ejemplo: '2 de octubre de 2026' },
    { clave: 'fecha_limite', descripcion: 'Entrega final', ejemplo: '30 de diciembre de 2026' },
    { clave: 'monto', descripcion: 'Monto total', ejemplo: 'S/ 3,500.00' },
    { clave: 'monto_letras', descripcion: 'Monto total en letras', ejemplo: 'TRES MIL QUINIENTOS CON 00/100 SOLES' },
    { clave: 'forma_pago', descripcion: 'Al contado o en cuotas', ejemplo: 'en 3 cuotas' },
    { clave: 'dias_garantia', descripcion: 'Días de garantía', ejemplo: '30' },
    ...COMUNES,
  ],
  recibo: [
    { clave: 'numero', descripcion: 'Número de recibo', ejemplo: 'R-2026-0001' },
    { clave: 'fecha', descripcion: 'Fecha del pago', ejemplo: '1 de octubre de 2026' },
    { clave: 'cliente', descripcion: 'Titular del contrato', ejemplo: 'María Quispe Rojas' },
    { clave: 'documento_cliente', descripcion: 'Documento del titular', ejemplo: 'DNI 45678912' },
    { clave: 'monto', descripcion: 'Monto pagado', ejemplo: 'S/ 1,000.00' },
    { clave: 'monto_letras', descripcion: 'Monto pagado en letras', ejemplo: 'MIL CON 00/100 SOLES' },
    { clave: 'metodo', descripcion: 'Medio de pago', ejemplo: 'Yape' },
    { clave: 'concepto', descripcion: 'Cuotas que cubre el pago', ejemplo: 'cuota 1 de 3' },
    { clave: 'codigo_trabajo', descripcion: 'Código del trabajo', ejemplo: 'T-2026-0001' },
    { clave: 'tipo_trabajo', descripcion: 'Tipo de trabajo', ejemplo: 'Tesis' },
    { clave: 'saldo', descripcion: 'Saldo después de este pago', ejemplo: 'S/ 2,500.00' },
    ...COMUNES,
  ],
}

/**
 * Textos provisionales: se reemplazan por los formatos de la empresa desde Configuración → Documentos.
 * Formato: párrafos separados por una línea en blanco; "# " inicia un título y "- " un punto de lista.
 */
export const PLANTILLAS_POR_DEFECTO: Record<TipoPlantilla, string> = {
  cotizacion: `# Condiciones
- Esta cotización es válida hasta el {valido_hasta}.
- Forma de pago sugerida: {forma_pago}.
- El servicio se inicia con la firma del contrato y el pago de la primera cuota.
- Las fechas de cada entrega se fijan en el contrato, según el cronograma acordado.

Para aceptar esta cotización o resolver cualquier duda, comunícate con {asesor} al {telefono_empresa}.`,
  contrato: `Conste por el presente documento el contrato de prestación de servicios que celebran, de una parte, {empresa}, con RUC {ruc} y domicilio en {direccion_empresa}, a quien en adelante se denominará LA EMPRESA; y de la otra parte, {cliente}, identificado(a) con {documento_cliente}, a quien en adelante se denominará EL CLIENTE, en los términos siguientes:

# Primera: objeto
LA EMPRESA brindará a EL CLIENTE el servicio de asesoría académica para su {tipo_trabajo} titulado "{titulo}", de nivel {nivel}, en la carrera de {carrera} de la {universidad}.

# Segunda: plazo
El servicio se inicia el {fecha_inicio} y la entrega final será a más tardar el {fecha_limite}, según el cronograma de entregables acordado entre las partes.

# Tercera: monto y forma de pago
El monto total del servicio es de {monto} ({monto_letras}), que EL CLIENTE pagará {forma_pago}, según el cronograma de pagos de este contrato. Cada pago se acredita con un recibo numerado.

# Cuarta: obligaciones del cliente
EL CLIENTE se compromete a entregar oportunamente la información que se le solicite, revisar cada entregable y comunicar sus observaciones por escrito.

# Quinta: garantía
Luego de la entrega final, LA EMPRESA atenderá sin costo adicional las observaciones sobre lo entregado durante {dias_garantia} días calendario.

# Sexta: confidencialidad
Ambas partes mantendrán en reserva la información que se compartan con motivo de este contrato.

En señal de conformidad, las partes firman el presente contrato el {fecha_firma}.`,
  recibo: `Recibí de {cliente} ({documento_cliente}) la suma de {monto} ({monto_letras}) por concepto de {concepto} del trabajo {codigo_trabajo}, pagada mediante {metodo}.

Este recibo es un comprobante interno de pago y no reemplaza a la boleta o factura electrónica.`,
}

/** Reemplaza las variables {clave}; las que no existen se dejan tal cual para que se noten. */
export function rellenarPlantilla(plantilla: string, valores: Record<string, string>): string {
  return plantilla.replace(/\{([a-z_]+)\}/g, (original, clave: string) => (clave in valores ? valores[clave] : original))
}

export type BloquePlantilla = { tipo: 'titulo'; texto: string } | { tipo: 'parrafo'; lineas: string[] } | { tipo: 'lista'; items: string[] }

/** Divide el texto en títulos, párrafos y listas para imprimirlo. */
export function bloquesPlantilla(textoPlantilla: string): BloquePlantilla[] {
  const bloques: BloquePlantilla[] = []
  for (const grupo of textoPlantilla.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    let parrafo: string[] = []
    let lista: string[] = []
    const cerrar = () => {
      if (parrafo.length) bloques.push({ tipo: 'parrafo', lineas: parrafo })
      if (lista.length) bloques.push({ tipo: 'lista', items: lista })
      parrafo = []
      lista = []
    }
    for (const linea of grupo.split('\n').map((l) => l.trim())) {
      if (!linea) continue
      if (linea.startsWith('# ')) {
        cerrar()
        bloques.push({ tipo: 'titulo', texto: linea.slice(2).trim() })
      } else if (linea.startsWith('- ')) {
        if (parrafo.length) cerrar()
        lista.push(linea.slice(2).trim())
      } else {
        if (lista.length) cerrar()
        parrafo.push(linea)
      }
    }
    cerrar()
  }
  return bloques
}

export const plantillaSchema = z.object({
  tipo: z.enum(TIPOS_PLANTILLA),
  contenido: z.string().trim().min(1, 'Escribe el texto del documento').max(20_000, 'Máximo 20 000 caracteres'),
})

export const configuracionDocumentosSchema = z.object({
  empresa: empresaSchema,
  plantillas: z.array(plantillaSchema).max(TIPOS_PLANTILLA.length),
})
export type ConfiguracionDocumentosDatos = z.output<typeof configuracionDocumentosSchema>

export interface ConfiguracionDocumentos {
  empresa: EmpresaDatos
  plantillas: { tipo: TipoPlantilla; contenido: string; personalizada: boolean; actualizadoEn: string | null }[]
}

// ─── Montos y fechas en texto ───────────────────────────────

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
const DIEZ_A_VEINTINUEVE = [
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
]
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

/** 0 a 999. "apocopar" convierte UNO en UN delante de MIL o MILLONES. */
function hasta999(n: number, apocopar = false): string {
  if (n === 100) return 'CIEN'
  const c = Math.floor(n / 100)
  const resto = n % 100
  let menor = ''
  if (resto < 10) menor = UNIDADES[resto]
  else if (resto < 30) menor = DIEZ_A_VEINTINUEVE[resto - 10]
  else menor = DECENAS[Math.floor(resto / 10)] + (resto % 10 ? ` Y ${UNIDADES[resto % 10]}` : '')
  if (apocopar) menor = menor.replace(/UNO$/, 'UN').replace(/VEINTIUN$/, 'VEINTIÚN')
  return [CENTENAS[c], menor].filter(Boolean).join(' ')
}

function enteroEnLetras(n: number): string {
  if (n === 0) return 'CERO'
  const millones = Math.floor(n / 1_000_000)
  const miles = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000
  const partes: string[] = []
  if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : `${hasta999(millones, true)} MILLONES`)
  if (miles) partes.push(miles === 1 ? 'MIL' : `${hasta999(miles, true)} MIL`)
  if (resto) partes.push(hasta999(resto))
  return partes.join(' ')
}

/** 1500.5 → "MIL QUINIENTOS CON 50/100 SOLES" (como en los comprobantes peruanos). */
export function montoEnLetras(monto: number): string {
  const centimos = Math.round(monto * 100)
  const entero = Math.floor(centimos / 100)
  return `${enteroEnLetras(entero)} CON ${String(centimos % 100).padStart(2, '0')}/100 SOLES`
}

const formatoFechaLarga = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
/** "2026-10-01" → "1 de octubre de 2026" */
export const fechaLarga = (dia: string) => formatoFechaLarga.format(new Date(`${dia}T12:00:00Z`))

// ─── Cotizaciones ───────────────────────────────────────────

const decimal = (mensaje: string, minimo: number) => z.coerce.number({ error: mensaje }).min(minimo, mensaje).max(1_000_000, 'Monto demasiado alto')

export const cotizacionSchema = z.object({
  fecha: z.iso.date('Fecha no válida'),
  validezDias: z.coerce.number({ error: 'Indica los días de validez' }).int('Debe ser un número entero').min(1, 'Al menos 1 día').max(365, 'Máximo 365 días'),
  formaPago: texto(300).optional(),
  observaciones: texto(2000).optional(),
  items: z
    .array(
      z.object({
        descripcion: texto(300).min(1, 'Describe el ítem'),
        cantidad: decimal('Cantidad no válida', 0.01),
        precio: decimal('Precio no válido', 0),
      }),
    )
    .min(1, 'Agrega al menos un ítem')
    .max(30, 'Máximo 30 ítems')
    .refine((items) => items.some((i) => i.cantidad * i.precio > 0), 'El total debe ser mayor a 0'),
})
export type CotizacionFormulario = z.input<typeof cotizacionSchema>
export type CotizacionDatos = z.output<typeof cotizacionSchema>

export const anularCotizacionSchema = z.object({ motivo: texto(500).min(1, 'Indica el motivo') })

export type EstadoCotizacion = 'emitida' | 'anulada'

export interface CotizacionItemDetalle {
  descripcion: string
  cantidad: number
  precio: number
  subtotal: number
}

export interface CotizacionResumen {
  id: string
  numero: string
  fecha: string
  validezDias: number
  /** fecha + validez. */
  validaHasta: string
  total: number
  formaPago: string | null
  observaciones: string | null
  estado: EstadoCotizacion
  items: CotizacionItemDetalle[]
  creadoPor: UsuarioResumen
  anulada: { fecha: string; por: UsuarioResumen | null; motivo: string | null } | null
}

export const validaHasta = (fecha: string, validezDias: number) => sumarDias(fecha, validezDias)

// ─── Documentos imprimibles ─────────────────────────────────

interface DocumentoBase {
  empresa: EmpresaDatos
  /** Texto de la plantilla con las variables ya reemplazadas. */
  texto: string
}

export interface DocumentoCotizacion extends DocumentoBase {
  numero: string
  fecha: string
  validaHasta: string
  estado: EstadoCotizacion
  prospecto: { id: string; codigo: string }
  cliente: { nombre: string; celular: string | null }
  trabajo: { tipo: string; titulo: string | null; nivel: string | null; universidad: string | null; carrera: string | null }
  items: CotizacionItemDetalle[]
  total: number
  totalLetras: string
  formaPago: string | null
  observaciones: string | null
  asesor: UsuarioResumen
}

export interface DocumentoContrato extends DocumentoBase {
  trabajo: { id: string; codigo: string; tipo: string; titulo: string | null; nivel: string | null; universidad: string | null; carrera: string | null; fechaInicio: string; fechaLimite: string }
  fechaFirma: string
  estado: string
  integrantes: { nombre: string; documento: string | null; celular: string; email: string | null; esTitular: boolean }[]
  montoTotal: number
  montoLetras: string
  formaPago: 'contado' | 'cuotas'
  cuotas: { numero: number; monto: number; vencimiento: string }[]
  diasGarantia: number
}

export interface DocumentoRecibo extends DocumentoBase {
  numero: string
  fecha: string
  monto: number
  montoLetras: string
  metodo: string
  numeroOperacion: string | null
  cliente: { nombre: string; documento: string | null }
  trabajo: { id: string; codigo: string; tipo: string; titulo: string | null }
  cuotas: { numero: number; montoAplicado: number }[]
  totalContrato: number
  /** Saldo del contrato después de este pago (sin contar pagos posteriores). */
  saldo: number
  registradoPor: UsuarioResumen
  anulado: { motivo: string | null } | null
}

export const listarCotizacionesSchema = z.object({
  q: z.string().trim().max(100).optional(),
  /** Vigente = emitida y dentro de su validez. */
  estado: z.enum(['vigente', 'vencida', 'anulada']).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(5).max(100).default(20),
})
export type ListarCotizacionesFiltros = Partial<z.output<typeof listarCotizacionesSchema>>

export interface CotizacionListadoItem extends Omit<CotizacionResumen, 'items' | 'observaciones' | 'anulada'> {
  prospecto: { id: string; codigo: string; cliente: string; tipoTrabajo: string; convertido: boolean }
}
