import type {
  AuditoriaItem,
  ClaveTemporal,
  CrearUsuarioDatos,
  EditarUsuarioDatos,
  ExcepcionPermisoDatos,
  ListarAuditoriaFiltros,
  ListarUsuariosFiltros,
  MatrizRolDatos,
  Paginado,
  ParametroItem,
  RolDatos,
  RolDetalle,
  RolItem,
  TopesUsuario,
  UsuarioDetalle,
  UsuarioListadoItem,
} from '@grupoes/shared'
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

const aQuery = (filtros: object) => {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtros)) if (valor !== undefined && valor !== '') params.set(clave, String(valor))
  const texto = params.toString()
  return texto ? `?${texto}` : ''
}

export const clavesAdmin = {
  usuarios: ['usuarios'] as const,
  listaUsuarios: (f: ListarUsuariosFiltros) => ['usuarios', 'lista', f] as const,
  usuario: (id: string) => ['usuarios', 'detalle', id] as const,
  roles: ['roles'] as const,
  rol: (id: string) => ['roles', id] as const,
  parametros: ['parametros'] as const,
  auditoria: (f: ListarAuditoriaFiltros) => ['auditoria', f] as const,
}

export const usuariosQuery = (f: ListarUsuariosFiltros) =>
  queryOptions({ queryKey: clavesAdmin.listaUsuarios(f), queryFn: () => api<UsuarioListadoItem[]>(`/usuarios${aQuery(f)}`), placeholderData: keepPreviousData })
export const usuarioQuery = (id: string) => queryOptions({ queryKey: clavesAdmin.usuario(id), queryFn: () => api<UsuarioDetalle>(`/usuarios/${id}`) })
export const rolesQuery = queryOptions({ queryKey: clavesAdmin.roles, queryFn: () => api<RolItem[]>('/roles'), staleTime: 30_000 })
export const rolQuery = (id: string) => queryOptions({ queryKey: clavesAdmin.rol(id), queryFn: () => api<RolDetalle>(`/roles/${id}`) })
export const parametrosQuery = queryOptions({ queryKey: clavesAdmin.parametros, queryFn: () => api<ParametroItem[]>('/parametros') })
export const auditoriaQuery = (f: ListarAuditoriaFiltros) =>
  queryOptions({
    queryKey: clavesAdmin.auditoria(f),
    queryFn: () => api<Paginado<AuditoriaItem> & { entidades: string[] }>(`/auditoria${aQuery(f)}`),
    placeholderData: keepPreviousData,
  })

/** Toda acción sobre un usuario devuelve su detalle: se guarda y se refrescan las listas. */
function useAccionUsuario<T>(id: string, hacer: (datos: T) => Promise<UsuarioDetalle>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: hacer,
    onSuccess: (u) => {
      queryClient.setQueryData(clavesAdmin.usuario(id), u)
      void queryClient.invalidateQueries({ queryKey: ['usuarios', 'lista'] })
      void queryClient.invalidateQueries({ queryKey: clavesAdmin.roles })
    },
  })
}

export function useCrearUsuario() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datos: CrearUsuarioDatos) => api<ClaveTemporal>('/usuarios', { method: 'POST', body: datos }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: clavesAdmin.usuarios }),
  })
}

export const useEditarUsuario = (id: string) => useAccionUsuario(id, (d: EditarUsuarioDatos) => api<UsuarioDetalle>(`/usuarios/${id}`, { method: 'PUT', body: d }))
export const useActivarUsuario = (id: string) =>
  useAccionUsuario(id, (activo: boolean) => api<UsuarioDetalle>(`/usuarios/${id}/${activo ? 'activar' : 'desactivar'}`, { method: 'POST' }))
export const useRolesUsuario = (id: string) => useAccionUsuario(id, (rolIds: string[]) => api<UsuarioDetalle>(`/usuarios/${id}/roles`, { method: 'PUT', body: { rolIds } }))
export const useGuardarExcepcion = (id: string) =>
  useAccionUsuario(id, (d: ExcepcionPermisoDatos) => api<UsuarioDetalle>(`/usuarios/${id}/excepciones`, { method: 'POST', body: d }))
export const useQuitarExcepcion = (id: string) =>
  useAccionUsuario(id, (excepcionId: string) => api<UsuarioDetalle>(`/usuarios/${id}/excepciones/${excepcionId}`, { method: 'DELETE' }))
export const useDesbloquear = (id: string) => useAccionUsuario(id, () => api<UsuarioDetalle>(`/usuarios/${id}/desbloquear`, { method: 'POST' }))
export const useTopesUsuario = (id: string) =>
  useAccionUsuario(id, (t: TopesUsuario) => api<UsuarioDetalle>(`/usuarios/${id}/topes-horas-extra`, { method: 'PUT', body: t }))

export function useRestablecerClave(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<ClaveTemporal>(`/usuarios/${id}/restablecer-clave`, { method: 'POST' }),
    onSuccess: (r) => queryClient.setQueryData(clavesAdmin.usuario(id), r.usuario),
  })
}

function useAccionRol<T>(hacer: (datos: T) => Promise<RolDetalle>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: hacer,
    onSuccess: (r) => {
      queryClient.setQueryData(clavesAdmin.rol(r.id), r)
      void queryClient.invalidateQueries({ queryKey: clavesAdmin.roles, exact: true })
      void queryClient.invalidateQueries({ queryKey: clavesAdmin.usuarios })
    },
  })
}

export const useCrearRol = () => useAccionRol((d: RolDatos) => api<RolDetalle>('/roles', { method: 'POST', body: d }))
export const useEditarRol = (id: string) => useAccionRol((d: RolDatos) => api<RolDetalle>(`/roles/${id}`, { method: 'PUT', body: d }))
export const useMatrizRol = (id: string) => useAccionRol((d: MatrizRolDatos) => api<RolDetalle>(`/roles/${id}/permisos`, { method: 'PUT', body: d }))

export function useEliminarRol(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>(`/roles/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: clavesAdmin.roles }),
  })
}

export function useGuardarParametros() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (valores: Record<string, number | null>) => api<ParametroItem[]>('/parametros', { method: 'PUT', body: { valores } }),
    onSuccess: (p) => queryClient.setQueryData(clavesAdmin.parametros, p),
  })
}
