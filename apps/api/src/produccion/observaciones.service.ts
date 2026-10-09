import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  diaEnLima,
  horaEnLima,
  instanteDesdeLima,
  type ConfirmarObservacionDatos,
  type ConsultaObservaciones,
  type ConsultaPlazo,
  type ObservacionDetalle,
  type ObservacionItem,
  type PlazoEvaluado,
  type ProgramarObservacionDatos,
  type UsuarioResumen,
  type ValorarObservacionDatos,
} from '@grupoes/shared';
import { AgendaService, aTareaEnCola } from '../agenda/agenda.service.js';
import { ahoraEnLima, planificar } from '../agenda/cola.js';
import { AuditoriaService } from '../common/auditoria.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExtrasService } from './extras.service.js';
import { ProduccionService, type ActorProduccion } from './produccion.service.js';

const incluir = {
  trabajo: { select: { id: true, codigo: true, titulo: true, prospecto: { select: { responsable: { select: { id: true, nombres: true, apellidos: true } } } }, equipo: { where: { hasta: null, funcion: 'auxiliar_principal' as const }, select: { usuario: { select: { id: true, nombres: true, apellidos: true } } } } } },
  entregable: { select: { id: true, nombre: true } },
  creadaPor: { select: { id: true, nombres: true, apellidos: true } },
  tomadaPor: { select: { id: true, nombres: true, apellidos: true } },
  valoradaPor: { select: { id: true, nombres: true, apellidos: true } },
  confirmadaPor: { select: { id: true, nombres: true, apellidos: true } },
  programadaPor: { select: { id: true, nombres: true, apellidos: true } },
  items: { orderBy: { orden: 'asc' as const }, select: { id: true, orden: true, texto: true, resuelto: true } },
} satisfies Prisma.ObservacionClienteInclude;

type Fila = Prisma.ObservacionClienteGetPayload<{ include: typeof incluir }>;

const nombre = (u: UsuarioResumen) => `${u.nombres} ${u.apellidos}`.trim();

/** Observaciones del cliente sobre un entregable ya entregado: se valoran, se confirman con el cliente y se programan. */
@Injectable()
export class ObservacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly produccion: ProduccionService,
    private readonly agenda: AgendaService,
    private readonly extras: ExtrasService,
    private readonly notificaciones: NotificacionesService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private aItem(o: Fila): ObservacionItem {
    return {
      id: o.id,
      estado: o.estado,
      ronda: o.ronda,
      observaciones: o.observaciones,
      creadaEn: o.creadaEn.toISOString(),
      creadaPor: o.creadaPor,
      trabajo: { id: o.trabajo.id, codigo: o.trabajo.codigo, titulo: o.trabajo.titulo },
      entregable: o.entregable,
      asistente: o.trabajo.prospecto?.responsable ?? null,
      tomadaPor: o.tomadaPor,
      valoradaPor: o.valoradaPor,
      minutosEstimados: o.minutosEstimados,
      entregaPropuesta: o.entregaPropuesta?.toISOString() ?? null,
      notaValoracion: o.notaValoracion,
      items: o.items,
      confirmadaPor: o.confirmadaPor,
      entregaConfirmada: o.entregaConfirmada?.toISOString() ?? null,
      notaConfirmacion: o.notaConfirmacion,
      programadaPor: o.programadaPor,
      tareaId: o.tareaId,
      auxiliarOriginal: o.trabajo.equipo[0]?.usuario ?? null,
    };
  }

  async listar(consulta: ConsultaObservaciones): Promise<ObservacionItem[]> {
    const filas = await this.prisma.observacionCliente.findMany({
      where: {
        trabajo: { eliminadoEn: null },
        ...(consulta.trabajoId && { trabajoId: consulta.trabajoId }),
        // Sin filtro: lo que sigue abierto (las resueltas y canceladas se piden aparte)
        estado: consulta.estado ?? { in: ['por_valorar', 'valorada', 'confirmada', 'programada'] },
      },
      include: incluir,
      orderBy: [{ creadaEn: 'asc' }],
    });
    return filas.map((o) => this.aItem(o));
  }

  private async fila(id: string, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<Fila> {
    const o = await db.observacionCliente.findFirst({ where: { id, trabajo: { eliminadoEn: null } }, include: incluir });
    if (!o) throw new NotFoundException('La observación no existe');
    return o;
  }

  async detalle(id: string): Promise<ObservacionDetalle> {
    const o = await this.fila(id);
    const vigente = o.entregaConfirmada ?? o.entregaPropuesta;
    const plazo = o.minutosEstimados && vigente && ['valorada', 'confirmada'].includes(o.estado) ? await this.evaluarPlazo(o.trabajo.equipo[0]?.usuario ?? null, o.minutosEstimados, vigente) : null;
    return { ...this.aItem(o), plazo };
  }

  /** ¿Cabe `minutos` de trabajo del auxiliar antes de la fecha y hora de entrega? Si no, cuándo se podría entregar y qué ventana de horas extra lo cubriría. */
  async evaluarPlazo(auxiliar: UsuarioResumen | null, minutos: number, entrega: Date): Promise<PlazoEvaluado> {
    const base = { auxiliar, entrega: entrega.toISOString() };
    if (!auxiliar) {
      return { ...base, cabe: true, faltanMinutos: 0, inicio: null, fin: null, sugerenciaEntrega: null, extra: null, mensaje: 'El trabajo no tiene auxiliar principal: elige quién lo hará al programar.' };
    }
    const dia = diaEnLima(entrega);
    const ahora = ahoraEnLima();
    if (entrega.getTime() <= Date.now()) {
      return { ...base, cabe: false, faltanMinutos: minutos, inicio: null, fin: null, sugerenciaEntrega: null, extra: null, mensaje: 'La hora de entrega ya pasó: propón otra al cliente.' };
    }
    // La corrección entra primera en la cola del auxiliar: se planifica antes de lo que ya tiene.
    const cola = (await this.agenda.basesDeCola([auxiliar.id], this.prisma, ahora.fecha)).get(auxiliar.id);
    const plan = cola ? planificar(cola.dias, [{ id: 'nueva', minutos, noAntesDe: ahora.fecha }, ...cola.items.map(({ tarea }) => aTareaEnCola(tarea))], cola.ahora).get('nueva') : undefined;
    const segmentos = plan?.segmentos ?? [];
    const instante = (fecha: string, minuto: number) => new Date(instanteDesdeLima(fecha, '00:00').getTime() + minuto * 60_000);
    // Lo que alcanza a hacerse en horario normal antes de la hora de entrega
    const entra = segmentos.reduce((suma, sg) => {
      const fin = Math.min(instante(sg.fecha, sg.fin).getTime(), entrega.getTime());
      return suma + Math.max(0, Math.round((fin - instante(sg.fecha, sg.inicio).getTime()) / 60_000));
    }, 0);
    const ultimo = segmentos.at(-1);
    const fin = ultimo ? instante(ultimo.fecha, ultimo.fin) : null;
    const v = { inicio: segmentos[0] ? instante(segmentos[0].fecha, segmentos[0].inicio).toISOString() : null, fin: fin?.toISOString() ?? null };
    const faltan = Math.max(0, minutos - entra);
    const cabe = faltan === 0;
    const extra = !cabe ? await this.extras.ventanaParaFaltante(auxiliar.id, dia, faltan) : null;
    const cuando = (d: Date) => `${diaEnLima(d)} a las ${horaEnLima(d)}`;
    const mensaje = cabe
      ? `${nombre(auxiliar)} lo termina el ${cuando(fin ?? entrega)}: cabe antes de la entrega.`
      : `${nombre(auxiliar)} no alcanza en su horario normal (le faltan ${faltan} min antes del ${cuando(entrega)}). ${fin ? `En horario normal terminaría el ${cuando(fin)}: se le puede proponer esa hora al cliente.` : ''}${extra ? ` O cubrirlo con horas extra el ${extra.fecha} de ${extra.horaInicio} a ${extra.horaFin}.` : ''}`.trim();
    return { ...base, cabe, faltanMinutos: faltan, inicio: v.inicio, fin: v.fin, sugerenciaEntrega: cabe ? null : v.fin, extra, mensaje };
  }

  /** Consulta mientras se llena el formulario de valoración: ¿alcanza el tiempo para la hora de entrega propuesta? */
  async plazo(id: string, consulta: ConsultaPlazo): Promise<PlazoEvaluado> {
    const o = await this.fila(id);
    return this.evaluarPlazo(o.trabajo.equipo[0]?.usuario ?? null, consulta.minutos, instanteDesdeLima(consulta.fecha, consulta.hora));
  }

  /** Reserva la valoración para quien la va a hacer (cualquiera menos la asistente administrativa). */
  async tomar(id: string, actor: ActorProduccion): Promise<ObservacionDetalle> {
    await this.prisma.$transaction(async (tx) => {
      const o = await this.fila(id, tx);
      if (o.estado !== 'por_valorar') throw new ConflictException('Esta observación ya fue valorada');
      if (o.tomadaPorId && o.tomadaPorId !== actor.usuarioId) throw new ConflictException(`${nombre(o.tomadaPor!)} ya la tomó para valorarla`);
      await tx.observacionCliente.update({ where: { id }, data: { tomadaPorId: actor.usuarioId, tomadaEn: new Date() } });
    });
    return this.detalle(id);
  }

  async soltar(id: string, actor: ActorProduccion): Promise<ObservacionDetalle> {
    const o = await this.fila(id);
    if (o.estado !== 'por_valorar' || !o.tomadaPorId) throw new ConflictException('No hay nada que soltar');
    if (o.tomadaPorId !== actor.usuarioId) throw new ForbiddenException('Solo quien la tomó puede soltarla');
    await this.prisma.observacionCliente.update({ where: { id }, data: { tomadaPorId: null, tomadaEn: null } });
    return this.detalle(id);
  }

  async valorar(id: string, datos: ValorarObservacionDatos, actor: ActorProduccion): Promise<ObservacionDetalle> {
    const entrega = instanteDesdeLima(datos.fecha, datos.hora);
    if (entrega.getTime() <= Date.now()) throw new BadRequestException('La hora de entrega ya pasó');
    const o = await this.prisma.$transaction(async (tx) => {
      const o = await this.fila(id, tx);
      if (o.estado !== 'por_valorar') throw new ConflictException('Esta observación ya fue valorada');
      if (o.tomadaPorId && o.tomadaPorId !== actor.usuarioId) throw new ConflictException(`${nombre(o.tomadaPor!)} ya la tomó para valorarla`);
      await tx.itemObservacion.deleteMany({ where: { observacionId: id } });
      await tx.observacionCliente.update({
        where: { id },
        data: {
          estado: 'valorada',
          tomadaPorId: actor.usuarioId,
          tomadaEn: o.tomadaEn ?? new Date(),
          valoradaPorId: actor.usuarioId,
          valoradaEn: new Date(),
          minutosEstimados: datos.minutos,
          entregaPropuesta: entrega,
          notaValoracion: datos.nota ?? null,
          items: { create: datos.items.map((texto, i) => ({ orden: i + 1, texto })) },
        },
      });
      await tx.trabajoEvento.create({ data: { trabajoId: o.trabajoId, tipo: 'entregable', detalle: `${o.entregable.nombre}: observaciones valoradas (${datos.minutos} min, entrega ${datos.fecha} ${datos.hora})`, usuarioId: actor.usuarioId } });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'actualizar', entidad: 'observacion_cliente', entidadId: id, despues: datos, ip: actor.ip }, tx);
      return o;
    });
    // La asistente administrativa lo habla con el cliente y la de producción lo programa: a las dos les llega.
    const asistente = o.trabajo.prospecto?.responsable?.id;
    const adm = asistente ? [asistente] : await this.notificaciones.conPermiso('observaciones.confirmar');
    const prod = await this.notificaciones.conPermiso('observaciones.programar');
    await this.notificaciones.notificar(
      [...adm, ...prod],
      {
        tipo: 'observacion.valorada',
        titulo: `Observaciones valoradas: ${o.entregable.nombre} (${o.trabajo.codigo})`,
        mensaje: `Tiempo ${datos.minutos} min · entrega propuesta ${datos.fecha} ${datos.hora}`,
        enlace: '/observaciones',
      },
      actor.usuarioId,
    );
    return this.detalle(id);
  }

  /** La asistente administrativa confirma con el cliente la hora propuesta o la cambia (contrapropuesta). */
  async confirmar(id: string, datos: ConfirmarObservacionDatos, actor: ActorProduccion): Promise<ObservacionDetalle> {
    const o = await this.fila(id);
    if (o.estado !== 'valorada') throw new ConflictException('Solo se confirma una observación ya valorada');
    const entrega = datos.fecha && datos.hora ? instanteDesdeLima(datos.fecha, datos.hora) : o.entregaPropuesta!;
    if (entrega.getTime() <= Date.now()) throw new BadRequestException('La hora de entrega ya pasó');
    const cambio = entrega.getTime() !== o.entregaPropuesta?.getTime();
    await this.prisma.$transaction(async (tx) => {
      await tx.observacionCliente.update({
        where: { id },
        data: { estado: 'confirmada', confirmadaPorId: actor.usuarioId, confirmadaEn: new Date(), entregaConfirmada: entrega, notaConfirmacion: datos.nota ?? null },
      });
      await tx.trabajoEvento.create({
        data: { trabajoId: o.trabajoId, tipo: 'entregable', detalle: `${o.entregable.nombre}: entrega de las correcciones acordada con el cliente para el ${diaEnLima(entrega)} a las ${horaEnLima(entrega)}${cambio ? ' (distinta a la propuesta)' : ''}`, usuarioId: actor.usuarioId },
      });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'actualizar', entidad: 'observacion_cliente', entidadId: id, despues: { ...datos, entrega: entrega.toISOString() }, ip: actor.ip }, tx);
    });
    await this.notificaciones.notificar(
      [...(await this.notificaciones.conPermiso('observaciones.programar')), ...(o.valoradaPorId ? [o.valoradaPorId] : [])],
      {
        tipo: 'observacion.confirmada',
        titulo: `Plazo confirmado con el cliente: ${o.entregable.nombre} (${o.trabajo.codigo})`,
        mensaje: `${diaEnLima(entrega)} a las ${horaEnLima(entrega)}${cambio ? ' (la asistente administrativa lo cambió)' : ''}${datos.nota ? ` · ${datos.nota}` : ''}`,
        enlace: '/observaciones',
      },
      actor.usuarioId,
    );
    return this.detalle(id);
  }

  /** La asistente de producción programa la corrección: primera en la cola de quien la hará (por defecto, quien hizo el trabajo). */
  async programar(id: string, datos: ProgramarObservacionDatos, actor: ActorProduccion): Promise<ObservacionDetalle> {
    const o = await this.fila(id);
    if (o.estado !== 'confirmada') throw new ConflictException('Primero la asistente administrativa debe confirmar el plazo con el cliente');
    const quien = datos.usuarioId ?? o.trabajo.equipo[0]?.usuario.id;
    const notas = o.items.map((it, i) => `${i + 1}. ${it.texto}`).join('\n') || o.observaciones;
    const responsable = await this.prisma.$transaction(async (tx) => {
      const tareaId = await this.produccion.crearCorreccionDeObservacion(tx, { trabajoId: o.trabajoId, entregableId: o.entregableId, nombre: o.entregable.nombre, minutos: o.minutosEstimados!, notas }, actor, quien);
      await tx.observacionCliente.update({ where: { id }, data: { estado: 'programada', programadaPorId: actor.usuarioId, programadaEn: new Date(), tareaId } });
      await tx.trabajoEvento.create({ data: { trabajoId: o.trabajoId, tipo: 'entregable', detalle: `${o.entregable.nombre}: corrección de observaciones programada`, usuarioId: actor.usuarioId } });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'actualizar', entidad: 'observacion_cliente', entidadId: id, despues: { programada: true, usuarioId: quien ?? null }, ip: actor.ip }, tx);
      return (await tx.tareaResponsable.findFirst({ where: { tareaId }, select: { usuarioId: true } }))?.usuarioId;
    });
    const entrega = o.entregaConfirmada ?? o.entregaPropuesta;
    await this.notificaciones.notificar(
      responsable ? [responsable] : [],
      {
        tipo: 'entregable.observado_cliente',
        titulo: `Corrección programada: ${o.entregable.nombre} (${o.trabajo.codigo})`,
        mensaje: entrega ? `Entrega al cliente: ${diaEnLima(entrega)} a las ${horaEnLima(entrega)}` : null,
        enlace: '/tareas?vista=cola',
      },
      actor.usuarioId,
    );
    return this.detalle(id);
  }
}
