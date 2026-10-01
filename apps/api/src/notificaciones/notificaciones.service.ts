import { Injectable, Logger } from '@nestjs/common';
import type { BandejaNotificaciones, NotificacionItem, PermisoCodigo } from '@grupoes/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificacionesGateway } from './notificaciones.gateway.js';

export interface NuevaNotificacion {
  tipo: string;
  titulo: string;
  mensaje?: string | null;
  enlace?: string | null;
  /** Para avisos automáticos: no se repite si ya existe para ese usuario. */
  clave?: string;
}

const aItem = (n: { id: string; tipo: string; titulo: string; mensaje: string | null; enlace: string | null; leidaEn: Date | null; creadaEn: Date }): NotificacionItem => ({
  id: n.id,
  tipo: n.tipo,
  titulo: n.titulo,
  mensaje: n.mensaje,
  enlace: n.enlace,
  leida: n.leidaEn !== null,
  creadaEn: n.creadaEn.toISOString(),
});

/**
 * Guarda notificaciones y las envía en vivo a quien esté conectado.
 * Se llama después de confirmar la operación (fuera de la transacción), para no avisar de algo que se revirtió.
 * Un fallo al notificar nunca rompe la operación principal.
 */
@Injectable()
export class NotificacionesService {
  private readonly log = new Logger(NotificacionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificacionesGateway,
  ) {}

  /** Notifica a varias personas (sin repetir y sin avisarle al autor de la acción). */
  async notificar(destinos: (string | null | undefined)[], n: NuevaNotificacion, autorId?: string): Promise<void> {
    const usuarios = [...new Set(destinos.filter((d): d is string => Boolean(d) && d !== autorId))];
    if (usuarios.length === 0) return;
    try {
      const creadas = await this.prisma.notificacion.createManyAndReturn({
        data: usuarios.map((usuarioId) => ({
          usuarioId,
          tipo: n.tipo,
          titulo: n.titulo.slice(0, 200),
          mensaje: n.mensaje ?? null,
          enlace: n.enlace ?? null,
          clave: n.clave ?? null,
        })),
        skipDuplicates: true,
      });
      for (const c of creadas) this.gateway.emitir(c.usuarioId, aItem(c));
    } catch (error) {
      this.log.error(`No se pudo notificar "${n.tipo}": ${(error as Error).message}`);
    }
  }

  // ─── Destinatarios ───────────────────────────────────────

  /** Usuarios activos con un permiso efectivo (por rol o concedido), menos los que lo tienen denegado. */
  async conPermiso(permiso: PermisoCodigo): Promise<string[]> {
    const [modulo, codigo] = permiso.split('.');
    const accion = { modulo: { codigo: modulo }, codigo };
    const filas = await this.prisma.usuario.findMany({
      where: {
        activo: true,
        eliminadoEn: null,
        OR: [
          { roles: { some: { rol: { activo: true, permisos: { some: { accion } } } } } },
          { permisos: { some: { tipo: 'conceder', accion } } },
        ],
        NOT: { permisos: { some: { tipo: 'denegar', accion } } },
      },
      select: { id: true },
    });
    return filas.map((f) => f.id);
  }

  async conRol(rolId: string): Promise<string[]> {
    const filas = await this.prisma.usuarioRol.findMany({ where: { rolId, usuario: { activo: true, eliminadoEn: null } }, select: { usuarioId: true } });
    return filas.map((f) => f.usuarioId);
  }

  // ─── Bandeja ─────────────────────────────────────────────

  async bandeja(usuarioId: string): Promise<BandejaNotificaciones> {
    const [items, noLeidas] = await Promise.all([
      this.prisma.notificacion.findMany({ where: { usuarioId }, orderBy: { creadaEn: 'desc' }, take: 50 }),
      this.prisma.notificacion.count({ where: { usuarioId, leidaEn: null } }),
    ]);
    return { items: items.map(aItem), noLeidas };
  }

  async marcarLeida(id: string, usuarioId: string): Promise<void> {
    await this.prisma.notificacion.updateMany({ where: { id, usuarioId, leidaEn: null }, data: { leidaEn: new Date() } });
  }

  async marcarTodas(usuarioId: string): Promise<void> {
    await this.prisma.notificacion.updateMany({ where: { usuarioId, leidaEn: null }, data: { leidaEn: new Date() } });
  }
}
