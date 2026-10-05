import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NOMBRE_FUNCION_EQUIPO, type EstadoTrabajo, type TrabajoDetalle } from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { cerrarTramos } from '../tareas/tramos.js';
import { TrabajosService, type ActorTrabajo } from './trabajos.service.js';

/** Las tareas de la cola de trabajo (sin hora fija) que están vivas: las que la planificación considera. */
const EN_COLA = { inicio: null, estado: { in: ['pendiente', 'en_proceso'] as ('pendiente' | 'en_proceso')[] } };

interface TareaPausada {
  tareaId: string;
  estado: 'pendiente' | 'en_proceso';
}

/**
 * Un trabajo detenido porque falta información del cliente. Mientras dura, el trabajo queda suspendido y sus tareas
 * en cola pasan a "en pausa": salen de la planificación (nadie queda en rojo por algo que no puede avanzar).
 * Al reanudar vuelven a su lugar. Las reuniones con día y hora no se tocan.
 */
@Injectable()
export class PausasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trabajos: TrabajosService,
    private readonly auditoria: AuditoriaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /** Quien sigue al cliente y el equipo del trabajo: a quienes les toca enterarse. */
  private async interesados(trabajoId: string): Promise<string[]> {
    const t = await this.prisma.trabajo.findUniqueOrThrow({
      where: { id: trabajoId },
      select: { creadoPor: true, prospecto: { select: { responsableId: true } }, equipo: { where: { hasta: null }, select: { usuarioId: true } } },
    });
    return [t.prospecto?.responsableId ?? t.creadoPor, ...t.equipo.map((e) => e.usuarioId)].filter((id): id is string => Boolean(id));
  }

  async pausar(trabajoId: string, motivo: string, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    await this.trabajos.verificarVisible(trabajoId, actor.usuarioId);
    const trabajo = await this.prisma.trabajo.findFirst({ where: { id: trabajoId, eliminadoEn: null }, select: { id: true, codigo: true, estado: true } });
    if (!trabajo) throw new NotFoundException('Trabajo no encontrado');
    if (trabajo.estado === 'suspendido') throw new BadRequestException('El trabajo ya está en espera del cliente');
    if (trabajo.estado === 'finalizado' || trabajo.estado === 'cancelado') throw new BadRequestException('El trabajo ya está cerrado');

    await this.prisma.$transaction(async (tx) => {
      // Las tareas de la cola salen de la planificación; si alguien las tenía corriendo, se detiene su cronómetro.
      const tareas = await tx.tarea.findMany({ where: { trabajoId, ...EN_COLA }, select: { id: true, estado: true } });
      const pausadas: TareaPausada[] = tareas.map((t) => ({ tareaId: t.id, estado: t.estado as TareaPausada['estado'] }));
      if (tareas.length > 0) {
        await cerrarTramos(tx, { tareaId: { in: tareas.map((t) => t.id) } }, new Date());
        await tx.tarea.updateMany({ where: { id: { in: tareas.map((t) => t.id) } }, data: { estado: 'en_pausa' } });
      }
      await tx.pausaTrabajo.create({ data: { trabajoId, motivo, estadoAnterior: trabajo.estado, tareasPausadas: pausadas as unknown as Prisma.InputJsonValue, creadaPorId: actor.usuarioId } });
      await tx.trabajo.update({ where: { id: trabajoId }, data: { estado: 'suspendido', actualizadoPor: actor.usuarioId } });
      await tx.trabajoEvento.create({
        data: { trabajoId, tipo: 'pausa', detalle: `En espera del cliente: falta ${motivo}${tareas.length ? ` (${tareas.length} ${tareas.length === 1 ? 'tarea sale' : 'tareas salen'} de la cola)` : ''}`, usuarioId: actor.usuarioId },
      });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'pausar', entidad: 'trabajo', entidadId: trabajoId, despues: { motivo, tareas: tareas.length }, ip: actor.ip }, tx);
    });

    await this.notificaciones.notificar(
      await this.interesados(trabajoId),
      { tipo: 'trabajo.pausa', titulo: `${trabajo.codigo} está en espera del cliente`, mensaje: `Falta: ${motivo}`, enlace: `/trabajos/${trabajoId}` },
      actor.usuarioId,
    );
    return this.trabajos.obtener(trabajoId, actor.usuarioId);
  }

  async reanudar(trabajoId: string, nota: string | undefined, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    await this.trabajos.verificarVisible(trabajoId, actor.usuarioId);
    const pausa = await this.prisma.pausaTrabajo.findFirst({ where: { trabajoId, reanudadaEn: null }, include: { trabajo: { select: { codigo: true } } } });
    if (!pausa) throw new BadRequestException('El trabajo no está en espera del cliente');

    await this.prisma.$transaction(async (tx) => {
      // Las tareas vuelven a la cola (lo que estaba corriendo queda pendiente: el cronómetro ya se detuvo al pausar).
      const ids = (pausa.tareasPausadas as unknown as TareaPausada[]).map((t) => t.tareaId);
      if (ids.length > 0) await tx.tarea.updateMany({ where: { id: { in: ids }, estado: 'en_pausa' }, data: { estado: 'pendiente' } });
      await tx.pausaTrabajo.update({ where: { id: pausa.id }, data: { reanudadaEn: new Date(), reanudadaPorId: actor.usuarioId, notaReanudacion: nota ?? null } });
      // Si estaba sin equipo y se armó mientras esperaba, vuelve ya asignado.
      const conEquipo = (await tx.trabajoEquipo.count({ where: { trabajoId, hasta: null } })) > 0;
      const estado: EstadoTrabajo = pausa.estadoAnterior === 'sin_asignar' && conEquipo ? 'asignado' : (pausa.estadoAnterior as EstadoTrabajo);
      await tx.trabajo.update({ where: { id: trabajoId }, data: { estado, actualizadoPor: actor.usuarioId } });
      await tx.trabajoEvento.create({
        data: { trabajoId, tipo: 'pausa', detalle: `Se reanudó el trabajo: llegó la información${nota ? ` — ${nota}` : ''}`, usuarioId: actor.usuarioId },
      });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'reanudar', entidad: 'trabajo', entidadId: trabajoId, despues: { nota }, ip: actor.ip }, tx);
    });

    const equipo = await this.prisma.trabajoEquipo.findMany({ where: { trabajoId, hasta: null }, select: { usuarioId: true, funcion: true } });
    await this.notificaciones.notificar(
      await this.interesados(trabajoId),
      {
        tipo: 'trabajo.pausa',
        titulo: `${pausa.trabajo.codigo} se reanudó`,
        mensaje: equipo.length ? `Sus tareas vuelven a tu cola (${equipo.map((e) => NOMBRE_FUNCION_EQUIPO[e.funcion]).filter((v, i, a) => a.indexOf(v) === i).join(', ')})` : 'Sus tareas vuelven a la cola',
        enlace: `/trabajos/${trabajoId}`,
      },
      actor.usuarioId,
    );
    return this.trabajos.obtener(trabajoId, actor.usuarioId);
  }
}
