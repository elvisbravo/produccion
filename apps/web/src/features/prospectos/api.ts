import type {
  CatalogosProspecto,
  CoincidenciaPersona,
  ListarProspectosFiltros,
  Opcion,
  Paginado,
  PersonaResumen,
  ProspectoDatos,
  ProspectoDetalle,
  ProspectoListadoItem,
} from '@grupoes/shared'
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const clavesProspectos = {
  todo: ['prospectos'] as const,
  listas: () => [...clavesProspectos.todo, 'lista'] as const,
  lista: (filtros: ListarProspectosFiltros) => [...clavesProspectos.listas(), filtros] as const,
  detalle: (id: string) => [...clavesProspectos.todo, 'detalle', id] as const,
  catalogos: ['catalogos', 'prospecto'] as const,
}

const aQuery = (filtros: object) => {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== '' && valor !== null) params.set(clave, String(valor))
  }
  const texto = params.toString()
  return texto ? `?${texto}` : ''
}

export const catalogosProspectoQuery = queryOptions({
  queryKey: clavesProspectos.catalogos,
  queryFn: () => api<CatalogosProspecto>('/catalogos/prospecto'),
  staleTime: 5 * 60_000,
})

export const prospectosQuery = (filtros: ListarProspectosFiltros) =>
  queryOptions({
    queryKey: clavesProspectos.lista(filtros),
    queryFn: ({ signal }) => api<Paginado<ProspectoListadoItem>>(`/prospectos${aQuery(filtros)}`, { signal }),
    placeholderData: keepPreviousData,
  })

export const prospectoQuery = (id: string) =>
  queryOptions({
    queryKey: clavesProspectos.detalle(id),
    queryFn: ({ signal }) => api<ProspectoDetalle>(`/prospectos/${id}`, { signal }),
  })

export function useGuardarProspecto(id?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datos: ProspectoDatos) =>
      id
        ? api<ProspectoDetalle>(`/prospectos/${id}`, { method: 'PATCH', body: datos })
        : api<ProspectoDetalle>('/prospectos', { method: 'POST', body: datos }),
    onSuccess: (prospecto) => {
      queryClient.setQueryData(clavesProspectos.detalle(prospecto.id), prospecto)
      void queryClient.invalidateQueries({ queryKey: clavesProspectos.listas() })
    },
  })
}

export const buscarPorCelular = (celular: string, signal?: AbortSignal) =>
  api<{ coincidencia: CoincidenciaPersona | null }>(`/personas/por-celular/${encodeURIComponent(celular)}`, { signal })

export const buscarPersonas = (q: string, signal?: AbortSignal) =>
  api<PersonaResumen[]>(`/personas${aQuery({ q })}`, { signal })

export type CatalogoBuscable = 'universidades' | 'carreras'

export const buscarCatalogo = (catalogo: CatalogoBuscable, q: string, signal?: AbortSignal) =>
  api<Opcion[]>(`/catalogos/${catalogo}${aQuery({ q })}`, { signal })

export const crearEnCatalogo = (catalogo: CatalogoBuscable, nombre: string) =>
  api<Opcion>(`/catalogos/${catalogo}`, { method: 'POST', body: { nombre } })
