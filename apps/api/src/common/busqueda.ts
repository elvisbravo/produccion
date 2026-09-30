import { Prisma } from '../generated/prisma/client.js';

/** Escapa los comodines de LIKE para que el texto se busque literal. */
const escaparLike = (texto: string) => texto.replace(/[\\%_]/g, (c) => `\\${c}`);

export const palabrasDe = (q: string) => q.trim().split(/\s+/).filter(Boolean).slice(0, 6);
export const digitosDe = (q: string) => q.replace(/\D/g, '');

/**
 * Condición SQL: cada palabra debe aparecer (sin distinguir tildes ni mayúsculas)
 * en alguna de las columnas, unidas con espacios. Requiere f_unaccent (migración busqueda_sin_tildes).
 */
export function contieneTodas(columnas: Prisma.Sql[], palabras: string[]): Prisma.Sql {
  if (palabras.length === 0) return Prisma.sql`FALSE`;
  const texto = Prisma.sql`f_unaccent(concat_ws(' ', ${Prisma.join(columnas, ', ')}))`;
  return Prisma.join(
    palabras.map((p) => Prisma.sql`${texto} ILIKE f_unaccent(${`%${escaparLike(p)}%`})`),
    ' AND ',
  );
}

/** Condición SQL: la columna contiene la secuencia de dígitos (celulares y documentos). */
export function contieneDigitos(columna: Prisma.Sql, digitos: string): Prisma.Sql {
  return digitos.length >= 3 ? Prisma.sql`${columna} LIKE ${`%${digitos}%`}` : Prisma.sql`FALSE`;
}

/** Tope de coincidencias que se filtran luego con Prisma (suficiente para búsquedas interactivas). */
export const MAX_COINCIDENCIAS = 1000;
