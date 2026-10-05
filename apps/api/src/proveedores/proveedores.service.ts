import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ListarProveedoresConsulta, Paginado, ProveedorDatos, ProveedorItem } from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import { contieneDigitos, contieneTodas, digitosDe, MAX_COINCIDENCIAS, palabrasDe } from '../common/busqueda.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const errorCampo = (campo: string, mensaje: string) => new BadRequestException({ message: 'Datos inválidos', errores: [{ campo, mensaje }] });

interface Actor {
  usuarioId: string;
  ip: string | null;
}

type Fila = Prisma.ProveedorGetPayload<{ include: { _count: { select: { trabajos: true } } } }>;

/** Quienes entregan trabajos sin pasar por el embudo comercial. */
@Injectable()
export class ProveedoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private aItem(p: Fila): ProveedorItem {
    return { id: p.id, nombres: p.nombres, apellidos: p.apellidos, celular: p.celular, email: p.email, notas: p.notas, activo: p.activo, trabajos: p._count.trabajos };
  }

  /** Nombres, apellidos, celular o correo (sin distinguir tildes ni mayúsculas). */
  private async idsQueCoinciden(q: string): Promise<string[]> {
    const palabras = palabrasDe(q);
    const digitos = digitosDe(q);
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM proveedor p
      WHERE p.eliminado_en IS NULL AND (
        ${contieneTodas([Prisma.sql`p.nombres`, Prisma.sql`p.apellidos`, Prisma.sql`COALESCE(p.email, '')`], palabras)}
        OR ${contieneDigitos(Prisma.sql`COALESCE(p.celular, '')`, digitos)}
      )
      LIMIT ${MAX_COINCIDENCIAS}`;
    return filas.map((f) => f.id);
  }

  async listar({ q, estado, pagina, porPagina }: ListarProveedoresConsulta): Promise<Paginado<ProveedorItem>> {
    const where: Prisma.ProveedorWhereInput = {
      eliminadoEn: null,
      ...(estado !== 'todos' && { activo: estado === 'activos' }),
      ...(q ? { id: { in: await this.idsQueCoinciden(q) } } : {}),
    };
    const [total, filas] = await Promise.all([
      this.prisma.proveedor.count({ where }),
      this.prisma.proveedor.findMany({
        where,
        include: { _count: { select: { trabajos: { where: { eliminadoEn: null } } } } },
        orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);
    return { datos: filas.map((p) => this.aItem(p)), total, pagina, porPagina };
  }

  async obtener(id: string): Promise<ProveedorItem> {
    const p = await this.prisma.proveedor.findFirst({ where: { id, eliminadoEn: null }, include: { _count: { select: { trabajos: { where: { eliminadoEn: null } } } } } });
    if (!p) throw new NotFoundException('Proveedor no encontrado');
    return this.aItem(p);
  }

  private async verificarRepetido(nombres: string, apellidos: string, excepto?: string) {
    const repetidos = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM proveedor
      WHERE eliminado_en IS NULL AND f_unaccent(lower(nombres)) = f_unaccent(lower(${nombres})) AND f_unaccent(lower(apellidos)) = f_unaccent(lower(${apellidos}))
        ${excepto ? Prisma.sql`AND id <> ${excepto}::uuid` : Prisma.empty}`;
    if (repetidos.length) throw errorCampo('nombres', 'Ya existe un proveedor con ese nombre y apellidos');
  }

  async crear(datos: ProveedorDatos, actor: Actor): Promise<ProveedorItem> {
    await this.verificarRepetido(datos.nombres, datos.apellidos);
    const id = await this.prisma.$transaction(async (tx) => {
      const p = await tx.proveedor.create({
        data: { nombres: datos.nombres, apellidos: datos.apellidos, celular: datos.celular ?? null, email: datos.email ?? null, notas: datos.notas ?? null, creadoPor: actor.usuarioId },
        select: { id: true },
      });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'crear', entidad: 'proveedor', entidadId: p.id, despues: datos, ip: actor.ip }, tx);
      return p.id;
    });
    return this.obtener(id);
  }

  async editar(id: string, datos: ProveedorDatos, actor: Actor): Promise<ProveedorItem> {
    await this.obtener(id);
    await this.verificarRepetido(datos.nombres, datos.apellidos, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.proveedor.update({
        where: { id },
        data: { nombres: datos.nombres, apellidos: datos.apellidos, celular: datos.celular ?? null, email: datos.email ?? null, notas: datos.notas ?? null, actualizadoPor: actor.usuarioId },
      });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'editar', entidad: 'proveedor', entidadId: id, despues: datos, ip: actor.ip }, tx);
    });
    return this.obtener(id);
  }

  async cambiarActivo(id: string, activo: boolean, actor: Actor): Promise<ProveedorItem> {
    const p = await this.obtener(id);
    if (p.activo === activo) throw new ConflictException(activo ? 'El proveedor ya está activo' : 'El proveedor ya está inactivo');
    await this.prisma.$transaction(async (tx) => {
      await tx.proveedor.update({ where: { id }, data: { activo, actualizadoPor: actor.usuarioId } });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: activo ? 'activar' : 'desactivar', entidad: 'proveedor', entidadId: id, ip: actor.ip }, tx);
    });
    return this.obtener(id);
  }
}
