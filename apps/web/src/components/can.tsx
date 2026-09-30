import type { PermisoCodigo } from '@grupoes/shared'
import type { ReactNode } from 'react'
import { usePermiso } from '@/lib/permisos'

/**
 * Muestra su contenido solo si el usuario tiene el permiso.
 * Es comodidad visual: la validación real la hace la API.
 */
export function Can({ permiso, children, fallback = null }: { permiso: PermisoCodigo; children: ReactNode; fallback?: ReactNode }) {
  return usePermiso(permiso) ? children : fallback
}
