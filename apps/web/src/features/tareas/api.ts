import type {
  ActividadCatalogo,
  AsignarTareaDatos,
  CambiarEtapaDatos,
  CandidatosTarea,
  CatalogosProspecto,
  CompletarTareaDatos,
  EnlaceReunionDatos,
  EquipoReunionDatos,
  ImpactoReunion,
  ListarReunionesFiltros,
  ProgramarTareaDatos,
  ProspectoDetalle,
  ReprogramarTareaDatos,
  ResultadoCompletar,
  ReunionFila,
  TableroSeguimiento,
  TareaItem,
} from '@grupoes/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { catalogosProspectoQuery, clavesProspectos } from '@/features/prospectos/api'
import { usePermiso } from '@/lib/permisos'

export const clavesTareas = {
  todo: ['tareas'] as const,
  mias: ['tareas', 'mias'] as const,
  porAsignar: ['tareas', 'por-asignar'] as const,
  candidatos: (id: string) => ['tareas', 'candidatos', id] as const,
  actividades: (aplicaA?: string) => ['actividades', aplicaA ?? 'todas'] as const,
  tablero: ['seguimiento', 'tablero'] as const,
}

export const actividadesQuery = (aplicaA?: 'prospecto' | 'cliente') =>
  queryOptions({
    queryKey: clavesTareas.actividades(aplicaA),
    queryFn: () => api<ActividadCatalogo[]>(`/actividades${aplicaA ? `?aplicaA=${aplicaA}` : ''}`),
    staleTime: 5 * 60_000,
  })

export const misTareasQuery = queryOptions({
  queryKey: clavesTareas.mias,
  queryFn: () => api<TareaItem[]>('/tareas/mias'),
  refetchInterval: 60_000,
})

export const porAsignarQuery = queryOptions({
  queryKey: clavesTareas.porAsignar,
  queryFn: () => api<TareaItem[]>('/tareas/por-asignar'),
  refetchInterval: 60_000,
})

export const candidatosQuery = (tareaId: string) =>
  queryOptions({
    queryKey: clavesTareas.candidatos(tareaId),
    queryFn: () => api<CandidatosTarea>(`/tareas/${tareaId}/candidatos`),
    staleTime: 0,
  })

export const tableroQuery = queryOptions({
  queryKey: clavesTareas.tablero,
  queryFn: () => api<TableroSeguimiento>('/seguimiento/tablero'),
  refetchInterval: 60_000,
})

const SIN_CATALOGOS: Pick<CatalogosProspecto, 'resultadosContacto' | 'motivosPerdida'> = { resultadosContacto: [], motivosPerdida: [] }

/** Resultados de contacto y motivos de pérdida (solo si puede ver prospectos; el auxiliar no los necesita). */
export function useCatalogosSeguimiento() {
  const puede = usePermiso('prospectos.ver')
  const { data } = useQuery({ ...catalogosProspectoQuery, enabled: puede })
  return data ?? SIN_CATALOGOS
}

/** Cualquier cambio en tareas o etapas refresca las listas relacionadas. */
function useRefrescar() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: clavesTareas.todo })
    void queryClient.invalidateQueries({ queryKey: clavesTareas.tablero })
    void queryClient.invalidateQueries({ queryKey: clavesProspectos.todo })
  }
}

export function useProgramarTarea(prospectoId: string) {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (datos: ProgramarTareaDatos) => api<TareaItem>(`/prospectos/${prospectoId}/tareas`, { method: 'POST', body: datos }),
    onSuccess: refrescar,
  })
}

/** Programa una reunión a un cliente (un trabajo); refresca también la ficha del trabajo. */
export function useProgramarReunionDeTrabajo(trabajoId: string) {
  const refrescar = useRefrescar()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datos: ProgramarTareaDatos) => api<TareaItem>(`/trabajos/${trabajoId}/reuniones`, { method: 'POST', body: datos }),
    onSuccess: () => {
      refrescar()
      void queryClient.invalidateQueries({ queryKey: ['trabajos'] })
    },
  })
}

export function useAsignarTarea(tareaId: string) {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (datos: AsignarTareaDatos) => api<TareaItem>(`/tareas/${tareaId}/asignar`, { method: 'POST', body: datos }),
    onSuccess: refrescar,
  })
}

export function useCompletarTarea(tareaId: string) {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (datos: CompletarTareaDatos) => api<ResultadoCompletar>(`/tareas/${tareaId}/completar`, { method: 'POST', body: datos }),
    onSuccess: refrescar,
  })
}

export function useReprogramarTarea(tareaId: string) {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (datos: ReprogramarTareaDatos) => api<TareaItem>(`/tareas/${tareaId}/reprogramar`, { method: 'POST', body: datos }),
    onSuccess: refrescar,
  })
}

export function useCancelarTarea(tareaId: string) {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (motivo: string) => api<TareaItem>(`/tareas/${tareaId}/cancelar`, { method: 'POST', body: { motivo } }),
    onSuccess: refrescar,
  })
}

export function useCambiarEtapa() {
  const refrescar = useRefrescar()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ prospectoId, ...datos }: CambiarEtapaDatos & { prospectoId: string }) =>
      api<ProspectoDetalle>(`/prospectos/${prospectoId}/etapa`, { method: 'PATCH', body: datos }),
    // Movimiento optimista en el tablero: la tarjeta cambia de columna al soltarla.
    onMutate: async ({ prospectoId, etapaId }) => {
      await queryClient.cancelQueries({ queryKey: clavesTareas.tablero })
      const anterior = queryClient.getQueryData<TableroSeguimiento>(clavesTareas.tablero)
      if (anterior) {
        queryClient.setQueryData<TableroSeguimiento>(clavesTareas.tablero, {
          ...anterior,
          prospectos: anterior.prospectos.map((p) => (p.id === prospectoId ? { ...p, etapaId } : p)),
        })
      }
      return { anterior }
    },
    onError: (_error, _vars, contexto) => {
      if (contexto?.anterior) queryClient.setQueryData(clavesTareas.tablero, contexto.anterior)
    },
    onSettled: refrescar,
  })
}

/** La tabla de reuniones por días (las claves empiezan por «tareas»: reprogramar o cancelar la refrescan). */
export const reunionesQuery = (filtros: ListarReunionesFiltros) => {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtros)) if (valor) params.set(clave, String(valor))
  return queryOptions({
    queryKey: ['tareas', 'reuniones', filtros] as const,
    queryFn: ({ signal }) => api<ReunionFila[]>(`/reuniones?${params.toString()}`, { signal }),
    refetchInterval: 60_000,
  })
}

export function useGuardarEnlaceReunion(tareaId: string) {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (datos: EnlaceReunionDatos) => api<TareaItem>(`/tareas/${tareaId}/enlace-reunion`, { method: 'PUT', body: datos }),
    onSuccess: refrescar,
  })
}

/** El jefe de producción y el auxiliar de apoyo (opcional) de una reunión. */
export function useEquipoReunion(tareaId: string) {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (datos: EquipoReunionDatos) => api<TareaItem>(`/tareas/${tareaId}/equipo-reunion`, { method: 'PUT', body: datos }),
    onSuccess: refrescar,
  })
}

/** Qué se corre en la cola de esas personas si se les asigna la reunión (vacío si no se corre nada). */
export const impactoColaQuery = (tareaId: string, usuarioIds: string[]) =>
  queryOptions({
    queryKey: ['tareas', 'impacto-cola', tareaId, [...usuarioIds].sort().join(',')] as const,
    queryFn: () => api<ImpactoReunion[]>(`/tareas/${tareaId}/impacto-cola?usuarioIds=${usuarioIds.join(',')}`),
    enabled: usuarioIds.length > 0,
    staleTime: 0,
  })
