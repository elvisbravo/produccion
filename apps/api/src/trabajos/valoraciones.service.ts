import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { TrabajoDetalle, ValorarTrabajoDatos } from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TrabajosService, type ActorTrabajo } from './trabajos.service.js';

const aFecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const dias = (n: number) => `${n} ${n === 1 ? 'día hábil' : 'días hábiles'}`;

/**
 * Valoración de un trabajo: en una reunión se estima en cuántos días hábiles se hará (para dárselo al cliente).
 * Mientras no tenga equipo se muestra como "Valorado". Se puede volver a valorar: la última es la vigente.
 */
@Injectable()
export class ValoracionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trabajos: TrabajosService,
    private readonly auditoria: AuditoriaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async valorar(trabajoId: string, datos: ValorarTrabajoDatos, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    await this.trabajos.verificarVisible(trabajoId, actor.usuarioId);
    const t = await this.prisma.trabajo.findFirst({
      where: { id: trabajoId, eliminadoEn: null },
      select: { codigo: true, estado: true, creadoPor: true, prospecto: { select: { responsableId: true } } },
    });
    if (!t) throw new NotFoundException('Trabajo no encontrado');
    if (t.estado === 'finalizado' || t.estado === 'cancelado') throw new BadRequestException('El trabajo ya está cerrado');
    await this.prisma.$transaction(async (tx) => {
      await tx.valoracionTrabajo.create({
        data: { trabajoId, fechaReunion: aFecha(datos.fechaReunion), diasEstimados: datos.diasEstimados, nota: datos.nota ?? null, registradaPorId: actor.usuarioId },
      });
      await tx.trabajoEvento.create({
        data: { trabajoId, tipo: 'estado', detalle: `Valorado en la reunión del ${datos.fechaReunion}: ${dias(datos.diasEstimados)}${datos.nota ? ` (${datos.nota})` : ''}`, usuarioId: actor.usuarioId },
      });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'valorar', entidad: 'trabajo', entidadId: trabajoId, despues: datos, ip: actor.ip }, tx);
    });
    await this.notificaciones.notificar(
      [t.prospecto?.responsableId ?? t.creadoPor].filter((id): id is string => Boolean(id)),
      { tipo: 'trabajo.valorado', titulo: `${t.codigo} valorado: ${dias(datos.diasEstimados)}`, mensaje: datos.nota ?? null, enlace: `/trabajos/${trabajoId}` },
      actor.usuarioId,
    );
    return this.trabajos.obtener(trabajoId, actor.usuarioId);
  }
}
