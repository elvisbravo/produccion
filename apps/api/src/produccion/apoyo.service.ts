import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  diaEnLima,
  minutosAHora,
  ROLES_BASE,
  sumarDias,
  type ApoyoTarea,
  type CandidatoApoyo,
  type HoraExtraItem,
  type MotivoCandidato,
  type OpcionHorasExtra,
  type ProponerApoyoDatos,
} from '@grupoes/shared';
import { AgendaService, aTareaEnCola } from '../agenda/agenda.service.js';
import { planificar } from '../agenda/cola.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resultado } from './contingencias.service.js';
import { ExtrasService } from './extras.service.js';
import type { ActorProduccion } from './produccion.service.js';

const CAMPOS_USUARIO = { id: true, nombres: true, apellidos: true } as const;
const ACTIVAS = ['pendiente', 'en_proceso'] as const;
const ORDEN_MOTIVO: Record<MotivoCandidato, number> = { equipo: 0, auxiliar: 1, jefe: 2 };
const RANGO = { verde: 0, ambar: 1, rojo: 2, sin_plan: 3 } as const;
/** Una ventana de horas extra no pasa de 4 horas; si falta más, se propone por partes. */
const MAX_VENTANA = 240;
const FIN_MAXIMO = 22 * 60;
const errorCampo = (campo: string, mensaje: string) => new BadRequestException({ message: 'Datos inválidos', errores: [{ campo, mensaje }] });
const soloFecha = (d: Date) => d.toISOString().slice(0, 10);
const redondear15 = (m: number) => Math.ceil(m / 15) * 15;

/**
 * Apoyo para una tarea que no llega a su fecha: quién puede tomarla (equipo → otros auxiliares → jefes), cómo quedaría en su
 * cola en horario normal y, si no llega, cuántas horas extra harían falta con una ventana sugerida (o un bono).
 */
@Injectable()
export class ApoyoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agenda: AgendaService,
    private readonly extras: ExtrasService,
  ) {}

  private async tareaEnCola(tareaId: string) {
    const tarea = await this.prisma.tarea.findFirst({
      where: { id: tareaId, estado: { in: [...ACTIVAS] } },
      include: {
        actividad: { include: { tipo: true } },
        trabajo: { select: { id: true, codigo: true, fechaLimite: true } },
        entregable: { select: { fechaLimite: true } },
        responsables: { where: { ordenCola: { not: null } }, include: { usuario: { select: CAMPOS_USUARIO } } },
      },
    });
    if (!tarea) throw new NotFoundException('La tarea no existe o ya no está pendiente');
    if (!tarea.trabajoId || tarea.responsables.length === 0) throw new BadRequestException('Solo las tareas de producción que están en una cola pueden pasar a otra persona');
    return tarea;
  }

  /** Primer día (desde mañana hasta la fecha límite) en que la persona puede hacer horas extra, y el tramo: al terminar su jornada. */
  private async ventana(usuarioId: string, limite: string, faltan: number): Promise<OpcionHorasExtra | null> {
    const dur = Math.min(redondear15(faltan), MAX_VENTANA);
    const desde = sumarDias(diaEnLima(), 1);
    const hasta = limite < sumarDias(desde, 14) ? limite : sumarDias(desde, 14);
    if (hasta < desde) return null;
    const dias = (await this.agenda.calcular([usuarioId], desde, hasta)).get(usuarioId) ?? [];
    for (const d of dias) {
      const finJornada = d.tramos.length ? Math.max(...d.tramos.map((t) => t.fin)) : 18 * 60;
      const inicio = Math.min(finJornada, FIN_MAXIMO - 15);
      const fin = Math.min(inicio + dur, FIN_MAXIMO);
      if (fin <= inicio) continue;
      const avisos = await this.extras.evaluarVentana(usuarioId, d.fecha, inicio, fin);
      if (avisos === null) continue; // ausencia ese día
      return { fecha: d.fecha, horaInicio: minutosAHora(inicio), horaFin: minutosAHora(fin), minutos: fin - inicio, faltanMinutos: faltan, cubreTodo: fin - inicio >= faltan, avisos };
    }
    return null;
  }

  async apoyo(tareaId: string): Promise<ApoyoTarea> {
    const tarea = await this.tareaEnCola(tareaId);
    const responsable = tarea.responsables[0];
    const u = responsable.usuarioId;
    const fechaLimite = tarea.entregable ? soloFecha(tarea.entregable.fechaLimite) : tarea.trabajo ? soloFecha(tarea.trabajo.fechaLimite) : null;

    const baseU = (await this.agenda.basesDeCola([u])).get(u)!;
    const actual = resultado(planificar(baseU.dias, baseU.items.map(({ tarea: x }) => aTareaEnCola(x)), baseU.ahora).get(tarea.id), fechaLimite);

    // Quienes pueden hacerla: con un rol permitido para esa participación (misma regla que la reasignación por ausencia).
    const permitidos = new Set((await this.prisma.actividadParticipacionRol.findMany({ where: { participacionId: responsable.participacionId }, include: { rol: true } })).map((p) => p.rol.codigo));
    const personal = (
      await this.prisma.usuario.findMany({
        where: { activo: true, eliminadoEn: null, id: { not: u }, roles: { some: { rol: { activo: true, codigo: { in: [ROLES_BASE.AUXILIAR, ROLES_BASE.JEFE_PROD] } } } } },
        select: { ...CAMPOS_USUARIO, roles: { select: { rol: { select: { codigo: true } } } } },
      })
    ).filter((c) => c.roles.some((r) => permitidos.has(r.rol.codigo)));
    const bases = await this.agenda.basesDeCola(personal.map((c) => c.id));
    const equipos = await this.prisma.trabajoEquipo.findMany({ where: { trabajoId: tarea.trabajoId!, hasta: null }, select: { usuarioId: true, funcion: true } });
    // Quien elabora no revisa lo suyo: el jefe responsable del trabajo no recibe su elaboración ni su corrección.
    const elabora = ['produccion', 'correccion'].includes(tarea.actividad.tipo.comportamiento);

    const candidatos: CandidatoApoyo[] = [];
    for (const c of personal) {
      const b = bases.get(c.id)!;
      const items = [...b.items.map(({ tarea: x }) => aTareaEnCola(x)), aTareaEnCola(tarea)];
      const horario = resultado(planificar(b.dias, items, b.ahora).get(tarea.id), fechaLimite);
      const esAuxiliar = c.roles.some((r) => r.rol.codigo === ROLES_BASE.AUXILIAR);
      const motivo: MotivoCandidato = !esAuxiliar ? 'jefe' : equipos.some((e) => e.usuarioId === c.id) ? 'equipo' : 'auxiliar';
      const esJefeDelTrabajo = elabora && equipos.some((e) => e.usuarioId === c.id && e.funcion === 'jefe_responsable');
      const llega = !esJefeDelTrabajo && horario.semaforo !== 'rojo' && horario.semaforo !== 'sin_plan';
      let horasExtra: OpcionHorasExtra | null = null;
      if (!esJefeDelTrabajo && !llega && fechaLimite) {
        // Cuánto no cabe antes de la fecha límite: se planifica solo hasta esa fecha y se ve lo que queda fuera.
        const parcial = planificar(b.dias.filter((d) => d.fecha <= fechaLimite), items, b.ahora).get(tarea.id);
        const entra = (parcial?.segmentos ?? []).reduce((suma, sg) => suma + (sg.fin - sg.inicio), 0);
        const faltan = Math.max(0, tarea.minutosEstimados - entra);
        if (faltan > 0) horasExtra = await this.ventana(c.id, fechaLimite, faltan);
      }
      candidatos.push({
        usuario: { id: c.id, nombres: c.nombres, apellidos: c.apellidos },
        motivo,
        horario,
        llegaEnHorario: llega,
        horasExtra,
        aviso: esJefeDelTrabajo ? 'Es el jefe responsable de este trabajo: si la elabora, otra persona tendría que revisarla' : null,
      });
    }
    candidatos.sort(
      (a, b) =>
        Number(b.llegaEnHorario) - Number(a.llegaEnHorario) ||
        ORDEN_MOTIVO[a.motivo] - ORDEN_MOTIVO[b.motivo] ||
        RANGO[a.horario.semaforo] - RANGO[b.horario.semaforo] ||
        (a.horasExtra?.faltanMinutos ?? 0) - (b.horasExtra?.faltanMinutos ?? 0),
    );

    return {
      tarea: {
        id: tarea.id,
        titulo: tarea.titulo ?? tarea.actividad.nombre,
        color: tarea.actividad.tipo.color,
        minutos: tarea.minutosEstimados,
        fechaLimite,
        referencia: tarea.trabajo ? { tipo: 'trabajo', id: tarea.trabajo.id, codigo: tarea.trabajo.codigo } : null,
        trabajoId: tarea.trabajoId,
      },
      responsable: responsable.usuario,
      actual,
      candidatos,
    };
  }

  /** Propone horas extra o un bono a quien tomaría la tarea; la tarea le pasa cuando se aprueba. */
  async proponer(tareaId: string, datos: ProponerApoyoDatos, actor: ActorProduccion): Promise<HoraExtraItem> {
    const tarea = await this.tareaEnCola(tareaId);
    if (datos.usuarioId === tarea.responsables[0].usuarioId) throw errorCampo('usuarioId', 'Esa persona ya tiene la tarea');
    // Debe poder hacerla (rol permitido) y, si elabora, no ser el jefe que revisa.
    const permitidos = new Set((await this.prisma.actividadParticipacionRol.findMany({ where: { participacionId: tarea.responsables[0].participacionId }, select: { rolId: true } })).map((p) => p.rolId));
    const roles = await this.prisma.usuarioRol.findMany({ where: { usuarioId: datos.usuarioId, rol: { activo: true }, usuario: { activo: true, eliminadoEn: null } }, select: { rolId: true } });
    if (!roles.some((r) => permitidos.has(r.rolId))) throw errorCampo('usuarioId', 'Esa persona no tiene un rol permitido para esta tarea');
    const titulo = tarea.titulo ?? tarea.actividad.nombre;
    return this.extras.proponer(
      {
        usuarioId: datos.usuarioId,
        modalidad: datos.modalidad,
        trabajoId: tarea.trabajoId!,
        descripcion: datos.descripcion ?? `Apoyo: ${titulo}`,
        fecha: datos.fecha,
        horaInicio: datos.horaInicio,
        horaFin: datos.horaFin,
        monto: datos.monto,
      },
      actor,
      { tareaId },
    );
  }
}
