import type {
  AdicionalDatos,
  ArmarEquipoDatos,
  ConsultaEntregasFiltros,
  ConvertirProspectoDatos,
  ListarTrabajosFiltros,
  NotaEntregaDatos,
  Paginado,
  PagoDatos,
  ResumenCobranza,
  TableroEntregas,
  TrabajoDetalle,
  TrabajoListadoItem,
  UsuarioResumen,
  VistaPreviaInicio,
  ValorarTrabajoDatos,
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
  asistentes: ['trabajos', 'asistentes-administrativas'] as const,
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

/** Asistentes administrativas, para filtrar el listado de trabajos. */
export const asistentesQuery = queryOptions({
  queryKey: clavesTrabajos.asistentes,
  queryFn: () => api<UsuarioResumen[]>('/trabajos/asistentes-administrativas'),
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

// ─── Adicionales ────────────────────────────────────────────

export function useProponerAdicional(contratoId: string) {
  const guardar = useGuardarDetalle()
  return useMutation({
    mutationFn: (datos: AdicionalDatos) => api<TrabajoDetalle>(`/contratos/${contratoId}/adicionales`, { method: 'POST', body: datos }),
    onSuccess: guardar,
  })
}

/** Aceptar, rechazar (con motivo) o anular (con motivo) un adicional. */
export function useResponderAdicional() {
  const guardar = useGuardarDetalle()
  return useMutation({
    mutationFn: ({ id, accion, motivo }: { id: string; accion: 'aceptar' | 'rechazar' | 'anular'; motivo?: string }) =>
      api<TrabajoDetalle>(`/adicionales/${id}/${accion}`, { method: 'POST', body: motivo ? { motivo } : {} }),
    onSuccess: guardar,
  })
}

// ─── Trabajo en espera del cliente ──────────────────────────

/** Pausar o reanudar cambia la cola de producción, la agenda y las tareas de quienes lo siguen. */
function useRefrescarCola() {
  const queryClient = useQueryClient()
  return () => {
    for (const queryKey of [['produccion'], ['agenda'], ['tareas'], ['urgentes']]) void queryClient.invalidateQueries({ queryKey })
  }
}

export function usePausarTrabajo(trabajoId: string) {
  const guardar = useGuardarDetalle()
  const refrescar = useRefrescarCola()
  return useMutation({
    mutationFn: (motivo: string) => api<TrabajoDetalle>(`/trabajos/${trabajoId}/pausar`, { method: 'POST', body: { motivo } }),
    onSuccess: (trabajo) => {
      guardar(trabajo)
      refrescar()
    },
  })
}

export function useReanudarTrabajo(trabajoId: string) {
  const guardar = useGuardarDetalle()
  const refrescar = useRefrescarCola()
  return useMutation({
    mutationFn: (nota?: string) => api<TrabajoDetalle>(`/trabajos/${trabajoId}/reanudar`, { method: 'POST', body: { nota } }),
    onSuccess: (trabajo) => {
      guardar(trabajo)
      refrescar()
    },
  })
}

// ─── Fechas inamovibles ─────────────────────────────────────

export function useFijarFechas(trabajoId: string) {
  const guardar = useGuardarDetalle()
  return useMutation({
    mutationFn: (motivo: string) => api<TrabajoDetalle>(`/trabajos/${trabajoId}/fechas-fijas`, { method: 'POST', body: { motivo } }),
    onSuccess: guardar,
  })
}

export function useLiberarFechas(trabajoId: string) {
  const guardar = useGuardarDetalle()
  return useMutation({
    mutationFn: () => api<TrabajoDetalle>(`/trabajos/${trabajoId}/fechas-fijas`, { method: 'DELETE' }),
    onSuccess: guardar,
  })
}

// ─── Valoración en una reunión ──────────────────────────────

export function useValorarTrabajo(trabajoId: string) {
  const guardar = useGuardarDetalle()
  return useMutation({
    mutationFn: (datos: ValorarTrabajoDatos) => api<TrabajoDetalle>(`/trabajos/${trabajoId}/valoracion`, { method: 'POST', body: datos }),
    onSuccess: guardar,
  })
}

// ─── Cobro de un trabajo de proveedor ───────────────────────

export function useRegistrarCobro(trabajoId: string) {
  const guardar = useGuardarDetalle()
  return useMutation({
    mutationFn: (datos: unknown) => api<TrabajoDetalle>(`/trabajos/${trabajoId}/cobro`, { method: 'POST', body: datos }),
    onSuccess: guardar,
  })
}

// ─── Cliente que ya trabaja con nosotros (alta directa) ─────

export const responsablesClienteDirectoQuery = queryOptions({ queryKey: ['trabajos', 'cliente-directo', 'responsables'], queryFn: () => api<UsuarioResumen[]>('/trabajos/cliente-directo/responsables'), staleTime: 60_000 })

export function useRegistrarClienteDirecto() {
  const guardar = useGuardarDetalle()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datos: unknown) => api<TrabajoDetalle>('/trabajos/cliente-directo', { method: 'POST', body: datos }),
    onSuccess: (trabajo) => {
      guardar(trabajo)
      void queryClient.invalidateQueries({ queryKey: clavesProspectos.todo })
    },
  })
}

// ─── Reprogramar la entrega y editar los datos ──────────────

export function useReprogramarTrabajo(trabajoId: string) {
  const guardar = useGuardarDetalle()
  const refrescar = useRefrescarCola()
  return useMutation({
    mutationFn: (datos: unknown) => api<TrabajoDetalle>(`/trabajos/${trabajoId}/reprogramar`, { method: 'POST', body: datos }),
    onSuccess: (trabajo) => {
      guardar(trabajo)
      refrescar()
    },
  })
}

export function useEditarTrabajo(trabajoId: string) {
  const guardar = useGuardarDetalle()
  return useMutation({
    mutationFn: (datos: unknown) => api<TrabajoDetalle>(`/trabajos/${trabajoId}/datos`, { method: 'PUT', body: datos }),
    onSuccess: guardar,
  })
}

/** Tablero de entregas por día (la hoja de control del equipo). */
export const entregasQuery = (filtros: ConsultaEntregasFiltros) => {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtros)) if (valor) params.set(clave, String(valor))
  return queryOptions({
    queryKey: ['trabajos', 'entregas', filtros] as const,
    queryFn: ({ signal }) => api<TableroEntregas>(`/entregas?${params.toString()}`, { signal }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })
}

export function useGuardarNotaEntrega(trabajoId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datos: NotaEntregaDatos) => api<void>(`/trabajos/${trabajoId}/nota-entrega`, { method: 'PUT', body: datos }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['trabajos'] }),
  })
}

/** Cómo quedaría la primera actividad del auxiliar: a continuación de lo que tiene o a hora fija sin cruces. */
export const vistaPreviaInicioQuery = (p: { auxiliarId: string; fecha: string; hora: string; minutos: number; fijo: boolean; limite?: string }) =>
  queryOptions({
    queryKey: ['trabajos', 'cliente-directo', 'vista-previa-inicio', p] as const,
    queryFn: ({ signal }) => api<VistaPreviaInicio>(`/trabajos/cliente-directo/vista-previa-inicio?${new URLSearchParams({ auxiliarId: p.auxiliarId, fecha: p.fecha, hora: p.hora, minutos: String(p.minutos), fijo: String(p.fijo), ...(p.limite && { limite: p.limite }) })}`, { signal }),
    staleTime: 0,
  })
