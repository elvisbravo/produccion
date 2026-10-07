import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { diaEnLima, type BolsaPersona, type CanjearHorasDatos, type ResumenBolsa } from '@grupoes/shared';
import { AgendaService } from '../agenda/agenda.service.js';
import { AuditoriaService } from '../common/auditoria.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ActorProduccion } from './produccion.service.js';

const CAMPOS_USUARIO = { id: true, nombres: true, apellidos: true } as const;
const soloFecha = (d: Date) => d.toISOString().slice(0, 10);
const aFecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const errorCampo = (campo: string, mensaje: string) => new BadRequestException({ message: 'Datos inválidos', errores: [{ campo, mensaje }] });
const horas = (min: number) => `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;

/**
 * Bolsa de horas extra: lo que cada persona acumuló (horas extra realizadas que se marcaron para acumular) menos lo que ya canjeó.
 * Se canjea por días libres (crea una ausencia «días por horas extra») o por dinero (monto a mano).
 */
@Injectable()
export class BolsaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agenda: AgendaService,
    private readonly permisos: PermisosService,
    private readonly auditoria: AuditoriaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  private async saldoDe(usuarioId: string): Promise<{ acumulado: number; canjeado: number }> {
    const [acum, canj] = await Promise.all([
      this.prisma.horaExtraBono.aggregate({ where: { usuarioId, acumula: true, modalidad: 'horas_extra', estado: 'realizada' }, _sum: { minutosReales: true } }),
      this.prisma.canjeHoras.aggregate({ where: { usuarioId, anuladoEn: null }, _sum: { minutos: true } }),
    ]);
    return { acumulado: acum._sum.minutosReales ?? 0, canjeado: canj._sum.minutos ?? 0 };
  }

  /** La bolsa de cada persona (todas, con alcance «todos»; si no, solo la propia). */
  async resumen(actor: ActorProduccion): Promise<ResumenBolsa> {
    const alcance = (await this.permisos.efectivos(actor.usuarioId))['horas_extra.ver'];
    const filtro = alcance === 'todos' ? {} : { usuarioId: actor.usuarioId };
    const [extras, canjes] = await Promise.all([
      this.prisma.horaExtraBono.findMany({
        where: { ...filtro, acumula: true, modalidad: 'horas_extra', estado: 'realizada' },
        include: { usuario: { select: CAMPOS_USUARIO }, trabajo: { select: { codigo: true } } },
        orderBy: { realizadaEn: 'desc' },
      }),
      this.prisma.canjeHoras.findMany({ where: filtro, include: { usuario: { select: CAMPOS_USUARIO } }, orderBy: { creadoEn: 'desc' } }),
    ]);
    const personas = new Map<string, BolsaPersona>();
    const de = (u: { id: string; nombres: string; apellidos: string }) => {
      const p = personas.get(u.id) ?? { usuario: u, acumuladoMinutos: 0, canjeadoMinutos: 0, saldoMinutos: 0, movimientos: [] };
      personas.set(u.id, p);
      return p;
    };
    for (const x of extras) {
      const p = de(x.usuario);
      const minutos = x.minutosReales ?? 0;
      p.acumuladoMinutos += minutos;
      p.movimientos.push({ id: x.id, tipo: 'acumulado', fecha: (x.realizadaEn ?? x.propuestaEn).toISOString(), minutos, detalle: `${x.trabajo.codigo} · ${x.descripcion}`, monto: null, anulado: false });
    }
    for (const c of canjes) {
      const p = de(c.usuario);
      if (!c.anuladoEn) p.canjeadoMinutos += c.minutos;
      p.movimientos.push({
        id: c.id,
        tipo: c.tipo === 'dias' ? 'canje_dias' : 'canje_dinero',
        fecha: c.creadoEn.toISOString(),
        minutos: -c.minutos,
        detalle: c.tipo === 'dias' ? `Días libres del ${soloFecha(c.fechaDesde!)} al ${soloFecha(c.fechaHasta!)}${c.nota ? ` · ${c.nota}` : ''}` : `Pago${c.nota ? ` · ${c.nota}` : ''}`,
        monto: c.monto === null ? null : Number(c.monto),
        anulado: Boolean(c.anuladoEn),
      });
    }
    for (const p of personas.values()) {
      p.saldoMinutos = p.acumuladoMinutos - p.canjeadoMinutos;
      p.movimientos.sort((a, b) => b.fecha.localeCompare(a.fecha));
    }
    return { personas: [...personas.values()].sort((a, b) => b.saldoMinutos - a.saldoMinutos || a.usuario.nombres.localeCompare(b.usuario.nombres)) };
  }

  /** Canjea horas de la bolsa de una persona por días libres o por dinero. */
  async canjear(usuarioId: string, datos: CanjearHorasDatos, actor: ActorProduccion): Promise<void> {
    const usuario = await this.prisma.usuario.findFirst({ where: { id: usuarioId, eliminadoEn: null }, select: CAMPOS_USUARIO });
    if (!usuario) throw new NotFoundException('La persona no existe');
    const { acumulado, canjeado } = await this.saldoDe(usuarioId);
    const saldo = acumulado - canjeado;
    if (saldo <= 0) throw new BadRequestException('La persona no tiene horas acumuladas para canjear');

    if (datos.tipo === 'dias') {
      const desde = datos.fechaDesde!;
      const hasta = datos.fechaHasta!;
      if (desde < diaEnLima()) throw errorCampo('fechaDesde', 'Los días libres deben ser desde hoy en adelante');
      // Se descuenta lo que suma su jornada en esos días (los feriados y descansos no cuentan).
      const dias = (await this.agenda.calcular([usuarioId], desde, hasta)).get(usuarioId) ?? [];
      const minutos = dias.reduce((s, d) => s + d.capacidad, 0);
      if (minutos <= 0) throw errorCampo('fechaDesde', 'Esos días no son laborables para la persona: no hay horas que descontar');
      if (minutos > saldo) throw errorCampo('fechaHasta', `Esos días suman ${horas(minutos)} de jornada y el saldo es ${horas(saldo)}`);
      const cruce = await this.prisma.ausencia.findFirst({ where: { usuarioId, estado: { in: ['solicitada', 'aprobada'] }, fechaDesde: { lte: aFecha(hasta) }, fechaHasta: { gte: aFecha(desde) } } });
      if (cruce) throw errorCampo('fechaDesde', 'La persona ya tiene una ausencia en esas fechas');
      const canje = await this.prisma.$transaction(async (tx) => {
        const ausencia = await tx.ausencia.create({
          data: { usuarioId, tipo: 'compensacion', fechaDesde: aFecha(desde), fechaHasta: aFecha(hasta), motivo: 'Canje de horas extra acumuladas', estado: 'aprobada', solicitadaPorId: actor.usuarioId, resueltaPorId: actor.usuarioId, resueltaEn: new Date() },
        });
        const c = await tx.canjeHoras.create({ data: { usuarioId, tipo: 'dias', minutos, fechaDesde: aFecha(desde), fechaHasta: aFecha(hasta), nota: datos.nota ?? null, ausenciaId: ausencia.id, creadoPorId: actor.usuarioId } });
        await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'canjear_horas', entidad: 'usuario', entidadId: usuarioId, despues: { tipo: 'dias', desde, hasta, minutos }, ip: actor.ip }, tx);
        return c;
      });
      await this.notificaciones.notificar([usuarioId], { tipo: 'bolsa.canje', titulo: 'Canjearon tus horas extra por días libres', mensaje: `Del ${desde} al ${hasta} (${horas(canje.minutos)})`, enlace: '/horas-extra?vista=bolsa' }, actor.usuarioId);
      return;
    }

    const minutos = datos.minutos ?? saldo;
    if (minutos > saldo) throw errorCampo('minutos', `El saldo es ${horas(saldo)}`);
    await this.prisma.$transaction(async (tx) => {
      await tx.canjeHoras.create({ data: { usuarioId, tipo: 'dinero', minutos, monto: datos.monto!, nota: datos.nota ?? null, creadoPorId: actor.usuarioId } });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'canjear_horas', entidad: 'usuario', entidadId: usuarioId, despues: { tipo: 'dinero', minutos, monto: datos.monto }, ip: actor.ip }, tx);
    });
    await this.notificaciones.notificar([usuarioId], { tipo: 'bolsa.canje', titulo: 'Canjearon tus horas extra por dinero', mensaje: `${horas(minutos)} · S/ ${datos.monto!.toFixed(2)}`, enlace: '/horas-extra?vista=bolsa' }, actor.usuarioId);
  }

  /** Anula un canje: las horas vuelven a la bolsa (y, en días libres, se quita la ausencia si aún no empieza). */
  async anularCanje(id: string, actor: ActorProduccion): Promise<void> {
    const c = await this.prisma.canjeHoras.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Canje no encontrado');
    if (c.anuladoEn) throw new BadRequestException('El canje ya está anulado');
    if (c.tipo === 'dias' && c.fechaDesde && soloFecha(c.fechaDesde) <= diaEnLima()) throw new BadRequestException('Esos días libres ya empezaron: no se pueden anular');
    await this.prisma.$transaction(async (tx) => {
      await tx.canjeHoras.update({ where: { id }, data: { anuladoEn: new Date(), anuladoPorId: actor.usuarioId } });
      if (c.ausenciaId) await tx.ausencia.update({ where: { id: c.ausenciaId }, data: { estado: 'anulada' } });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'anular_canje', entidad: 'canje_horas', entidadId: id, ip: actor.ip }, tx);
    });
    await this.notificaciones.notificar([c.usuarioId], { tipo: 'bolsa.canje', titulo: 'Se anuló un canje de tus horas extra', mensaje: `Volvieron ${horas(c.minutos)} a tu bolsa`, enlace: '/horas-extra?vista=bolsa' }, actor.usuarioId);
  }
}
