import type { ActividadAdmin, ActividadDatos, CatalogoActividades } from '@grupoes/shared'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const clavesCatalogos = { actividades: ['catalogos', 'actividades'] as const }

export const actividadesAdminQuery = queryOptions({ queryKey: clavesCatalogos.actividades, queryFn: () => api<CatalogoActividades>('/catalogos/actividades') })

/** Al cambiar el catálogo se refresca también lo que ofrece el formulario de programación. */
function useRefrescar() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: clavesCatalogos.actividades })
    void queryClient.invalidateQueries({ queryKey: ['actividades'] })
  }
}

export function useGuardarActividad(id: string | null) {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (datos: ActividadDatos) =>
      id ? api<ActividadAdmin>(`/catalogos/actividades/${id}`, { method: 'PUT', body: datos }) : api<ActividadAdmin>('/catalogos/actividades', { method: 'POST', body: datos }),
    onSuccess: refrescar,
  })
}

export function useCambiarActiva() {
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: ({ id, activa }: { id: string; activa: boolean }) => api<ActividadAdmin>(`/catalogos/actividades/${id}/${activa ? 'activar' : 'desactivar'}`, { method: 'POST' }),
    onSuccess: refrescar,
  })
}
