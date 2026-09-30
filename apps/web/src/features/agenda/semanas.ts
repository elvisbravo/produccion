import { diaSemanaDe, sumarDias } from '@grupoes/shared'

/** Lunes de la semana de un día YYYY-MM-DD. */
export function lunesDe(dia: string): string {
  return sumarDias(dia, 1 - diaSemanaDe(dia))
}

const diaMes = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const diaMesAnio = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const cabecera = new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
const aFecha = (dia: string) => new Date(`${dia}T12:00:00Z`)

/** "28 sep. – 4 oct. 2026" */
export function describirSemana(lunes: string): string {
  return `${diaMes.format(aFecha(lunes))} – ${diaMesAnio.format(aFecha(sumarDias(lunes, 6)))}`
}

/** "lun. 28" */
export function cabeceraDia(dia: string): string {
  return cabecera.format(aFecha(dia))
}

/** "3,5 h" */
export function horas(minutos: number): string {
  const valor = Math.round((minutos / 60) * 10) / 10
  return `${valor.toLocaleString('es-PE')} h`
}

/** 480 → "8:00" */
export function horaCorta(minutos: number): string {
  return `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')}`
}
