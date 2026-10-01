import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  diaEnLima,
  diaSemanaDe,
  horaAMinutos,
  minutosAHora,
  sumarDias,
  type HoraExtraItem,
  type ProponerExtraDatos,
  type ResumenExtras,
  type TopesExtra,
  type VistaExtras,
} from '@grupoes/shared';
import { AgendaService } from '../agenda/agenda.service.js';
import { AuditoriaService } from '../common/auditoria.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ActorProduccion } from './produccion.service.js';

const CAMPOS_USUARIO = { id: true, nombres: true, apellidos: true } as const;
const soloFecha = (d: Date) => d.toISOString().slice(0, 10);
const aFecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const errorCampo = (campo: string, mensaje: string) => new BadRequestException({ message: 'Datos inválidos', errores: [{ campo, mensaje }] });
const horas = (minutos: number) => `${Math.round((minutos / 60) * 10) / 10} h`;

/** Topes globales de horas extra (en horas). Sin valor = sin tope. */
const CLAVE_TOPE = { semanal: 'horas_extra.tope_semanal', mensual: 'horas_extra.tope_mensual' } as const;
/** Estados que cuentan para el tope: lo aceptado o aprobado, aunque aún no se haga. */
const CUENTAN = ['aceptada', 'aprobada', 'realizada'] as const;

const INCLUIR = {
  usuario: { select: CAMPOS_USUARIO },
  propuestaPor: { select: CAMPOS_USUARIO },
  aprobadaPor: { select: CAMPOS_USUARIO },
  trabajo: { select: { id: true, codigo: true, titulo: true } },
  entregable: { select: { id: true, nombre: true } },
} as const satisfies Prisma.HoraExtraBonoInclude;
type ExtraCompleta = Prisma.HoraExtraBonoGetPayload<{ include: typeof INCLUIR }>;

const minutosDe = (x: { minutoInicio: number | null; minutoFin: number | null }) => (x.minutoInicio !== null && x.minutoFin !== null ? x.minutoFin - x.minutoInicio : 0);

@Injectable()
export class ExtrasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agenda: AgendaService,
    private readonly permisos: PermisosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ─── Topes ───────────────────────────────────────────────

  async topes(): Promise<TopesExtra> {
    const filas = await this.prisma.parametro.findMany({ where: { clave: { in: Object.values(CLAVE_TOPE) } } });
    const valor = (clave: string) => {
      const v = filas.find((f) => f.clave === clave)?.valor;
      return typeof v === 'number' ? v : null;
    };
    return { semanal: valor(CLAVE_TOPE.semanal), mensual: valor(CLAVE_TOPE.mensual) };
  }

  async guardarTopes(datos: TopesExtra, actor: ActorProduccion): Promise<TopesExtra> {
    const antes = await this.topes();
    await this.prisma.$transaction(async (tx) => {
      for (const [k, clave] of Object.entries(CLAVE_TOPE) as [keyof TopesExtra, string][]) {
        const valor = datos[k] ?? null;
        await tx.parametro.upsert({
          where: { clave },
          create: { clave, valor: valor as number, descripcion: `Tope ${k} de horas extra por persona (horas; vacío = sin tope)` },
          update: { valor: valor as number },
        });
      }
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'editar', entidad: 'parametro', antes, despues: { claves: Object.values(CLAVE_TOPE), ...datos }, ip: actor.ip }, tx);
    });
    return this.topes();
  }

  /** Avisos de tope: horas extra de la persona en la semana (lunes a domingo) y el mes de ese día. */
  private async avisosDeTope(usuarioId: string, fecha: string, minutosNuevos: number, excluirId?: string): Promise<string[]> {
    const topes = await this.topes();
    if (topes.semanal === null && topes.mensual === null) return [];
    const lunes = sumarDias(fecha, 1 - diaSemanaDe(fecha));
    const inicioMes = `${fecha.slice(0, 7)}-01`;
    const finMes = sumarDias(`${sumarDias(inicioMes, 32).slice(0, 7)}-01`, -1);
    const filas = await this.prisma.horaExtraBono.findMany({
      where: {
        usuarioId,
        modalidad: 'horas_extra',
        estado: { in: [...CUENTAN] },
        fecha: { gte: aFecha(lunes < inicioMes ? lunes : inicioMes), lte: aFecha(sumarDias(lunes, 6) > finMes ? sumarDias(lunes, 6) : finMes) },
        ...(excluirId && { id: { not: excluirId } }),
      },
    });
    const suma = (desde: string, hasta: string) =>
      filas.filter((f) => soloFecha(f.fecha!) >= desde && soloFecha(f.fecha!) <= hasta).reduce((s, f) => s + minutosDe(f), 0) + minutosNuevos;
    const avisos: string[] = [];
    const semana = suma(lunes, sumarDias(lunes, 6));
    const mes = suma(inicioMes, finMes);
    if (topes.semanal !== null && semana > topes.semanal * 60) avisos.push(`Supera el tope semanal (${horas(semana)} de ${topes.semanal} h)`);
    if (topes.mensual !== null && mes > topes.mensual * 60) avisos.push(`Supera el tope mensual (${horas(mes)} de ${topes.mensual} h)`);
    return avisos;
  }

  /** Feriado o cumpleaños: se puede, porque la persona lo acepta. Vacaciones, permisos o descanso médico: nunca. */
  private async revisarDia(usuarioId: string, fecha: string, inicio: number, fin: number): Promise<string[]> {
    const [dia] = (await this.agenda.calcular([usuarioId], fecha, fecha)).get(usuarioId) ?? [];
    if (!dia) return [];
    const ausencia = dia.bloqueos.find((b) => b.tipo !== 'feriado' && b.tipo !== 'cumpleanos' && (!b.intervalo || (b.intervalo.inicio < fin && inicio < b.intervalo.fin)));
    if (ausencia) throw errorCampo('fecha', `No se programan horas extra en ${ausencia.nombre.toLowerCase()}`);
    const avisos: string[] = [];
    for (const b of dia.bloqueos.filter((x) => x.tipo === 'feriado' || x.tipo === 'cumpleanos')) avisos.push(`Cae en ${b.tipo === 'feriado' ? `feriado (${b.nombre})` : 'su cumpleaños'}`);
    if (dia.tramos.some((t) => t.inicio < fin && inicio < t.fin)) avisos.push('Se cruza con su horario normal');
    return avisos;
  }

  // ─── Flujo ───────────────────────────────────────────────

  async proponer(datos: ProponerExtraDatos, actor: ActorProduccion): Promise<HoraExtraItem> {
    const trabajo = await this.prisma.trabajo.findFirst({ where: { id: datos.trabajoId, eliminadoEn: null } });
    if (!trabajo || ['finalizado', 'cancelado'].includes(trabajo.estado)) throw errorCampo('trabajoId', 'Trabajo no disponible');
    if (datos.entregableId && !(await this.prisma.entregable.count({ where: { id: datos.entregableId, trabajoId: datos.trabajoId } }))) {
      throw errorCampo('entregableId', 'El entregable no es de ese trabajo');
    }
    const usuario = await this.prisma.usuario.findFirst({ where: { id: datos.usuarioId, activo: true, eliminadoEn: null } });
    if (!usuario) throw errorCampo('usuarioId', 'Usuario no disponible');

    const esHoras = datos.modalidad === 'horas_extra';
    const inicio = esHoras ? horaAMinutos(datos.horaInicio!) : null;
    const fin = esHoras ? horaAMinutos(datos.horaFin!) : null;
    if (esHoras) {
      if (datos.fecha! < diaEnLima()) throw errorCampo('fecha', 'No puede ser un día pasado');
      await this.revisarDia(datos.usuarioId, datos.fecha!, inicio!, fin!);
    }
    const creada = await this.prisma.horaExtraBono.create({
      data: {
        usuarioId: datos.usuarioId,
        modalidad: datos.modalidad,
        trabajoId: datos.trabajoId,
        entregableId: datos.entregableId ?? null,
        descripcion: datos.descripcion,
        fecha: esHoras ? aFecha(datos.fecha!) : null,
        minutoInicio: inicio,
        minutoFin: fin,
        monto: esHoras ? null : datos.monto!,
        propuestaPorId: actor.usuarioId,
      },
    });
    await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'proponer', entidad: 'hora_extra_bono', entidadId: creada.id, despues: datos, ip: actor.ip });
    return this.item(creada.id);
  }

  private async obtener(id: string): Promise<ExtraCompleta> {
    const x = await this.prisma.horaExtraBono.findUnique({ where: { id }, include: INCLUIR });
    if (!x) throw new NotFoundException('Propuesta no encontrada');
    return x;
  }

  /** La persona acepta o rechaza (solo ella). */
  async responder(id: string, acepta: boolean, motivo: string | undefined, actor: ActorProduccion): Promise<HoraExtraItem> {
    const x = await this.obtener(id);
    if (x.usuarioId !== actor.usuarioId) throw new ForbiddenException('Solo la persona propuesta puede aceptar o rechazar');
    if (x.estado !== 'propuesta') throw new BadRequestException('Ya respondiste esta propuesta');
    if (!acepta && !motivo) throw errorCampo('motivo', 'Cuéntanos por qué no puedes');
    await this.cambiar(x, { estado: acepta ? 'aceptada' : 'rechazada', respondidaEn: new Date(), motivoRechazo: acepta ? null : motivo }, acepta ? 'aceptar' : 'rechazar', actor);
    return this.item(id);
  }

  async aprobar(id: string, actor: ActorProduccion): Promise<HoraExtraItem> {
    const x = await this.obtener(id);
    if (x.estado !== 'aceptada') throw new BadRequestException('Solo se aprueba lo que la persona ya aceptó');
    if (x.modalidad === 'horas_extra') await this.revisarDia(x.usuarioId, soloFecha(x.fecha!), x.minutoInicio!, x.minutoFin!);
    await this.cambiar(x, { estado: 'aprobada', aprobadaPorId: actor.usuarioId, aprobadaEn: new Date() }, 'aprobar', actor);
    return this.item(id);
  }

  async realizar(id: string, minutosReales: number | undefined, actor: ActorProduccion): Promise<HoraExtraItem> {
    const x = await this.obtener(id);
    if (x.estado !== 'aprobada') throw new BadRequestException('Solo se marca como realizado lo aprobado');
    await this.cambiar(x, { estado: 'realizada', realizadaEn: new Date(), minutosReales: x.modalidad === 'horas_extra' ? (minutosReales ?? minutosDe(x)) : null }, 'realizar', actor);
    return this.item(id);
  }

  /** Anula quien la propuso o quien aprueba, mientras no esté realizada. */
  async anular(id: string, actor: ActorProduccion): Promise<HoraExtraItem> {
    const x = await this.obtener(id);
    if (!['propuesta', 'aceptada', 'aprobada'].includes(x.estado)) throw new BadRequestException('Ya está cerrada');
    const puede = x.propuestaPorId === actor.usuarioId || 'horas_extra.aprobar' in (await this.permisos.efectivos(actor.usuarioId));
    if (!puede) throw new ForbiddenException('No puedes anular esta propuesta');
    await this.cambiar(x, { estado: 'anulada' }, 'anular', actor);
    return this.item(id);
  }

  private async cambiar(x: ExtraCompleta, data: Prisma.HoraExtraBonoUncheckedUpdateInput, accion: string, actor: ActorProduccion) {
    await this.prisma.$transaction(async (tx) => {
      await tx.horaExtraBono.update({ where: { id: x.id }, data });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion, entidad: 'hora_extra_bono', entidadId: x.id, antes: { estado: x.estado }, despues: data, ip: actor.ip }, tx);
    });
  }

  // ─── Lectura ─────────────────────────────────────────────

  private async item(id: string): Promise<HoraExtraItem> {
    return (await this.aItems([await this.obtener(id)]))[0];
  }

  private async aItems(filas: ExtraCompleta[]): Promise<HoraExtraItem[]> {
    return Promise.all(
      filas.map(async (x) => {
        const abierta = ['propuesta', 'aceptada', 'aprobada'].includes(x.estado);
        const avisos: string[] = [];
        if (abierta && x.modalidad === 'horas_extra') {
          const fecha = soloFecha(x.fecha!);
          avisos.push(...(await this.avisosDeTope(x.usuarioId, fecha, minutosDe(x), x.id)));
          try {
            avisos.push(...(await this.revisarDia(x.usuarioId, fecha, x.minutoInicio!, x.minutoFin!)));
          } catch (e) {
            avisos.push(e instanceof BadRequestException ? 'Ahora cae en una ausencia: no se podrá aprobar' : 'No se pudo revisar el día');
          }
        }
        return {
          id: x.id,
          usuario: x.usuario,
          modalidad: x.modalidad,
          trabajo: x.trabajo,
          entregable: x.entregable,
          descripcion: x.descripcion,
          fecha: x.fecha ? soloFecha(x.fecha) : null,
          horaInicio: x.minutoInicio === null ? null : minutosAHora(x.minutoInicio),
          horaFin: x.minutoFin === null ? null : minutosAHora(x.minutoFin),
          minutos: x.modalidad === 'horas_extra' ? minutosDe(x) : null,
          monto: x.monto === null ? null : Number(x.monto),
          estado: x.estado,
          propuestaPor: x.propuestaPor,
          propuestaEn: x.propuestaEn.toISOString(),
          motivoRechazo: x.motivoRechazo,
          aprobadaPor: x.aprobadaPor,
          minutosReales: x.minutosReales,
          avisos,
        };
      }),
    );
  }

  /**
   * Listado y resumen por persona del periodo (por defecto, el mes en curso).
   * "mias": las de la persona; "por_aprobar": aceptadas; "todas": según el alcance de "horas_extra.ver".
   */
  async listar(vista: VistaExtras, desdeQ: string | undefined, hastaQ: string | undefined, actor: ActorProduccion): Promise<ResumenExtras> {
    const hoy = diaEnLima();
    const desde = desdeQ ?? `${hoy.slice(0, 7)}-01`;
    const hasta = hastaQ ?? sumarDias(`${sumarDias(desde, 32).slice(0, 7)}-01`, -1);
    const alcance = (await this.permisos.efectivos(actor.usuarioId))['horas_extra.ver'];
    const soloPropias = vista === 'mias' || alcance !== 'todos';
    const enPeriodo: Prisma.HoraExtraBonoWhereInput = {
      OR: [{ fecha: { gte: aFecha(desde), lte: aFecha(hasta) } }, { fecha: null, propuestaEn: { gte: aFecha(desde), lte: aFecha(sumarDias(hasta, 1)) } }],
    };
    const filas = await this.prisma.horaExtraBono.findMany({
      where: {
        ...(soloPropias && { usuarioId: actor.usuarioId }),
        ...(vista === 'por_aprobar' ? { estado: 'aceptada' } : enPeriodo),
      },
      include: INCLUIR,
      orderBy: [{ propuestaEn: 'desc' }],
      take: 300,
    });

    const personas = new Map<string, ResumenExtras['personas'][number]>();
    for (const x of filas.filter((f) => f.estado === 'aprobada' || f.estado === 'realizada')) {
      const p = personas.get(x.usuarioId) ?? { usuario: x.usuario, minutosPlanificados: 0, minutosReales: 0, bonos: 0, cantidad: 0 };
      p.cantidad++;
      if (x.modalidad === 'horas_extra') {
        p.minutosPlanificados += minutosDe(x);
        p.minutosReales += x.minutosReales ?? 0;
      } else p.bonos += Number(x.monto);
      personas.set(x.usuarioId, p);
    }
    return {
      desde,
      hasta,
      topes: await this.topes(),
      personas: [...personas.values()].sort((a, b) => a.usuario.nombres.localeCompare(b.usuario.nombres)),
      items: await this.aItems(filas),
    };
  }
}
