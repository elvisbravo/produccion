import type { Alcance, PermisoCodigo } from '@grupoes/shared'
import { useSesion } from '@/stores/sesion'

/** true si el usuario tiene el permiso. */
export function usePermiso(permiso: PermisoCodigo): boolean {
  return useSesion((s) => Boolean(s.usuario && permiso in s.usuario.permisos))
}

/** Alcance del permiso ('propios' | 'equipo' | 'todos'), null si la acción no usa alcance, undefined si no lo tiene. */
export function useAlcance(permiso: PermisoCodigo): Alcance | null | undefined {
  return useSesion((s) => s.usuario?.permisos[permiso])
}

/** Versión fuera de React (para beforeLoad de las rutas). */
export function tienePermiso(permiso: PermisoCodigo): boolean {
  const usuario = useSesion.getState().usuario
  return Boolean(usuario && permiso in usuario.permisos)
}
