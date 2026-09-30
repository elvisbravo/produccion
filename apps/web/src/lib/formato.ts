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

export function nombreCompleto(p: { nombres: string | null; apellidos: string | null } | null | undefined): string | null {
  const texto = [p?.nombres, p?.apellidos].filter(Boolean).join(' ').trim()
  return texto || null
}
