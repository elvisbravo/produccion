import { MODULOS, type Alcance, type ModuloDef } from '@grupoes/shared'

export const NOMBRE_ALCANCE: Record<Alcance, string> = { propios: 'Propios', equipo: 'Equipo', todos: 'Todos' }

/** Grupos del menú con sus módulos (solo los que tienen acciones). */
export const GRUPOS_PERMISOS = (MODULOS as readonly ModuloDef[])
  .filter((m) => !m.padre)
  .map((g) => ({ grupo: g, modulos: (MODULOS as readonly ModuloDef[]).filter((m) => m.padre === g.codigo && m.acciones.length > 0) }))
  .filter((g) => g.modulos.length > 0)

const porCodigo = new Map<string, { modulo: string; accion: string; usaAlcance: boolean }>(
  (MODULOS as readonly ModuloDef[]).flatMap((m) => m.acciones.map((a) => [`${m.codigo}.${a.codigo}`, { modulo: m.nombre, accion: a.nombre, usaAlcance: Boolean(a.usaAlcance) }] as const)),
)

/** "prospectos.editar" → { modulo: "Prospectos", accion: "Editar", usaAlcance: true } */
export function describirPermiso(codigo: string) {
  return porCodigo.get(codigo) ?? { modulo: codigo.split('.')[0], accion: codigo.split('.')[1] ?? codigo, usaAlcance: false }
}

/** Todas las acciones, para elegir una (excepciones por usuario). */
export const OPCIONES_PERMISO = GRUPOS_PERMISOS.flatMap(({ modulos }) =>
  modulos.flatMap((m) => m.acciones.map((a) => ({ codigo: `${m.codigo}.${a.codigo}`, etiqueta: `${m.nombre} · ${a.nombre}`, usaAlcance: Boolean(a.usaAlcance) }))),
)
