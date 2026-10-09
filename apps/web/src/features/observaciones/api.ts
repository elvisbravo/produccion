import type {
  ConfirmarObservacionFormulario,
  ConsultaPlazo,
  EstadoObservacion,
  ObservacionDetalle,
  ObservacionItem,
  PlazoEvaluado,
  ProgramarObservacionDatos,
  ValorarObservacionDatos,
} from '@grupoes/shared'
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const observacionesQuery = (estado: EstadoObservacion | 'abiertas') =>
  queryOptions({
    queryKey: ['observaciones', 'lista', estado] as const,
    queryFn: () => api<ObservacionItem[]>(estado === 'abiertas' ? '/observaciones' : `/observaciones?estado=${estado}`),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })

export const observacionQuery = (id: string) => queryOptions({ queryKey: ['observaciones', 'detalle', id] as const, queryFn: () => api<ObservacionDetalle>(`/observaciones/${id}`), staleTime: 0 })

export const plazoQuery = (id: string, c: ConsultaPlazo | null) =>
  queryOptions({
    queryKey: ['observaciones', 'plazo', id, c] as const,
    queryFn: () => api<PlazoEvaluado>(`/observaciones/${id}/plazo?minutos=${c!.minutos}&fecha=${c!.fecha}&hora=${c!.hora}`),
    enabled: c !== null,
    staleTime: 0,
  })

function useAccion<T>(hacer: (datos: T) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: hacer,
    onSuccess: () => {
      for (const queryKey of [['observaciones'], ['produccion'], ['tareas'], ['agenda'], ['notificaciones']]) void queryClient.invalidateQueries({ queryKey })
    },
  })
}

export const useTomarObservacion = () => useAccion((id: string) => api<ObservacionDetalle>(`/observaciones/${id}/tomar`, { method: 'POST', body: {} }))
export const useSoltarObservacion = () => useAccion((id: string) => api<ObservacionDetalle>(`/observaciones/${id}/soltar`, { method: 'POST', body: {} }))
export const useValorarObservacion = (id: string) => useAccion((datos: ValorarObservacionDatos) => api<ObservacionDetalle>(`/observaciones/${id}/valorar`, { method: 'POST', body: datos }))
export const useConfirmarObservacion = (id: string) => useAccion((datos: ConfirmarObservacionFormulario) => api<ObservacionDetalle>(`/observaciones/${id}/confirmar`, { method: 'POST', body: datos }))
export const useProgramarObservacion = (id: string) => useAccion((datos: ProgramarObservacionDatos) => api<ObservacionDetalle>(`/observaciones/${id}/programar`, { method: 'POST', body: datos }))
