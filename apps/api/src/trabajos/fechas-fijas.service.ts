import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { TrabajoDetalle } from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TrabajosService, type ActorTrabajo } from './trabajos.service.js';

/**
 * Un trabajo con fechas inamovibles (por prioridad: debe entregarse sí o sí en su fecha). Mientras lo esté no se
 * editan las fechas de sus entregables, no se reprograman sus tareas, sus tareas no se dejan detrás de otras en la
 * cola y una urgencia no puede atrasarlas sin que alguien con permiso lo acepte de forma expresa.
 */
@Injectable()
export class FechasFijasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trabajos: TrabajosService,
    private readonly auditoria: AuditoriaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  private async interesados(trabajoId: string): Promise<string[]> {
    const t = await this.prisma.trabajo.findUniqueOrThrow({
      where: { id: trabajoId },
      select: { prospecto: { select: { responsableId: true } }, equipo: { where: { hasta: null }, select: { usuarioId: true } } },
    });
    return [t.prospecto.responsableId, ...t.equipo.map((e) => e.usuarioId)];
  }

  private async trabajo(trabajoId: string, usuarioId: string) {
    await this.trabajos.verificarVisible(trabajoId, usuarioId);
    const t = await this.prisma.trabajo.findFirst({ where: { id: trabajoId, eliminadoEn: null }, select: { id: true, codigo: true, estado: true, fechasFijas: true } });
    if (!t) throw new NotFoundException('Trabajo no encontrado');
    return t;
  }

  async fijar(trabajoId: string, motivo: string, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    const t = await this.trabajo(trabajoId, actor.usuarioId);
    if (t.estado === 'finalizado' || t.estado === 'cancelado') throw new BadRequestException('El trabajo ya está cerrado');
    if (t.fechasFijas) throw new BadRequestException('Las fechas de este trabajo ya están fijadas');
    await this.prisma.$transaction(async (tx) => {
      await tx.trabajo.update({ where: { id: trabajoId }, data: { fechasFijas: true, fechasFijasMotivo: motivo, fechasFijasPorId: actor.usuarioId, fechasFijasEn: new Date(), actualizadoPor: actor.usuarioId } });
      await tx.trabajoEvento.create({ data: { trabajoId, tipo: 'estado', detalle: `Fechas inamovibles: ${motivo}`, usuarioId: actor.usuarioId } });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'fijar_fechas', entidad: 'trabajo', entidadId: trabajoId, despues: { motivo }, ip: actor.ip }, tx);
    });
    await this.notificaciones.notificar(
      await this.interesados(trabajoId),
      { tipo: 'trabajo.fechas_fijas', titulo: `${t.codigo} tiene fechas inamovibles`, mensaje: motivo, enlace: `/trabajos/${trabajoId}` },
      actor.usuarioId,
    );
    return this.trabajos.obtener(trabajoId, actor.usuarioId);
  }

  async liberar(trabajoId: string, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    const t = await this.trabajo(trabajoId, actor.usuarioId);
    if (!t.fechasFijas) throw new BadRequestException('Las fechas de este trabajo no están fijadas');
    await this.prisma.$transaction(async (tx) => {
      await tx.trabajo.update({ where: { id: trabajoId }, data: { fechasFijas: false, fechasFijasMotivo: null, fechasFijasPorId: null, fechasFijasEn: null, actualizadoPor: actor.usuarioId } });
      await tx.trabajoEvento.create({ data: { trabajoId, tipo: 'estado', detalle: 'Se liberaron las fechas: ya pueden moverse', usuarioId: actor.usuarioId } });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'liberar_fechas', entidad: 'trabajo', entidadId: trabajoId, ip: actor.ip }, tx);
    });
    await this.notificaciones.notificar(
      await this.interesados(trabajoId),
      { tipo: 'trabajo.fechas_fijas', titulo: `${t.codigo} ya no tiene fechas inamovibles`, enlace: `/trabajos/${trabajoId}` },
      actor.usuarioId,
    );
    return this.trabajos.obtener(trabajoId, actor.usuarioId);
  }
}
