import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ROLES_BASE, type Alcance, type ItemMenu, type PermisoCodigo, type PermisosEfectivos } from '@grupoes/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { sincronizarCatalogo } from './catalogo.js';
import { combinarPermisos } from './combinar.js';

const CACHE_TTL_MS = 60_000;

@Injectable()
export class PermisosService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermisosService.name);
  private readonly cache = new Map<string, { permisos: PermisosEfectivos; expira: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await sincronizarCatalogo(this.prisma);
    this.logger.log('Catálogo de módulos y acciones sincronizado');
  }

  /** Permisos efectivos del usuario (con caché corta; se invalida al cambiar sus permisos). */
  async efectivos(usuarioId: string): Promise<PermisosEfectivos> {
    const enCache = this.cache.get(usuarioId);
    if (enCache && enCache.expira > Date.now()) return enCache.permisos;

    const permisos = await this.calcular(usuarioId);
    this.cache.set(usuarioId, { permisos, expira: Date.now() + CACHE_TTL_MS });
    return permisos;
  }

  invalidar(usuarioId?: string) {
    if (usuarioId) this.cache.delete(usuarioId);
    else this.cache.clear();
  }

  private async calcular(usuarioId: string): Promise<PermisosEfectivos> {
    const accionActiva = { vigente: true, modulo: { activo: true } } as const;
    const incluirAccion = { include: { modulo: { select: { codigo: true } } } } as const;

    const roles = await this.prisma.usuarioRol.findMany({
      where: { usuarioId, rol: { activo: true, eliminadoEn: null } },
      select: { rol: { select: { codigo: true } } },
    });

    // El Administrador siempre tiene todos los permisos, para no quedarse sin acceso.
    if (roles.some((r) => r.rol.codigo === ROLES_BASE.ADMIN)) {
      const acciones = await this.prisma.accion.findMany({ where: accionActiva, ...incluirAccion });
      return Object.fromEntries(
        acciones.map((a) => [`${a.modulo.codigo}.${a.codigo}`, a.usaAlcance ? ('todos' as Alcance) : null]),
      );
    }

    const [deRoles, excepciones] = await Promise.all([
      this.prisma.rolPermiso.findMany({
        where: { rol: { activo: true, eliminadoEn: null, usuarios: { some: { usuarioId } } }, accion: accionActiva },
        include: { accion: incluirAccion },
      }),
      this.prisma.usuarioPermiso.findMany({ where: { usuarioId, accion: accionActiva }, include: { accion: incluirAccion } }),
    ]);

    const codigo = (a: { codigo: string; modulo: { codigo: string } }) => `${a.modulo.codigo}.${a.codigo}` as PermisoCodigo;

    return combinarPermisos(
      deRoles.map((p) => ({ codigo: codigo(p.accion), usaAlcance: p.accion.usaAlcance, alcance: p.alcance })),
      excepciones.map((e) => ({ codigo: codigo(e.accion), usaAlcance: e.accion.usaAlcance, alcance: e.alcance, tipo: e.tipo })),
    );
  }

  /** Menú lateral: módulos visibles según el permiso "ver" (los grupos aparecen si tienen algún hijo visible). */
  async menu(permisos: PermisosEfectivos): Promise<ItemMenu[]> {
    const modulos = await this.prisma.modulo.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } });
    const puedeVer = (codigo: string) => `${codigo}.ver` in permisos;

    return modulos
      .filter((m) => m.padreId === null)
      .map((grupo) => ({
        codigo: grupo.codigo,
        nombre: grupo.nombre,
        ruta: grupo.ruta,
        icono: grupo.icono,
        hijos: modulos
          .filter((m) => m.padreId === grupo.id && puedeVer(m.codigo))
          .map((m) => ({ codigo: m.codigo, nombre: m.nombre, ruta: m.ruta, icono: m.icono, hijos: [] })),
      }))
      .filter((grupo) => grupo.hijos.length > 0);
  }
}
