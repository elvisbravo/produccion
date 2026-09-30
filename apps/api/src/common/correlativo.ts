import type { Prisma } from '../generated/prisma/client.js';

/**
 * Siguiente código legible de una serie para el año actual (hora de Lima): P-2026-0001.
 * El incremento es atómico (INSERT … ON CONFLICT), así dos altas simultáneas no repiten número.
 */
export async function siguienteCodigo(tx: Prisma.TransactionClient, serie: string): Promise<string> {
  const anio = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Lima' }).format(new Date()));
  const [{ ultimo }] = await tx.$queryRaw<{ ultimo: number }[]>`
    INSERT INTO "correlativo" ("serie", "anio", "ultimo") VALUES (${serie}, ${anio}, 1)
    ON CONFLICT ("serie", "anio") DO UPDATE SET "ultimo" = "correlativo"."ultimo" + 1
    RETURNING "ultimo"`;
  return `${serie}-${anio}-${String(ultimo).padStart(4, '0')}`;
}
