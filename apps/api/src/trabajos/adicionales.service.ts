import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { formatearSoles, type AdicionalDatos, type TrabajoDetalle } from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TrabajosService, type ActorTrabajo } from './trabajos.service.js';

const dia = (fecha: string) => new Date(`${fecha}T00:00:00Z`);

/**
 * Adicionales: trabajo fuera de lo acordado. Se proponen con su monto y sus cuotas; cuando el cliente
 * acepta, esas cuotas pasan a la cuenta del contrato (numeradas después de las existentes).
 */
@Injectable()
export class AdicionalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trabajos: TrabajosService,
    private readonly auditoria: AuditoriaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /** El contrato debe estar vigente y el trabajo al alcance de la persona. */
  private async contratoVigente(contratoId: string, usuarioId: string) {
    const contrato = await this.prisma.contrato.findUnique({ where: { id: contratoId }, include: { trabajo: { select: { id: true, codigo: true, estado: true, eliminadoEn: true } } } });
    if (!contrato || contrato.trabajo.eliminadoEn) throw new NotFoundException('Contrato no encontrado');
    await this.trabajos.verificarVisible(contrato.trabajo.id, usuarioId);
    if (contrato.estado !== 'vigente' || contrato.trabajo.estado === 'cancelado') throw new BadRequestException('El contrato no está vigente');
    return contrato;
  }

  private async adicional(id: string, usuarioId: string) {
    const a = await this.prisma.adicional.findUnique({
      where: { id },
      include: { cuotas: { include: { _count: { select: { aplicaciones: { where: { pago: { anuladoEn: null } } } } } } } },
    });
    if (!a) throw new NotFoundException('Adicional no encontrado');
    const contrato = await this.contratoVigente(a.contratoId, usuarioId);
    return { a, contrato };
  }

  private evento(tx: Prisma.TransactionClient, trabajoId: string, detalle: string, usuarioId: string) {
    return tx.trabajoEvento.create({ data: { trabajoId, tipo: 'adicional', detalle, usuarioId } });
  }

  async proponer(contratoId: string, datos: AdicionalDatos, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    const contrato = await this.contratoVigente(contratoId, actor.usuarioId);
    await this.prisma.$transaction(async (tx) => {
      // Bloquea el contrato para que dos adicionales simultáneos no repitan número.
      await tx.$queryRaw`SELECT id FROM contrato WHERE id = ${contratoId}::uuid FOR UPDATE`;
      const ultimo = await tx.adicional.aggregate({ where: { contratoId }, _max: { numero: true } });
      const numero = (ultimo._max.numero ?? 0) + 1;
      const a = await tx.adicional.create({
        data: { contratoId, numero, descripcion: datos.descripcion, monto: datos.monto, cuotasPropuestas: datos.cuotas, propuestoPorId: actor.usuarioId },
      });
      await this.evento(tx, contrato.trabajo.id, `Adicional ${numero} propuesto: ${datos.descripcion} (${formatearSoles(datos.monto)})`, actor.usuarioId);
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'proponer_adicional', entidad: 'adicional', entidadId: a.id, despues: datos, ip: actor.ip }, tx);
    });
    return this.trabajos.obtener(contrato.trabajo.id, actor.usuarioId);
  }

  /** El cliente aceptó: sus cuotas entran a la cuenta y producción se entera del trabajo extra. */
  async aceptar(id: string, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    const { a, contrato } = await this.adicional(id, actor.usuarioId);
    if (a.estado !== 'propuesto') throw new ConflictException('Solo se acepta un adicional propuesto');
    const cuotas = a.cuotasPropuestas as { monto: number; vencimiento: string }[];
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM contrato WHERE id = ${a.contratoId}::uuid FOR UPDATE`;
      // Si otra petición lo respondió mientras tanto, no se duplican las cuotas.
      const { count } = await tx.adicional.updateMany({
        where: { id, estado: 'propuesto' },
        data: { estado: 'aceptado', respondidoPorId: actor.usuarioId, respondidoEn: new Date() },
      });
      if (count === 0) throw new ConflictException('Solo se acepta un adicional propuesto');
      const ultima = await tx.cuota.aggregate({ where: { contratoId: a.contratoId }, _max: { numero: true } });
      const desde = (ultima._max.numero ?? 0) + 1;
      await tx.cuota.createMany({
        data: cuotas.map((q, i) => ({ contratoId: a.contratoId, adicionalId: id, numero: desde + i, monto: q.monto, vencimiento: dia(q.vencimiento) })),
      });
      const numeros = cuotas.length === 1 ? `la cuota ${desde}` : `las cuotas ${desde} a ${desde + cuotas.length - 1}`;
      await this.evento(tx, contrato.trabajo.id, `El cliente aceptó el adicional ${a.numero} (${formatearSoles(Number(a.monto))}); se agregó ${numeros}`, actor.usuarioId);
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'aceptar_adicional', entidad: 'adicional', entidadId: id, ip: actor.ip }, tx);
    });

    const jefes = await this.prisma.trabajoEquipo.findMany({ where: { trabajoId: contrato.trabajo.id, funcion: 'jefe_responsable', hasta: null }, select: { usuarioId: true } });
    await this.notificaciones.notificar(
      [...(await this.notificaciones.conPermiso('trabajos.armar_equipo')), ...jefes.map((j) => j.usuarioId)],
      { tipo: 'trabajo.adicional', titulo: `El cliente aceptó un adicional en ${contrato.trabajo.codigo}`, mensaje: a.descripcion, enlace: `/trabajos/${contrato.trabajo.id}` },
      actor.usuarioId,
    );
    return this.trabajos.obtener(contrato.trabajo.id, actor.usuarioId);
  }

  async rechazar(id: string, motivo: string, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    const { a, contrato } = await this.adicional(id, actor.usuarioId);
    if (a.estado !== 'propuesto') throw new ConflictException('Solo se rechaza un adicional propuesto');
    await this.prisma.$transaction(async (tx) => {
      await tx.adicional.update({ where: { id }, data: { estado: 'rechazado', respondidoPorId: actor.usuarioId, respondidoEn: new Date(), motivo } });
      await this.evento(tx, contrato.trabajo.id, `El cliente rechazó el adicional ${a.numero} — ${motivo}`, actor.usuarioId);
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'rechazar_adicional', entidad: 'adicional', entidadId: id, despues: { motivo }, ip: actor.ip }, tx);
    });
    return this.trabajos.obtener(contrato.trabajo.id, actor.usuarioId);
  }

  /** Anula un propuesto o un aceptado sin pagos (sus cuotas se quitan de la cuenta). */
  async anular(id: string, motivo: string, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    const { a, contrato } = await this.adicional(id, actor.usuarioId);
    if (a.estado !== 'propuesto' && a.estado !== 'aceptado') throw new ConflictException('El adicional ya fue rechazado o anulado');
    if (a.cuotas.some((q) => q._count.aplicaciones > 0)) throw new BadRequestException('El adicional ya tiene pagos; anula primero esos pagos');
    await this.prisma.$transaction(async (tx) => {
      await tx.cuota.deleteMany({ where: { adicionalId: id } });
      await tx.adicional.update({ where: { id }, data: { estado: 'anulado', respondidoPorId: a.respondidoPorId ?? actor.usuarioId, respondidoEn: a.respondidoEn ?? new Date(), motivo } });
      await this.evento(tx, contrato.trabajo.id, `Se anuló el adicional ${a.numero} — ${motivo}`, actor.usuarioId);
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'anular_adicional', entidad: 'adicional', entidadId: id, despues: { motivo }, ip: actor.ip }, tx);
    });
    return this.trabajos.obtener(contrato.trabajo.id, actor.usuarioId);
  }
}
