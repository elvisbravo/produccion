import type {
  ApoyoTarea,
  AplicarReasignacionDatos,
  CambiarInicioDatos,
  CanjearHorasDatos,
  CargaPersona,
  ImpactoCarga,
  RepartoCargaDatos,
  EjecutarUrgenteDatos,
  HoraExtraItem,
  ImpactoReparto,
  ImpactoUrgente,
  PlanReasignacion,
  ProponerExtraDatos,
  ProponerApoyoFormulario,
  ResumenExtras,
  PropuestaUrgente,
  ResumenBolsa,
  RepartoUrgente,
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
  propuesta: (id: string) => ['urgentes', 'propuesta', id] as const,
  reparto: (id: string, reparto: RepartoUrgente) => ['urgentes', 'reparto', id, reparto] as const,
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

/** Entregables de la urgencia, quién puede tomar cada uno y el reparto sugerido. */
export const propuestaQuery = (id: string) =>
  queryOptions({ queryKey: clavesContingencias.propuesta(id), queryFn: () => api<PropuestaUrgente>(`/urgentes/${id}/propuesta`), staleTime: 0 })

/** Simulación de un reparto: no cambia nada, solo muestra cómo quedan las colas. */
export const repartoQuery = (id: string, reparto: RepartoUrgente) =>
  queryOptions({
    queryKey: clavesContingencias.reparto(id, reparto),
    queryFn: () => api<ImpactoReparto>(`/urgentes/${id}/simular`, { method: 'POST', body: { reparto } }),
    staleTime: 0,
  })

export const reasignacionQuery = (ausenciaId: string) =>
  queryOptions({ queryKey: clavesContingencias.reasignacion(ausenciaId), queryFn: () => api<PlanReasignacion>(`/ausencias/${ausenciaId}/reasignacion`), staleTime: 0 })

/** Quién puede tomar una tarea que no llega y con qué (horario normal, horas extra o bono). */
export const apoyoQuery = (tareaId: string) => queryOptions({ queryKey: ['produccion', 'apoyo', tareaId], queryFn: () => api<ApoyoTarea>(`/produccion/tareas/${tareaId}/apoyo`), staleTime: 0 })

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

export const useReasignarTarea = (tareaId: string) =>
  useAccion((datos: { usuarioId: string; motivo?: string }) => api<void>(`/produccion/tareas/${tareaId}/reasignar`, { method: 'POST', body: datos }))

export const useProponerApoyo = (tareaId: string) =>
  useAccion((datos: ProponerApoyoFormulario) => api<HoraExtraItem>(`/produccion/tareas/${tareaId}/apoyo`, { method: 'POST', body: datos }))

/** Los trabajos que una persona tiene en su cola, cuánto falta de cada uno y a quién podrían pasar. */
export const cargaQuery = (usuarioId: string, foco?: { trabajoId: string; tareaId?: string }) =>
  queryOptions({
    queryKey: ['produccion', 'carga', usuarioId, foco ?? null],
    queryFn: () => api<CargaPersona>(`/produccion/carga/${usuarioId}${foco ? `?trabajoId=${foco.trabajoId}${foco.tareaId ? `&tareaId=${foco.tareaId}` : ''}` : ''}`),
    staleTime: 0,
  })

/** Simulación: cómo queda la cola de quien recibe. No cambia nada. */
export const impactoCargaQuery = (usuarioId: string, reparto: RepartoCargaDatos['reparto']) =>
  queryOptions({
    queryKey: ['produccion', 'carga', usuarioId, 'simular', reparto],
    queryFn: () => api<ImpactoCarga>(`/produccion/carga/${usuarioId}/simular`, { method: 'POST', body: { reparto } }),
    staleTime: 0,
  })

export const useAplicarCarga = (usuarioId: string) =>
  useAccion((datos: RepartoCargaDatos) => api<{ tareas: number }>(`/produccion/carga/${usuarioId}/aplicar`, { method: 'POST', body: datos }))

/** Cambia desde qué día y hora se programa una actividad de la cola. */
export const useCambiarInicio = (tareaId: string) =>
  useAccion((datos: CambiarInicioDatos) => api<void>(`/produccion/tareas/${tareaId}/inicio`, { method: 'PUT', body: datos }))

/** La bolsa de horas extra acumuladas de cada persona (o la propia). */
export const bolsaQuery = queryOptions({ queryKey: ['horas-extra', 'bolsa'] as const, queryFn: () => api<ResumenBolsa>('/horas-extra/bolsa'), staleTime: 0 })

export const useCanjearHoras = (usuarioId: string) => useAccion((datos: CanjearHorasDatos) => api<void>(`/horas-extra/bolsa/${usuarioId}/canjear`, { method: 'POST', body: datos }))

export const useAnularCanje = () => useAccion((id: string) => api<void>(`/horas-extra/bolsa/canjes/${id}/anular`, { method: 'POST', body: {} }))
