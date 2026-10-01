import type {
  ConfiguracionDocumentos,
  ConfiguracionDocumentosDatos,
  CotizacionDatos,
  CotizacionListadoItem,
  CotizacionResumen,
  DocumentoContrato,
  DocumentoCotizacion,
  DocumentoRecibo,
  ListarCotizacionesFiltros,
  Paginado,
} from '@grupoes/shared'
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { clavesProspectos } from '@/features/prospectos/api'
import { clavesTareas } from '@/features/tareas/api'
import { api } from '@/lib/api'

export const clavesDocumentos = {
  cotizaciones: ['cotizaciones'] as const,
  lista: (f: ListarCotizacionesFiltros) => ['cotizaciones', 'lista', f] as const,
  deProspecto: (prospectoId: string) => ['cotizaciones', 'prospecto', prospectoId] as const,
  configuracion: ['documentos', 'configuracion'] as const,
}

const aQuery = (filtros: object) => {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtros)) if (valor !== undefined && valor !== '') params.set(clave, String(valor))
  const texto = params.toString()
  return texto ? `?${texto}` : ''
}

export const cotizacionesQuery = (filtros: ListarCotizacionesFiltros) =>
  queryOptions({
    queryKey: clavesDocumentos.lista(filtros),
    queryFn: ({ signal }) => api<Paginado<CotizacionListadoItem>>(`/cotizaciones${aQuery(filtros)}`, { signal }),
    placeholderData: keepPreviousData,
  })

export const cotizacionesProspectoQuery = (prospectoId: string) =>
  queryOptions({
    queryKey: clavesDocumentos.deProspecto(prospectoId),
    queryFn: ({ signal }) => api<CotizacionResumen[]>(`/prospectos/${prospectoId}/cotizaciones`, { signal }),
  })

export const configuracionDocumentosQuery = queryOptions({
  queryKey: clavesDocumentos.configuracion,
  queryFn: () => api<ConfiguracionDocumentos>('/documentos/configuracion'),
})

// Los documentos se piden al abrir la hoja para imprimir: siempre con los datos del momento.
export const documentoCotizacionQuery = (id: string) =>
  queryOptions({ queryKey: ['documentos', 'cotizacion', id] as const, queryFn: () => api<DocumentoCotizacion>(`/documentos/cotizacion/${id}`), staleTime: 0 })
export const documentoContratoQuery = (trabajoId: string) =>
  queryOptions({ queryKey: ['documentos', 'contrato', trabajoId] as const, queryFn: () => api<DocumentoContrato>(`/documentos/contrato/${trabajoId}`), staleTime: 0 })
export const documentoReciboQuery = (pagoId: string) =>
  queryOptions({ queryKey: ['documentos', 'recibo', pagoId] as const, queryFn: () => api<DocumentoRecibo>(`/documentos/recibo/${pagoId}`), staleTime: 0 })

/** Una cotización cambia el monto cotizado, la etapa y la línea de tiempo del prospecto. */
function useRefrescarProspecto() {
  const queryClient = useQueryClient()
  return (prospectoId: string) => {
    void queryClient.invalidateQueries({ queryKey: clavesDocumentos.cotizaciones })
    void queryClient.invalidateQueries({ queryKey: clavesProspectos.detalle(prospectoId) })
    void queryClient.invalidateQueries({ queryKey: clavesProspectos.listas() })
    void queryClient.invalidateQueries({ queryKey: clavesTareas.tablero })
  }
}

export function useCrearCotizacion(prospectoId: string) {
  const refrescar = useRefrescarProspecto()
  return useMutation({
    mutationFn: (datos: CotizacionDatos) => api<CotizacionResumen>(`/prospectos/${prospectoId}/cotizaciones`, { method: 'POST', body: datos }),
    onSuccess: () => refrescar(prospectoId),
  })
}

export function useAnularCotizacion(prospectoId: string) {
  const refrescar = useRefrescarProspecto()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => api<CotizacionResumen>(`/cotizaciones/${id}/anular`, { method: 'POST', body: { motivo } }),
    onSuccess: () => refrescar(prospectoId),
  })
}

export function useGuardarConfiguracionDocumentos() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datos: ConfiguracionDocumentosDatos) => api<ConfiguracionDocumentos>('/documentos/configuracion', { method: 'PUT', body: datos }),
    onSuccess: (c) => queryClient.setQueryData(clavesDocumentos.configuracion, c),
  })
}
