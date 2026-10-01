import type {
  AplicarReasignacionDatos,
  EjecutarUrgenteDatos,
  HoraExtraItem,
  ImpactoUrgente,
  PlanReasignacion,
  ProponerExtraDatos,
  ResumenExtras,
  SolicitudUrgenteItem,
  TopesExtra,
  VistaExtras,
} from '@grupoes/shared'
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const clavesContingencias = {
  urgentes: ['urgentes'] as const,
  deTrabajo: (id: string) => ['urgentes', 'trabajo', id] as const,
  impacto: (id: string, usuarioId: string) => ['urgentes', 'impacto', id, usuarioId] as const,
  reasignacion: (ausenciaId: string) => ['ausencias', 'reasignacion', ausenciaId] as const,
  extras: (vista: VistaExtras, desde: string, hasta: string) => ['horas-extra', vista, desde, hasta] as const,
}

export const urgentesQuery = queryOptions({ queryKey: clavesContingencias.urgentes, queryFn: () => api<SolicitudUrgenteItem[]>('/urgentes') })

export const urgentesDeTrabajoQuery = (trabajoId: string) =>
  queryOptions({ queryKey: clavesContingencias.deTrabajo(trabajoId), queryFn: () => api<SolicitudUrgenteItem[]>(`/trabajos/${trabajoId}/urgentes`) })

export const impactoQuery = (id: string, usuarioId: string) =>
  queryOptions({
    queryKey: clavesContingencias.impacto(id, usuarioId),
    queryFn: () => api<ImpactoUrgente>(`/urgentes/${id}/impacto?usuarioId=${usuarioId}`),
    staleTime: 0,
  })

export const reasignacionQuery = (ausenciaId: string) =>
  queryOptions({ queryKey: clavesContingencias.reasignacion(ausenciaId), queryFn: () => api<PlanReasignacion>(`/ausencias/${ausenciaId}/reasignacion`), staleTime: 0 })

export const extrasQuery = (vista: VistaExtras, desde: string, hasta: string) =>
  queryOptions({
    queryKey: clavesContingencias.extras(vista, desde, hasta),
    queryFn: () => api<ResumenExtras>(`/horas-extra?vista=${vista}&desde=${desde}&hasta=${hasta}`),
    placeholderData: keepPreviousData,
  })

/** Las contingencias mueven colas, agendas, trabajos, tareas y ausencias. */
function useRefrescar() {
  const queryClient = useQueryClient()
  return () => {
    for (const queryKey of [['urgentes'], ['produccion'], ['agenda'], ['tareas'], ['trabajos'], ['ausencias'], ['horas-extra']]) {
      void queryClient.invalidateQueries({ queryKey })
    }
  }
}

function useAccion<T, R>(hacer: (datos: T) => Promise<R>) {
  const refrescar = useRefrescar()
  return useMutation({ mutationFn: hacer, onSuccess: () => refrescar() })
}

export const useSolicitarUrgente = (trabajoId: string) =>
  useAccion((motivo: string) => api<SolicitudUrgenteItem>(`/trabajos/${trabajoId}/urgente`, { method: 'POST', body: { motivo } }))

export const useEjecutarUrgente = (id: string) =>
  useAccion((datos: EjecutarUrgenteDatos) => api<SolicitudUrgenteItem>(`/urgentes/${id}/ejecutar`, { method: 'POST', body: datos }))

export const useRechazarUrgente = (id: string) =>
  useAccion((observacion: string) => api<SolicitudUrgenteItem>(`/urgentes/${id}/rechazar`, { method: 'POST', body: { observacion } }))

export const useAplicarReasignacion = (ausenciaId: string) =>
  useAccion((datos: AplicarReasignacionDatos) => api<{ reasignadas: number }>(`/ausencias/${ausenciaId}/reasignacion`, { method: 'POST', body: datos }))

export const useProponerExtra = () => useAccion((datos: ProponerExtraDatos) => api<HoraExtraItem>('/horas-extra', { method: 'POST', body: datos }))

export const useAccionExtra = () =>
  useAccion(({ id, accion, cuerpo }: { id: string; accion: 'responder' | 'aprobar' | 'realizar' | 'anular'; cuerpo?: object }) =>
    api<HoraExtraItem>(`/horas-extra/${id}/${accion}`, { method: 'POST', body: cuerpo ?? {} }),
  )

export const useGuardarTopes = () => useAccion((datos: TopesExtra) => api<TopesExtra>('/horas-extra/topes', { method: 'PUT', body: datos }))
