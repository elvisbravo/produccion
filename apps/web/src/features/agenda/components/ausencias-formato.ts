import type { AusenciaItem } from '@grupoes/shared'
import { diasHasta, formatearFecha } from '@/lib/formato'

/** "12 oct. 2026, 15:00–17:00", "12 oct. 2026" o "12 oct. 2026 – 16 oct. 2026 (5 días)". */
export function describirAusencia(a: Pick<AusenciaItem, 'fechaDesde' | 'fechaHasta' | 'horaDesde' | 'horaHasta'>): string {
  if (a.horaDesde) return `${formatearFecha(a.fechaDesde)}, ${a.horaDesde}–${a.horaHasta}`
  if (a.fechaDesde === a.fechaHasta) return formatearFecha(a.fechaDesde)
  const dias = diasHasta(a.fechaHasta, a.fechaDesde) + 1
  return `${formatearFecha(a.fechaDesde)} – ${formatearFecha(a.fechaHasta)} (${dias} días)`
}
