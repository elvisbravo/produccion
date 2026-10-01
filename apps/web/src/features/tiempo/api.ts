import type { ReporteTiempos, TiempoActivo, TiempoManualDatos, TiemposDeTarea } from '@grupoes/shared'
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const clavesTiempo = {
  activo: ['tiempo', 'activo'] as const,
  deTarea: (id: string) => ['tiempo', 'tarea', id] as const,
  reporte: (desde: string, hasta: string) => ['reportes', 'tiempos', desde, hasta] as const,
}

export const tiempoActivoQuery = queryOptions({
  queryKey: clavesTiempo.activo,
  queryFn: async () => (await api<{ activo: TiempoActivo | null }>('/tiempo/activo')).activo,
  refetchOnWindowFocus: true,
})

export const tiemposTareaQuery = (id: string) => queryOptions({ queryKey: clavesTiempo.deTarea(id), queryFn: () => api<TiemposDeTarea>(`/tareas/${id}/tiempo`) })

export const reporteTiemposQuery = (desde: string, hasta: string) =>
  queryOptions({
    queryKey: clavesTiempo.reporte(desde, hasta),
    queryFn: () => api<ReporteTiempos>(`/reportes/tiempos?desde=${desde}&hasta=${hasta}`),
    placeholderData: keepPreviousData,
  })

/** El tiempo cambia la tarea, la cola y la agenda (lo que falta se replanifica). */
function useRefrescar() {
  const queryClient = useQueryClient()
  return () => {
    for (const queryKey of [['tiempo'], ['tareas'], ['produccion'], ['agenda'], ['trabajos']]) void queryClient.invalidateQueries({ queryKey })
  }
}

export function useIniciarCronometro() {
  const queryClient = useQueryClient()
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (tareaId: string) => api<TiempoActivo>(`/tareas/${tareaId}/cronometro/iniciar`, { method: 'POST' }),
    onSuccess: (activo) => {
      queryClient.setQueryData(clavesTiempo.activo, activo)
      refrescar()
    },
  })
}

export function usePausarCronometro() {
  const queryClient = useQueryClient()
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (tareaId: string) => api<void>(`/tareas/${tareaId}/cronometro/pausar`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.setQueryData(clavesTiempo.activo, null)
      refrescar()
    },
  })
}

export function useTiempoManual(tareaId: string) {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (datos: TiempoManualDatos) => api<TiemposDeTarea>(`/tareas/${tareaId}/tiempo`, { method: 'POST', body: datos }),
    onSuccess: () => refrescar(),
  })
}

export function useQuitarTiempo(tareaId: string) {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (registroId: string) => api<TiemposDeTarea>(`/tareas/${tareaId}/tiempo/${registroId}`, { method: 'DELETE' }),
    onSuccess: () => refrescar(),
  })
}
