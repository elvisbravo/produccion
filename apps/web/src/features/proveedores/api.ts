import type { ListarProveedoresFiltros, Paginado, ProveedorDatos, ProveedorItem, TrabajoDetalle } from '@grupoes/shared'
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { clavesTrabajos } from '@/features/trabajos/api'
import { api } from '@/lib/api'

const aQuery = (filtros: object) => {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtros)) if (valor !== undefined && valor !== '') params.set(clave, String(valor))
  const texto = params.toString()
  return texto ? `?${texto}` : ''
}

export const clavesProveedores = {
  todos: ['proveedores'] as const,
  lista: (f: ListarProveedoresFiltros) => ['proveedores', 'lista', f] as const,
  uno: (id: string) => ['proveedores', 'detalle', id] as const,
}

export const proveedoresQuery = (f: ListarProveedoresFiltros) =>
  queryOptions({ queryKey: clavesProveedores.lista(f), queryFn: () => api<Paginado<ProveedorItem>>(`/proveedores${aQuery(f)}`), placeholderData: keepPreviousData })

export const proveedorQuery = (id: string) => queryOptions({ queryKey: clavesProveedores.uno(id), queryFn: () => api<ProveedorItem>(`/proveedores/${id}`) })

export function useGuardarProveedor(id: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datos: ProveedorDatos) => (id ? api<ProveedorItem>(`/proveedores/${id}`, { method: 'PUT', body: datos }) : api<ProveedorItem>('/proveedores', { method: 'POST', body: datos })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: clavesProveedores.todos }),
  })
}

export function useCambiarActivo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) => api<ProveedorItem>(`/proveedores/${id}/${activo ? 'activar' : 'desactivar'}`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: clavesProveedores.todos }),
  })
}

/** Registrar un trabajo de proveedor devuelve el trabajo creado: se refrescan las listas. */
export function useRegistrarTrabajoDeProveedor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datos: unknown) => api<TrabajoDetalle>('/trabajos/de-proveedor', { method: 'POST', body: datos }),
    onSuccess: (trabajo) => {
      queryClient.setQueryData(clavesTrabajos.detalle(trabajo.id), trabajo)
      void queryClient.invalidateQueries({ queryKey: clavesTrabajos.listas() })
      void queryClient.invalidateQueries({ queryKey: clavesProveedores.todos })
    },
  })
}
