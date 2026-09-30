import { diaEnLima, diaSemanaDe, sumarDias } from '@grupoes/shared';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Próximo día de lunes a viernes que no es feriado, para programar reuniones sin
 * avisos de agenda (así las pruebas no dependen del día en que se ejecutan).
 */
export async function proximoDiaHabil(prisma: PrismaService, desde = diaEnLima()): Promise<string> {
  const feriados = new Set(
    (await prisma.feriado.findMany({ where: { fecha: { gt: new Date(`${desde}T00:00:00Z`) } }, select: { fecha: true } })).map((f) =>
      f.fecha.toISOString().slice(0, 10),
    ),
  );
  let dia = sumarDias(desde, 1);
  while (diaSemanaDe(dia) > 5 || feriados.has(dia)) dia = sumarDias(dia, 1);
  return dia;
}
