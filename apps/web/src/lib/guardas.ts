import type { PermisoCodigo } from '@grupoes/shared'
import { notFound } from '@tanstack/react-router'
import { tienePermiso } from '@/lib/permisos'

/**
 * Para `beforeLoad` de una ruta: sin el permiso se muestra "no encontrado"
 * (no se revela que la página existe). La API valida igual por su cuenta.
 */
export function exigirPermiso(permiso: PermisoCodigo) {
  if (!tienePermiso(permiso)) throw notFound()
}
