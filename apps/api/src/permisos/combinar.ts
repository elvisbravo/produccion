import type { Alcance, PermisoCodigo, PermisosEfectivos } from '@grupoes/shared';

const RANGO: Record<Alcance, number> = { propios: 1, equipo: 2, todos: 3 };

/** Devuelve el alcance más amplio de los dos. */
export function alcanceMayor(a: Alcance | null, b: Alcance | null): Alcance | null {
  if (a === null) return b;
  if (b === null) return a;
  return RANGO[a] >= RANGO[b] ? a : b;
}

export interface PermisoFuente {
  codigo: PermisoCodigo;
  usaAlcance: boolean;
  alcance: Alcance | null;
}

export interface ExcepcionUsuario extends PermisoFuente {
  tipo: 'conceder' | 'denegar';
}

/**
 * Calcula el permiso efectivo:
 * (unión de los permisos de sus roles + concedidos) − denegados.
 * Si hay varias fuentes, gana el alcance más amplio. La denegación siempre gana.
 */
export function combinarPermisos(deRoles: PermisoFuente[], excepciones: ExcepcionUsuario[]): PermisosEfectivos {
  const efectivos: PermisosEfectivos = {};

  const agregar = (p: PermisoFuente) => {
    // Una acción que usa alcance y no lo trae se interpreta como "propios" (lo más restrictivo).
    const alcance = p.usaAlcance ? (p.alcance ?? 'propios') : null;
    efectivos[p.codigo] = p.codigo in efectivos ? alcanceMayor(efectivos[p.codigo] ?? null, alcance) : alcance;
  };

  deRoles.forEach(agregar);
  excepciones.filter((e) => e.tipo === 'conceder').forEach(agregar);
  excepciones.filter((e) => e.tipo === 'denegar').forEach((e) => delete efectivos[e.codigo]);

  return efectivos;
}
