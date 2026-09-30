import type {
  AgendaEquipo,
  AgendaPersona,
  AusenciaItem,
  DatosPersonalDatos,
  EstadoAusencia,
  FeriadoDatos,
  FeriadoItem,
  HorarioUsuarioDatos,
  PersonalItem,
  PlantillaHorarioDatos,
  PlantillaHorarioItem,
  RegistrarAusenciaDatos,
  SolicitarAusenciaDatos,
  UsuarioResumen,
} from '@grupoes/shared'
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const clavesAgenda = {
  agenda: ['agenda'] as const,
  mia: (desde: string, hasta: string) => ['agenda', 'mia', desde, hasta] as const,
  equipo: (desde: string, hasta: string, rol?: string) => ['agenda', 'equipo', desde, hasta, rol ?? 'todos'] as const,
  usuario: (id: string, desde: string, hasta: string) => ['agenda', 'usuario', id, desde, hasta] as const,
  ausencias: ['ausencias'] as const,
  listaAusencias: (f: FiltrosAusencias) => ['ausencias', 'lista', f] as const,
  personasAusencia: ['ausencias', 'personas'] as const,
  feriados: (anio: number) => ['calendario', 'feriados', anio] as const,
  plantillas: ['calendario', 'plantillas'] as const,
  personal: ['calendario', 'personal'] as const,
}

export interface FiltrosAusencias {
  estado?: EstadoAusencia
}

export const agendaMiaQuery = (desde: string, hasta: string) =>
  queryOptions({
    queryKey: clavesAgenda.mia(desde, hasta),
    queryFn: ({ signal }) => api<AgendaPersona>(`/agenda/mia?desde=${desde}&hasta=${hasta}`, { signal }),
    placeholderData: keepPreviousData,
  })

export const agendaEquipoQuery = (desde: string, hasta: string, rol?: string) =>
  queryOptions({
    queryKey: clavesAgenda.equipo(desde, hasta, rol),
    queryFn: ({ signal }) => api<AgendaEquipo>(`/agenda/equipo?desde=${desde}&hasta=${hasta}${rol ? `&rol=${rol}` : ''}`, { signal }),
    placeholderData: keepPreviousData,
  })

export const agendaUsuarioQuery = (id: string, desde: string, hasta: string) =>
  queryOptions({
    queryKey: clavesAgenda.usuario(id, desde, hasta),
    queryFn: ({ signal }) => api<AgendaPersona>(`/agenda/usuarios/${id}?desde=${desde}&hasta=${hasta}`, { signal }),
    placeholderData: keepPreviousData,
  })

export const ausenciasQuery = (f: FiltrosAusencias) =>
  queryOptions({
    queryKey: clavesAgenda.listaAusencias(f),
    queryFn: ({ signal }) => api<AusenciaItem[]>(`/ausencias${f.estado ? `?estado=${f.estado}` : ''}`, { signal }),
    placeholderData: keepPreviousData,
  })

export const personasAusenciaQuery = queryOptions({
  queryKey: clavesAgenda.personasAusencia,
  queryFn: () => api<UsuarioResumen[]>('/ausencias/personas'),
  staleTime: 60_000,
})

export const feriadosQuery = (anio: number) =>
  queryOptions({ queryKey: clavesAgenda.feriados(anio), queryFn: () => api<FeriadoItem[]>(`/calendario/feriados?anio=${anio}`) })

export const plantillasQuery = queryOptions({ queryKey: clavesAgenda.plantillas, queryFn: () => api<PlantillaHorarioItem[]>('/calendario/plantillas') })

export const personalQuery = queryOptions({ queryKey: clavesAgenda.personal, queryFn: () => api<PersonalItem[]>('/calendario/personal') })

/** Cualquier cambio de calendario o ausencias cambia la disponibilidad: se refresca todo lo relacionado. */
function useRefrescar() {
  const queryClient = useQueryClient()
  return (...claves: (readonly unknown[])[]) => {
    for (const queryKey of [clavesAgenda.agenda, ...claves]) void queryClient.invalidateQueries({ queryKey })
    // Los candidatos de las tareas muestran la disponibilidad.
    void queryClient.invalidateQueries({ queryKey: ['tareas', 'candidatos'] })
  }
}

export function useSolicitarAusencia() {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (datos: SolicitarAusenciaDatos) => api<AusenciaItem>('/ausencias/solicitar', { method: 'POST', body: datos }),
    onSuccess: () => refrescar(clavesAgenda.ausencias),
  })
}

export function useRegistrarAusencia() {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (datos: RegistrarAusenciaDatos) => api<AusenciaItem>('/ausencias', { method: 'POST', body: datos }),
    onSuccess: () => refrescar(clavesAgenda.ausencias),
  })
}

export function useResolverAusencia() {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: ({ id, accion, observacion }: { id: string; accion: 'aprobar' | 'rechazar' | 'anular'; observacion?: string }) =>
      api<AusenciaItem>(`/ausencias/${id}/${accion}`, { method: 'POST', body: { observacion } }),
    onSuccess: () => refrescar(clavesAgenda.ausencias),
  })
}

export function useGuardarFeriado() {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: ({ id, datos }: { id: string | null; datos: FeriadoDatos }) =>
      api<FeriadoItem>(id ? `/calendario/feriados/${id}` : '/calendario/feriados', { method: id ? 'PUT' : 'POST', body: datos }),
    onSuccess: () => refrescar(['calendario', 'feriados']),
  })
}

export function useEliminarFeriado() {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/calendario/feriados/${id}`, { method: 'DELETE' }),
    onSuccess: () => refrescar(['calendario', 'feriados']),
  })
}

export function useGuardarPlantilla() {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: ({ id, datos }: { id: string | null; datos: PlantillaHorarioDatos }) =>
      api<PlantillaHorarioItem>(id ? `/calendario/plantillas/${id}` : '/calendario/plantillas', { method: id ? 'PUT' : 'POST', body: datos }),
    onSuccess: () => refrescar(clavesAgenda.plantillas, clavesAgenda.personal),
  })
}

export function useGuardarHorario(usuarioId: string) {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (datos: HorarioUsuarioDatos) => api<PersonalItem>(`/calendario/personal/${usuarioId}/horario`, { method: 'PUT', body: datos }),
    onSuccess: () => refrescar(clavesAgenda.personal, clavesAgenda.plantillas),
  })
}

export function useAnularHorario(usuarioId: string) {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (horarioId: string) => api<PersonalItem>(`/calendario/personal/${usuarioId}/horario/${horarioId}`, { method: 'DELETE' }),
    onSuccess: () => refrescar(clavesAgenda.personal),
  })
}

export function useGuardarDatosPersonal(usuarioId: string) {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (datos: DatosPersonalDatos) => api<PersonalItem>(`/calendario/personal/${usuarioId}`, { method: 'PATCH', body: datos }),
    onSuccess: () => refrescar(clavesAgenda.personal),
  })
}
