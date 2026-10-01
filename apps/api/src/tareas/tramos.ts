import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;
const minutosEntre = (inicio: Date, fin: Date) => Math.max(0, Math.round((fin.getTime() - inicio.getTime()) / 60_000));

/** Cierra tramos abiertos (al pausar, completar o cancelar una tarea, o por el cierre automático). */
export async function cerrarTramos(tx: Tx | PrismaService, where: Prisma.RegistroTiempoWhereInput, ahora = new Date(), autoCerrado = false): Promise<{ usuarioId: string; tareaId: string; minutos: number }[]> {
  const abiertos = await tx.registroTiempo.findMany({ where: { ...where, fin: null } });
  const cerrados: { usuarioId: string; tareaId: string; minutos: number }[] = [];
  for (const r of abiertos) {
    // Un tramo de menos de un minuto se descarta (se tocó iniciar y pausar sin querer).
    const fin = ahora.getTime() > r.inicio.getTime() ? ahora : null;
    const minutos = fin ? minutosEntre(r.inicio, fin) : 0;
    if (!fin || minutos === 0) {
      await tx.registroTiempo.delete({ where: { id: r.id } });
      continue;
    }
    await tx.registroTiempo.update({ where: { id: r.id }, data: { fin, minutos, autoCerrado } });
    cerrados.push({ usuarioId: r.usuarioId, tareaId: r.tareaId, minutos });
  }
  return cerrados;
}
