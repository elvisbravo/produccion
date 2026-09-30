import type { ItemMenu } from '@grupoes/shared'

export interface ModuloUbicado {
  grupo: ItemMenu
  modulo: ItemMenu
}

/** Busca el módulo del menú que corresponde a una ruta (p. ej. /prospectos/123 → Prospectos). */
export function ubicarModulo(menu: ItemMenu[], pathname: string): ModuloUbicado | null {
  for (const grupo of menu) {
    for (const modulo of grupo.hijos) {
      if (modulo.ruta && (pathname === modulo.ruta || pathname.startsWith(`${modulo.ruta}/`))) {
        return { grupo, modulo }
      }
    }
  }
  return null
}

/** Parámetro de la ruta comodín para enlazar a un módulo por su ruta. */
export const splat = (ruta: string) => ({ _splat: ruta.replace(/^\//, '') })

export function iniciales(nombres: string, apellidos: string): string {
  return `${nombres.trim()[0] ?? ''}${apellidos.trim()[0] ?? ''}`.toUpperCase()
}
