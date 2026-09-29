import { MODULOS, type ModuloDef } from '@grupoes/shared';
import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * Sincroniza el catálogo de módulos y acciones del código con la base de datos.
 * Crea lo nuevo, actualiza nombres y orden, y marca como no vigentes las
 * acciones que ya no existen (no las borra, para no perder asignaciones).
 */
export async function sincronizarCatalogo(prisma: PrismaClient): Promise<void> {
  const modulos: readonly ModuloDef[] = MODULOS;
  const idPorCodigo = new Map<string, string>();

  // Primero los módulos sin padre, luego los hijos.
  const ordenados = [...modulos].sort((a, b) => Number(Boolean(a.padre)) - Number(Boolean(b.padre)));

  for (const m of ordenados) {
    const padreId = m.padre ? idPorCodigo.get(m.padre) : null;
    if (m.padre && !padreId) throw new Error(`Módulo padre no encontrado: ${m.padre}`);

    const datos = { nombre: m.nombre, padreId: padreId ?? null, ruta: m.ruta ?? null, icono: m.icono ?? null, orden: m.orden };
    const modulo = await prisma.modulo.upsert({
      where: { codigo: m.codigo },
      create: { codigo: m.codigo, ...datos },
      update: datos,
    });
    idPorCodigo.set(m.codigo, modulo.id);

    for (const a of m.acciones) {
      const datosAccion = { nombre: a.nombre, usaAlcance: a.usaAlcance ?? false, vigente: true };
      await prisma.accion.upsert({
        where: { moduloId_codigo: { moduloId: modulo.id, codigo: a.codigo } },
        create: { moduloId: modulo.id, codigo: a.codigo, ...datosAccion },
        update: datosAccion,
      });
    }

    await prisma.accion.updateMany({
      where: { moduloId: modulo.id, codigo: { notIn: m.acciones.map((a) => a.codigo) } },
      data: { vigente: false },
    });
  }
}
