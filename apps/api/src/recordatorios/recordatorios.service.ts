import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { diaEnLima, horaEnLima, sumarDias } from '@grupoes/shared';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { ParametrosService } from '../parametros/parametros.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProduccionService } from '../produccion/produccion.service.js';
import { cerrarTramos } from '../tareas/tramos.js';

const aFecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const soloFecha = (d: Date) => d.toISOString().slice(0, 10);
const formatoDia = new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dia = (fecha: Date) => formatoDia.format(new Date(`${soloFecha(fecha)}T12:00:00Z`));

/**
 * Avisos automáticos. Cada aviso lleva una clave única por usuario, así que correr el proceso
 * varias veces no repite nada. En las pruebas no corre solo: se llama a mano.
 */
@Injectable()
export class RecordatoriosService {
  private readonly log = new Logger(RecordatoriosService.name);
  private readonly activo = process.env.NODE_ENV !== 'test';

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificaciones: NotificacionesService,
    private readonly produccion: ProduccionService,
    private readonly parametros: ParametrosService,
  ) {}

  @Cron('* * * * *', { name: 'reuniones' })
  async cadaMinuto(): Promise<void> {
    if (this.activo) await this.seguro('reuniones', () => this.reunionesProximas());
  }

  @Cron('30 7 * * *', { name: 'vencimientos', timeZone: 'America/Lima' })
  async cadaManana(): Promise<void> {
    if (this.activo) await this.seguro('vencimientos', () => this.vencimientos());
  }

  @Cron('0 22 * * *', { name: 'cronometros', timeZone: 'America/Lima' })
  async cadaNoche(): Promise<void> {
    if (this.activo) await this.seguro('cronometros', () => this.cerrarCronometros());
  }

  /** Cronómetros que quedaron corriendo: se detienen y se avisa a la persona para que corrija si hace falta. */
  async cerrarCronometros(ahora = new Date()): Promise<void> {
    const cerrados = await cerrarTramos(this.prisma, {}, ahora, true);
    for (const c of cerrados) {
      await this.notificaciones.notificar([c.usuarioId], {
        tipo: 'recordatorio.cronometro',
        titulo: 'Tu cronómetro quedó corriendo y se detuvo',
        mensaje: `Se registraron ${Math.floor(c.minutos / 60)} h ${c.minutos % 60} min. Si no es correcto, corrígelo en la tarea.`,
        enlace: '/tareas',
        clave: `cronometro:${c.tareaId}:${ahora.toISOString().slice(0, 10)}`,
      });
    }
  }

  private async seguro(nombre: string, tarea: () => Promise<void>) {
    try {
      await tarea();
    } catch (error) {
      this.log.error(`Falló "${nombre}": ${(error as Error).message}`);
    }
  }

  /** Reuniones que empiezan en los próximos minutos. */
  async reunionesProximas(ahora = new Date()): Promise<void> {
    const minutos = await this.parametros.numero('notificaciones.minutos_aviso_reunion');
    const tareas = await this.prisma.tarea.findMany({
      where: { estado: 'pendiente', inicio: { gte: ahora, lte: new Date(ahora.getTime() + minutos * 60_000) } },
      include: { actividad: true, prospecto: { select: { id: true, codigo: true } }, trabajo: { select: { id: true, codigo: true } }, responsables: { select: { usuarioId: true } } },
    });
    for (const t of tareas) {
      await this.notificaciones.notificar(t.responsables.map((r) => r.usuarioId), {
        tipo: 'recordatorio.reunion',
        titulo: `"${t.titulo ?? t.actividad.nombre}" empieza a las ${horaEnLima(t.inicio!)}`,
        mensaje: t.prospecto?.codigo ?? t.trabajo?.codigo ?? null,
        enlace: t.prospecto ? `/prospectos/${t.prospecto.id}` : t.trabajo ? `/trabajos/${t.trabajo.id}` : '/tareas',
        clave: `reunion:${t.id}`,
      });
    }
  }

  /** Trabajos que siguen detenidos esperando información del cliente: se recuerda cada N días a quien sigue al cliente y a quien lo pausó. */
  async pausasSinRespuesta(ahora = new Date()): Promise<void> {
    const dias = await this.parametros.numero('pausas.dias_recordatorio');
    const limite = new Date(ahora.getTime() - dias * 86_400_000);
    const pausas = await this.prisma.pausaTrabajo.findMany({
      where: { reanudadaEn: null, creadaEn: { lte: limite }, OR: [{ ultimoRecordatorioEn: null }, { ultimoRecordatorioEn: { lte: limite } }] },
      include: { trabajo: { select: { id: true, codigo: true, prospecto: { select: { responsableId: true } } } } },
    });
    for (const p of pausas) {
      const detenido = Math.max(1, Math.round((ahora.getTime() - p.creadaEn.getTime()) / 86_400_000));
      await this.notificaciones.notificar([p.trabajo.prospecto.responsableId, p.creadaPorId], {
        tipo: 'recordatorio.pausa',
        titulo: `${p.trabajo.codigo} lleva ${detenido} días en espera del cliente`,
        mensaje: `Falta: ${p.motivo}`,
        enlace: `/trabajos/${p.trabajo.id}`,
        clave: `pausa:${p.id}:${ahora.toISOString().slice(0, 10)}`,
      });
      await this.prisma.pausaTrabajo.update({ where: { id: p.id }, data: { ultimoRecordatorioEn: ahora } });
    }
  }

  /** Revisión de cada mañana: vencidas, por asignar, entregables, cuotas y colas en rojo. */
  async vencimientos(hoy = diaEnLima(), ahora = new Date()): Promise<void> {
    await this.pausasSinRespuesta(ahora);
    const limite = aFecha(sumarDias(hoy, await this.parametros.numero('notificaciones.dias_aviso_vencimiento')));

    // Tareas vencidas (las de la cola se miden por su holgura, no por su día).
    const vencidas = await this.prisma.tarea.findMany({
      where: {
        estado: { in: ['pendiente', 'en_proceso'] },
        OR: [{ inicio: { lt: ahora } }, { inicio: null, fecha: { lt: aFecha(hoy) } }],
        responsables: { none: { ordenCola: { not: null } } },
      },
      include: { actividad: true, prospecto: { select: { id: true, codigo: true } }, responsables: { select: { usuarioId: true } } },
    });
    for (const t of vencidas) {
      if (t.inicio && t.inicio.getTime() + t.minutosEstimados * 60_000 > ahora.getTime()) continue;
      await this.notificaciones.notificar(t.responsables.map((r) => r.usuarioId), {
        tipo: 'recordatorio.tarea_vencida',
        titulo: `Venció sin completarse: ${t.titulo ?? t.actividad.nombre}`,
        mensaje: [t.prospecto?.codigo, dia(t.fecha)].filter(Boolean).join(' · '),
        enlace: '/tareas',
        clave: `vencida:${t.id}`,
      });
    }

    // Por asignar para hoy o mañana.
    const sinAsignar = await this.prisma.tarea.findMany({
      where: { estado: 'por_asignar', fecha: { lte: aFecha(sumarDias(hoy, 1)) } },
      include: { actividad: true, prospecto: { select: { codigo: true } } },
    });
    for (const t of sinAsignar) {
      if (!t.actividad.rolCoordinadorId) continue;
      await this.notificaciones.notificar(await this.notificaciones.conRol(t.actividad.rolCoordinadorId), {
        tipo: 'recordatorio.por_asignar',
        titulo: `Sigue sin responsable: ${t.actividad.nombre}`,
        mensaje: [t.prospecto?.codigo, dia(t.fecha), t.inicio && horaEnLima(t.inicio)].filter(Boolean).join(' · '),
        enlace: '/tareas?vista=por-asignar',
        clave: `por_asignar:${t.id}:${hoy}`,
      });
    }

    // Entregables que vencen pronto o ya vencieron (aún no entregados al cliente).
    const programadores = await this.notificaciones.conPermiso('programacion.programar');
    const entregables = await this.prisma.entregable.findMany({
      where: { estado: { in: ['pendiente', 'en_proceso', 'en_revision', 'observado', 'observado_cliente', 'aprobado', 'en_turnitin'] }, fechaLimite: { lte: limite }, trabajo: { estado: { notIn: ['finalizado', 'cancelado'] } } },
      include: { trabajo: { select: { id: true, codigo: true, equipo: { where: { hasta: null, funcion: 'auxiliar_principal' }, select: { usuarioId: true } } } } },
    });
    for (const e of entregables) {
      const vencido = soloFecha(e.fechaLimite) < hoy;
      await this.notificaciones.notificar([...e.trabajo.equipo.map((m) => m.usuarioId), ...programadores], {
        tipo: vencido ? 'entregable.vencido' : 'entregable.por_vencer',
        titulo: vencido ? `Venció: ${e.nombre} (${e.trabajo.codigo})` : `${e.nombre} vence el ${dia(e.fechaLimite)}`,
        mensaje: e.trabajo.codigo,
        enlace: `/trabajos/${e.trabajo.id}`,
        clave: `${vencido ? 'entregable-vencido' : 'entregable-vence'}:${e.id}`,
      });
    }

    // Cuotas con saldo que vencen pronto o ya vencieron → quien sigue al cliente.
    const cuotas = await this.prisma.cuota.findMany({
      where: { vencimiento: { lte: limite }, contrato: { estado: { not: 'anulado' }, trabajo: { estado: { not: 'cancelado' } } } },
      include: {
        aplicaciones: { where: { pago: { anuladoEn: null } }, select: { montoAplicado: true } },
        contrato: { select: { trabajo: { select: { id: true, codigo: true, prospecto: { select: { responsableId: true } } } } } },
      },
    });
    for (const c of cuotas) {
      const pagado = c.aplicaciones.reduce((s, a) => s + Number(a.montoAplicado), 0);
      const saldo = Number(c.monto) - pagado;
      if (saldo <= 0.005) continue;
      const vencida = soloFecha(c.vencimiento) < hoy;
      const t = c.contrato.trabajo;
      await this.notificaciones.notificar([t.prospecto.responsableId], {
        tipo: vencida ? 'cuota.vencida' : 'cuota.por_vencer',
        titulo: vencida ? `Cuota ${c.numero} vencida: ${t.codigo}` : `La cuota ${c.numero} de ${t.codigo} vence el ${dia(c.vencimiento)}`,
        mensaje: `Saldo S/ ${saldo.toFixed(2)}`,
        enlace: '/contratos',
        clave: `${vencida ? 'cuota-vencida' : 'cuota-vence'}:${c.id}`,
      });
    }

    // Tareas de la cola que ya no llegan a su fecha.
    const colas = await this.produccion.colasDePersonal();
    const enRojo = colas.flatMap((c) => c.items.filter((i) => i.semaforo === 'rojo' || i.semaforo === 'sin_plan').map((i) => ({ ...i, usuario: c.usuario })));
    if (enRojo.length > 0) {
      const jefes = await this.prisma.trabajoEquipo.findMany({
        where: { trabajoId: { in: enRojo.map((i) => i.trabajo.id) }, hasta: null, funcion: 'jefe_responsable' },
        select: { trabajoId: true, usuarioId: true },
      });
      for (const i of enRojo) {
        await this.notificaciones.notificar([...programadores, ...jefes.filter((j) => j.trabajoId === i.trabajo.id).map((j) => j.usuarioId)], {
          tipo: 'tarea.en_rojo',
          titulo: `No llega a su fecha: ${i.titulo ?? i.actividad.nombre}`,
          mensaje: `${i.trabajo.codigo} · ${i.usuario.nombres} ${i.usuario.apellidos} · vence el ${dia(aFecha(i.fechaLimite))}`,
          enlace: '/programacion?vista=colas',
          clave: `rojo:${i.tareaId}`,
        });
      }
    }
  }
}
