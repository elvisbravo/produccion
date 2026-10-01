import type {
  BandejaEntregable,
  ColaPersona,
  EntregableDatos,
  EntregarDatos,
  RespuestaClienteDatos,
  RevisarEntregableDatos,
  TareaEntregableDatos,
  TareaItem,
  TrabajoDetalle,
  VistaBandeja,
} from '@grupoes/shared'
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { clavesTrabajos } from '@/features/trabajos/api'

export const clavesProduccion = {
  colas: ['produccion', 'colas'] as const,
  miCola: ['produccion', 'colas', 'mia'] as const,
  bandeja: (vista: VistaBandeja) => ['produccion', 'entregables', vista] as const,
}

export const colasQuery = queryOptions({ queryKey: clavesProduccion.colas, queryFn: () => api<ColaPersona[]>('/produccion/colas') })
export const miColaQuery = queryOptions({ queryKey: clavesProduccion.miCola, queryFn: () => api<ColaPersona>('/produccion/colas/mia') })
export const bandejaQuery = (vista: VistaBandeja) =>
  queryOptions({
    queryKey: clavesProduccion.bandeja(vista),
    queryFn: () => api<BandejaEntregable[]>(`/entregables?vista=${vista}`),
    placeholderData: keepPreviousData,
  })

/** Cualquier cambio en producción mueve colas, agendas, bandejas y tareas. */
function useRefrescar() {
  const queryClient = useQueryClient()
  return (trabajo?: TrabajoDetalle) => {
    if (trabajo) queryClient.setQueryData(clavesTrabajos.detalle(trabajo.id), trabajo)
    for (const queryKey of [['produccion'], ['agenda'], ['tareas'], clavesTrabajos.listas()]) void queryClient.invalidateQueries({ queryKey })
  }
}

/** Acción sobre un trabajo o entregable que devuelve el trabajo actualizado. */
function useAccion<T>(hacer: (datos: T) => Promise<TrabajoDetalle>) {
  const refrescar = useRefrescar()
  return useMutation({ mutationFn: hacer, onSuccess: (trabajo) => refrescar(trabajo) })
}

export const useGenerarPlan = (trabajoId: string) => useAccion(() => api<TrabajoDetalle>(`/trabajos/${trabajoId}/plan`, { method: 'POST' }))

export const useCrearEntregable = (trabajoId: string) =>
  useAccion((datos: EntregableDatos) => api<TrabajoDetalle>(`/trabajos/${trabajoId}/entregables`, { method: 'POST', body: datos }))

export const useEditarEntregable = (id: string) => useAccion((datos: EntregableDatos) => api<TrabajoDetalle>(`/entregables/${id}`, { method: 'PUT', body: datos }))

export const useEliminarEntregable = (id: string) => useAccion(() => api<TrabajoDetalle>(`/entregables/${id}`, { method: 'DELETE' }))

export const useAgregarTarea = (entregableId: string) =>
  useAccion((datos: TareaEntregableDatos) => api<TrabajoDetalle>(`/entregables/${entregableId}/tareas`, { method: 'POST', body: datos }))

export const useEnviarRevision = (id: string) => useAccion(() => api<TrabajoDetalle>(`/entregables/${id}/enviar-revision`, { method: 'POST' }))

export const useRevisar = (id: string) =>
  useAccion((datos: RevisarEntregableDatos) => api<TrabajoDetalle>(`/entregables/${id}/revisar`, { method: 'POST', body: datos }))

export const useEntregar = (id: string) => useAccion((datos: EntregarDatos) => api<TrabajoDetalle>(`/entregables/${id}/entregar`, { method: 'POST', body: datos }))

export const useRespuestaCliente = (id: string) =>
  useAccion((datos: RespuestaClienteDatos) => api<TrabajoDetalle>(`/entregables/${id}/respuesta-cliente`, { method: 'POST', body: datos }))

export function useReordenarCola(usuarioId: string) {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (tareaIds: string[]) => api<void>(`/produccion/colas/${usuarioId}/orden`, { method: 'PUT', body: { tareaIds } }),
    onSettled: () => refrescar(),
  })
}

export function useOrdenSugerido(usuarioId: string) {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: () => api<void>(`/produccion/colas/${usuarioId}/orden-sugerido`, { method: 'POST' }),
    onSuccess: () => refrescar(),
  })
}

export function useIniciarTarea() {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (tareaId: string) => api<TareaItem>(`/tareas/${tareaId}/iniciar`, { method: 'POST' }),
    onSuccess: () => refrescar(),
  })
}

export function useCompletarTareaCola() {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: ({ tareaId, resultado }: { tareaId: string; resultado?: string }) =>
      api<unknown>(`/tareas/${tareaId}/completar`, { method: 'POST', body: { resultado } }),
    onSuccess: () => refrescar(),
  })
}
