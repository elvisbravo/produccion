const ZONA = 'America/Lima'

const fechaCorta = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: ZONA })
const fechaHora = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: ZONA,
})
const relativo = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })

/** 15 feb. 2027 (para fechas sin hora 'YYYY-MM-DD' o instantes ISO). */
export function formatearFecha(valor: string | null | undefined): string {
  if (!valor) return '—'
  // Una fecha sin hora se interpreta al mediodía UTC para que no cambie de día por la zona horaria.
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T12:00:00Z`) : new Date(valor)
  return fechaCorta.format(fecha)
}

export function formatearFechaHora(valor: string): string {
  return fechaHora.format(new Date(valor))
}

/** "hace 5 minutos", "ayer", "hace 3 días"… (pasadas 4 semanas, la fecha). */
export function haceCuanto(valor: string, ahora = Date.now()): string {
  const segundos = Math.round((new Date(valor).getTime() - ahora) / 1000)
  const abs = Math.abs(segundos)
  if (abs < 60) return 'hace un momento'
  if (abs < 3600) return relativo.format(Math.round(segundos / 60), 'minute')
  if (abs < 86_400) return relativo.format(Math.round(segundos / 3600), 'hour')
  if (abs < 86_400 * 28) return relativo.format(Math.round(segundos / 86_400), 'day')
  return formatearFecha(valor)
}

const diaSemana = new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const soloHora = new Intl.DateTimeFormat('es-PE', { hour: 'numeric', minute: '2-digit', timeZone: ZONA })

/** "Hoy", "Mañana", "Ayer" o "vie. 2 oct." para un día YYYY-MM-DD (respecto de hoy en Lima). */
export function describirDia(dia: string, hoy: string): string {
  const diferencia = Math.round((Date.parse(`${dia}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000)
  if (diferencia === 0) return 'Hoy'
  if (diferencia === 1) return 'Mañana'
  if (diferencia === -1) return 'Ayer'
  return diaSemana.format(new Date(`${dia}T12:00:00Z`))
}

/** 4:00 p. m. (hora de Lima de un instante ISO). */
export function formatearHora(instante: string): string {
  return soloHora.format(new Date(instante))
}

/** "Hoy, 4:00 p. m." o "vie. 2 oct." si no tiene hora. */
export function describirCuando(t: { fecha: string; inicio: string | null }, hoy: string): string {
  const dia = describirDia(t.fecha, hoy)
  return t.inicio ? `${dia}, ${formatearHora(t.inicio)}` : dia
}

/** Suma meses a un día YYYY-MM-DD; si el día no existe en ese mes, usa el último (31 ene + 1 mes = 28/29 feb). */
export function sumarMeses(dia: string, meses: number): string {
  const [a, m, d] = dia.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m - 1 + meses + 1, 0)).getUTCDate()
  return new Date(Date.UTC(a, m - 1 + meses, Math.min(d, ultimo))).toISOString().slice(0, 10)
}

/** Días entre hoy y un día (negativo si ya pasó). */
export function diasHasta(dia: string, hoy: string): number {
  return Math.round((Date.parse(`${dia}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000)
}

export function duracion(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

export function nombreCompleto(p: { nombres: string | null; apellidos: string | null } | null | undefined): string | null {
  const texto = [p?.nombres, p?.apellidos].filter(Boolean).join(' ').trim()
  return texto || null
}
