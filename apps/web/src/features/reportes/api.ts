import type {
  CostoHoraDatos,
  CostoHoraItem,
  ReporteCobranza,
  ReporteOcupacion,
  ReportePuntualidad,
  ReporteRentabilidad,
  ReporteRetrabajo,
  Tablero,
} from '@grupoes/shared'
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

const reporte = <T,>(ruta: string) => (desde: string, hasta: string) =>
  queryOptions({
    queryKey: ['reportes', ruta, desde, hasta] as const,
    queryFn: () => api<T>(`/reportes/${ruta}?desde=${desde}&hasta=${hasta}`),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })

export const tableroQuery = reporte<Tablero>('tablero')
export const puntualidadQuery = reporte<ReportePuntualidad>('puntualidad')
export const retrabajoQuery = reporte<ReporteRetrabajo>('retrabajo')
export const ocupacionQuery = reporte<ReporteOcupacion>('ocupacion')
export const cobranzaReporteQuery = reporte<ReporteCobranza>('cobranza')
export const rentabilidadQuery = reporte<ReporteRentabilidad>('rentabilidad')

export const costosHoraQuery = (usuarioId: string) =>
  queryOptions({ queryKey: ['usuarios', 'costos-hora', usuarioId] as const, queryFn: () => api<CostoHoraItem[]>(`/usuarios/${usuarioId}/costos-hora`) })

export function useGuardarCostoHora(usuarioId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datos: CostoHoraDatos) => api<CostoHoraItem[]>(`/usuarios/${usuarioId}/costos-hora`, { method: 'POST', body: datos }),
    onSuccess: (c) => {
      queryClient.setQueryData(['usuarios', 'costos-hora', usuarioId], c)
      void queryClient.invalidateQueries({ queryKey: ['reportes'] })
    },
  })
}

export function useQuitarCostoHora(usuarioId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (costoId: string) => api<CostoHoraItem[]>(`/usuarios/${usuarioId}/costos-hora/${costoId}`, { method: 'DELETE' }),
    onSuccess: (c) => {
      queryClient.setQueryData(['usuarios', 'costos-hora', usuarioId], c)
      void queryClient.invalidateQueries({ queryKey: ['reportes'] })
    },
  })
}
