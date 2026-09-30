import type {
  ArmarEquipoDatos,
  ConvertirProspectoDatos,
  ListarTrabajosFiltros,
  Paginado,
  PagoDatos,
  ResumenCobranza,
  TrabajoDetalle,
  TrabajoListadoItem,
  UsuarioResumen,
} from '@grupoes/shared'
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { clavesProspectos } from '@/features/prospectos/api'
import { clavesTareas } from '@/features/tareas/api'

export const clavesTrabajos = {
  todo: ['trabajos'] as const,
  listas: () => ['trabajos', 'lista'] as const,
  lista: (f: ListarTrabajosFiltros) => ['trabajos', 'lista', f] as const,
  detalle: (id: string) => ['trabajos', 'detalle', id] as const,
  candidatos: ['trabajos', 'candidatos-equipo'] as const,
  cobranza: ['contratos', 'cobranza'] as const,
}

const aQuery = (filtros: object) => {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtros)) if (valor !== undefined && valor !== '') params.set(clave, String(valor))
  const texto = params.toString()
  return texto ? `?${texto}` : ''
}

export const trabajosQuery = (filtros: ListarTrabajosFiltros) =>
  queryOptions({
    queryKey: clavesTrabajos.lista(filtros),
    queryFn: ({ signal }) => api<Paginado<TrabajoListadoItem>>(`/trabajos${aQuery(filtros)}`, { signal }),
    placeholderData: keepPreviousData,
  })

export const trabajoQuery = (id: string) =>
  queryOptions({ queryKey: clavesTrabajos.detalle(id), queryFn: ({ signal }) => api<TrabajoDetalle>(`/trabajos/${id}`, { signal }) })

export const candidatosEquipoQuery = queryOptions({
  queryKey: clavesTrabajos.candidatos,
  queryFn: () => api<{ auxiliares: UsuarioResumen[]; jefes: UsuarioResumen[] }>('/trabajos/candidatos-equipo'),
  staleTime: 60_000,
})

export const cobranzaQuery = queryOptions({
  queryKey: clavesTrabajos.cobranza,
  queryFn: () => api<ResumenCobranza>('/contratos/cobranza'),
})

/** Tras un cambio: el detalle queda con la respuesta y se refrescan las listas afectadas. */
function useGuardarDetalle() {
  const queryClient = useQueryClient()
  return (trabajo: TrabajoDetalle) => {
    queryClient.setQueryData(clavesTrabajos.detalle(trabajo.id), trabajo)
    void queryClient.invalidateQueries({ queryKey: clavesTrabajos.listas() })
    void queryClient.invalidateQueries({ queryKey: clavesTrabajos.cobranza })
  }
}

export function useConvertir(prospectoId: string) {
  const queryClient = useQueryClient()
  const guardar = useGuardarDetalle()
  return useMutation({
    mutationFn: (datos: ConvertirProspectoDatos) => api<TrabajoDetalle>(`/prospectos/${prospectoId}/convertir`, { method: 'POST', body: datos }),
    onSuccess: (trabajo) => {
      guardar(trabajo)
      void queryClient.invalidateQueries({ queryKey: clavesProspectos.todo })
      void queryClient.invalidateQueries({ queryKey: clavesTareas.todo })
      void queryClient.invalidateQueries({ queryKey: clavesTareas.tablero })
    },
  })
}

export function useArmarEquipo(trabajoId: string) {
  const guardar = useGuardarDetalle()
  return useMutation({
    mutationFn: (datos: ArmarEquipoDatos) => api<TrabajoDetalle>(`/trabajos/${trabajoId}/equipo`, { method: 'PUT', body: datos }),
    onSuccess: guardar,
  })
}

export function useRegistrarPago(contratoId: string) {
  const guardar = useGuardarDetalle()
  return useMutation({
    mutationFn: (datos: PagoDatos) => api<TrabajoDetalle>(`/contratos/${contratoId}/pagos`, { method: 'POST', body: datos }),
    onSuccess: guardar,
  })
}

export function useAnularPago() {
  const guardar = useGuardarDetalle()
  return useMutation({
    mutationFn: ({ pagoId, motivo }: { pagoId: string; motivo: string }) =>
      api<TrabajoDetalle>(`/pagos/${pagoId}/anular`, { method: 'POST', body: { motivo } }),
    onSuccess: guardar,
  })
}
