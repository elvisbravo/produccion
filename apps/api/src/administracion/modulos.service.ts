import { Injectable } from '@nestjs/common';
import type { ModuloPermisos } from '@grupoes/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/** Vista de solo lectura de los módulos y de quién tiene cada acción (el catálogo vive en el código y se sincroniza al iniciar). */
@Injectable()
export class ModulosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(): Promise<ModuloPermisos[]> {
    const [modulos, rolPermisos, excepciones] = await Promise.all([
      this.prisma.modulo.findMany({
        orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
        include: { padre: { select: { nombre: true } }, acciones: { orderBy: { codigo: 'asc' } } },
      }),
      this.prisma.rolPermiso.findMany({
        where: { rol: { activo: true, eliminadoEn: null } },
        select: { accionId: true, alcance: true, rol: { select: { codigo: true, nombre: true } } },
      }),
      this.prisma.usuarioPermiso.groupBy({ by: ['accionId', 'tipo'], _count: { _all: true } }),
    ]);
    return modulos
      .filter((m) => m.acciones.length > 0)
      .map((m) => ({
        codigo: m.codigo,
        nombre: m.nombre,
        grupo: m.padre?.nombre ?? null,
        ruta: m.ruta,
        activo: m.activo,
        acciones: m.acciones.map((a) => ({
          permiso: `${m.codigo}.${a.codigo}`,
          nombre: a.nombre,
          usaAlcance: a.usaAlcance,
          vigente: a.vigente,
          roles: rolPermisos
            .filter((p) => p.accionId === a.id)
            .map((p) => ({ codigo: p.rol.codigo, nombre: p.rol.nombre, alcance: p.alcance }))
            .sort((x, y) => x.nombre.localeCompare(y.nombre)),
          concedidas: excepciones.find((e) => e.accionId === a.id && e.tipo === 'conceder')?._count._all ?? 0,
          denegadas: excepciones.find((e) => e.accionId === a.id && e.tipo === 'denegar')?._count._all ?? 0,
        })),
      }));
  }
}
