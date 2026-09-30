import { Injectable } from '@nestjs/common';
import type { CatalogosProspecto, Opcion } from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import { contieneTodas, palabrasDe } from '../common/busqueda.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type CatalogoBuscable = 'universidad' | 'carrera';

@Injectable()
export class CatalogosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async paraProspecto(): Promise<CatalogosProspecto> {
    const activo = { where: { activo: true } } as const;
    const [tiposTrabajo, prioridades, nivelesAcademicos, origenes, etapas] = await Promise.all([
      this.prisma.tipoTrabajo.findMany({ ...activo, orderBy: { orden: 'asc' }, select: { id: true, nombre: true, maxIntegrantes: true } }),
      this.prisma.prioridadTrabajo.findMany({
        ...activo,
        orderBy: { nivel: 'asc' },
        select: { id: true, nombre: true, nivel: true, color: true, porDefecto: true },
      }),
      this.prisma.nivelAcademico.findMany({ ...activo, orderBy: { orden: 'asc' }, select: { id: true, nombre: true } }),
      this.prisma.origenContacto.findMany({ ...activo, orderBy: { orden: 'asc' }, select: { id: true, nombre: true, esReferido: true } }),
      this.prisma.etapaProspecto.findMany({
        where: { activa: true },
        orderBy: { orden: 'asc' },
        select: { id: true, nombre: true, color: true, clase: true, orden: true, inicial: true },
      }),
    ]);
    return { tiposTrabajo, prioridades, nivelesAcademicos, origenes, etapas };
  }

  /** Búsqueda para autocompletar, sin distinguir tildes ni mayúsculas (en universidades, también por siglas). */
  async buscar(catalogo: CatalogoBuscable, q: string | undefined, limite: number): Promise<Opcion[]> {
    const palabras = palabrasDe(q ?? '');
    if (catalogo === 'universidad') {
      const filas = await this.prisma.$queryRaw<{ id: string; nombre: string; siglas: string | null }[]>`
        SELECT id, nombre, siglas FROM universidad
        WHERE activo AND (${palabras.length === 0} OR ${contieneTodas([Prisma.sql`nombre`, Prisma.sql`siglas`], palabras)})
        ORDER BY nombre LIMIT ${limite}`;
      return filas.map((u) => ({ id: u.id, nombre: u.siglas ? `${u.nombre} (${u.siglas})` : u.nombre }));
    }
    return this.prisma.$queryRaw<Opcion[]>`
      SELECT id, nombre FROM carrera
      WHERE activo AND (${palabras.length === 0} OR ${contieneTodas([Prisma.sql`nombre`], palabras)})
      ORDER BY nombre LIMIT ${limite}`;
  }

  /**
   * Agrega un valor al vuelo desde el formulario. Si ya existe uno igual
   * (sin distinguir tildes ni mayúsculas), devuelve el existente.
   */
  async crearSiNoExiste(catalogo: CatalogoBuscable, nombre: string, usuarioId: string): Promise<Opcion> {
    const limpio = nombre.replace(/\s+/g, ' ').trim();
    const tabla = catalogo === 'universidad' ? Prisma.sql`universidad` : Prisma.sql`carrera`;
    const [existente] = await this.prisma.$queryRaw<{ id: string; nombre: string; activo: boolean }[]>`
      SELECT id, nombre, activo FROM ${tabla} WHERE lower(f_unaccent(nombre)) = lower(f_unaccent(${limpio})) LIMIT 1`;

    if (existente) {
      if (!existente.activo) {
        const reactivar = { where: { id: existente.id }, data: { activo: true } };
        await (catalogo === 'universidad' ? this.prisma.universidad.update(reactivar) : this.prisma.carrera.update(reactivar));
      }
      return { id: existente.id, nombre: existente.nombre };
    }

    const datos = { data: { nombre: limpio, creadoPor: usuarioId }, select: { id: true, nombre: true } };
    const creado = await (catalogo === 'universidad' ? this.prisma.universidad.create(datos) : this.prisma.carrera.create(datos));
    await this.auditoria.registrar({ usuarioId, accion: 'crear', entidad: catalogo, entidadId: creado.id, despues: creado });
    return creado;
  }
}
