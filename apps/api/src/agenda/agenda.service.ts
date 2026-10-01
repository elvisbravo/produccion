import { Injectable } from '@nestjs/common';
import {
  horaAMinutos,
  horaEnLima,
  NOMBRE_TIPO_AUSENCIA,
  ROLES_BASE,
  sumarDias,
  type AgendaEquipo,
  type AgendaPersona,
  type DiaAgenda,
  type Disponibilidad,
  type TareaAgenda,
  type TramoSemanal,
} from '@grupoes/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ahoraEnLima, HORIZONTE_DIAS, huecosDelDia, planificar, type PlanCola } from './cola.js';
import { calcularDia, esCumpleanos, evaluar, tramosDelDia, type EntradaDia, type HorarioVigencia } from './disponibilidad.js';

type Cliente = PrismaService | Prisma.TransactionClient;

const soloFecha = (d: Date) => d.toISOString().slice(0, 10);
const aFecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const aTramos = (t: { diaSemana: number; minutoInicio: number; minutoFin: number }[]): TramoSemanal[] =>
  t.map((x) => ({ diaSemana: x.diaSemana, inicio: x.minutoInicio, fin: x.minutoFin }));

export function diasEntre(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) dias.push(d);
  return dias;
}

const INCLUIR_TAREA_AGENDA = {
  actividad: { include: { tipo: true } },
  prospecto: {
    select: {
      id: true,
      codigo: true,
      contactos: { orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }], take: 1, select: { persona: { select: { nombres: true, apellidos: true } } } },
    },
  },
  trabajo: {
    select: {
      id: true,
      codigo: true,
      titulo: true,
      fechaLimite: true,
      prioridad: { select: { nombre: true, color: true, nivel: true } },
    },
  },
  entregable: { select: { id: true, nombre: true, fechaLimite: true } },
} as const satisfies Prisma.TareaInclude;
export type TareaDeAgenda = Prisma.TareaGetPayload<{ include: typeof INCLUIR_TAREA_AGENDA }>;

/** Tareas que están en la cola de trabajo: activas, sin hora fija y con posición en la cola. */
const EN_COLA = { ordenCola: { not: null }, tarea: { estado: { in: ['pendiente', 'en_proceso'] }, inicio: null } } as const satisfies Prisma.TareaResponsableWhereInput;

export interface ColaDeUsuario {
  /** Tareas en la cola, en orden. */
  items: { ordenCola: number; tarea: TareaDeAgenda }[];
  planes: Map<string, PlanCola>;
}

@Injectable()
export class AgendaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tramos de la plantilla por defecto (para quien no tiene horario propio). */
  async tramosPorDefecto(db: Cliente = this.prisma): Promise<TramoSemanal[]> {
    const plantilla = await db.plantillaHorario.findFirst({ where: { porDefecto: true }, include: { tramos: true } });
    return plantilla ? aTramos(plantilla.tramos) : [];
  }

  /** Datos de cada día (sin calcular) de varias personas, sin las tareas de la cola. */
  private async entradas(usuarioIds: string[], desde: string, hasta: string, db: Cliente): Promise<Map<string, EntradaDia[]>> {
    const [usuarios, horarios, porDefecto, feriados, ausencias, asignaciones] = await Promise.all([
      db.usuario.findMany({ where: { id: { in: usuarioIds } }, select: { id: true, fechaNacimiento: true } }),
      db.horarioUsuario.findMany({ where: { usuarioId: { in: usuarioIds }, vigenteDesde: { lte: aFecha(hasta) } }, include: { tramos: true } }),
      this.tramosPorDefecto(db),
      db.feriado.findMany({ where: { fecha: { gte: aFecha(desde), lte: aFecha(hasta) } } }),
      db.ausencia.findMany({
        where: { usuarioId: { in: usuarioIds }, estado: 'aprobada', fechaDesde: { lte: aFecha(hasta) }, fechaHasta: { gte: aFecha(desde) } },
      }),
      db.tareaResponsable.findMany({
        where: {
          usuarioId: { in: usuarioIds },
          tarea: { fecha: { gte: aFecha(desde), lte: aFecha(hasta) }, estado: { notIn: ['cancelada', 'por_asignar'] } },
          NOT: EN_COLA,
        },
        include: { tarea: { include: INCLUIR_TAREA_AGENDA } },
      }),
    ]);

    const feriadoDe = new Map(feriados.map((f) => [soloFecha(f.fecha), f]));
    const resultado = new Map<string, EntradaDia[]>();
    for (const u of usuarios) {
      const suyos: HorarioVigencia[] = horarios.filter((h) => h.usuarioId === u.id).map((h) => ({ vigenteDesde: soloFecha(h.vigenteDesde), tramos: aTramos(h.tramos) }));
      const nacimiento = u.fechaNacimiento ? soloFecha(u.fechaNacimiento) : null;
      const tareas = asignaciones.filter((a) => a.usuarioId === u.id).map((a) => a.tarea);
      resultado.set(
        u.id,
        diasEntre(desde, hasta).map((fecha) => {
          const feriado = feriadoDe.get(fecha);
          return {
            fecha,
            tramos: tramosDelDia(fecha, suyos, porDefecto),
            feriado: feriado ? { nombre: feriado.nombre, medioDia: feriado.medioDia } : null,
            cumpleanos: esCumpleanos(nacimiento, fecha),
            ausencias: ausencias
              .filter((a) => a.usuarioId === u.id && soloFecha(a.fechaDesde) <= fecha && fecha <= soloFecha(a.fechaHasta))
              .map((a) => ({
                tipo: a.tipo,
                nombre: NOMBRE_TIPO_AUSENCIA[a.tipo],
                intervalo: a.minutoDesde !== null && a.minutoHasta !== null ? { inicio: a.minutoDesde, fin: a.minutoHasta } : null,
              })),
            tareas: tareas.filter((t) => soloFecha(t.fecha) === fecha).map((t) => aTareaAgenda(t)),
          };
        }),
      );
    }
    return resultado;
  }

  /**
   * Cola de trabajo de cada persona, planificada desde ahora en sus huecos libres
   * (horario − días no laborables − tareas con hora).
   */
  async colas(usuarioIds: string[], db: Cliente = this.prisma): Promise<Map<string, ColaDeUsuario>> {
    const filas = await db.tareaResponsable.findMany({
      where: { usuarioId: { in: usuarioIds }, ...EN_COLA },
      orderBy: [{ ordenCola: 'asc' }, { asignadoEn: 'asc' }],
      include: { tarea: { include: INCLUIR_TAREA_AGENDA } },
    });
    const conCola = [...new Set(filas.map((f) => f.usuarioId))];
    const resultado = new Map<string, ColaDeUsuario>();
    if (conCola.length === 0) return resultado;

    const ahora = ahoraEnLima();
    const entradas = await this.entradas(conCola, ahora.fecha, sumarDias(ahora.fecha, HORIZONTE_DIAS), db);
    for (const usuarioId of conCola) {
      const dias = (entradas.get(usuarioId) ?? []).map((e) => {
        const dia = calcularDia(e);
        const conHora = dia.tareas.filter((t) => t.inicio !== null && t.estado !== 'cancelada').map((t) => ({ inicio: t.inicio!, fin: t.fin! }));
        return { fecha: dia.fecha, huecos: huecosDelDia(dia.libres, conHora) };
      });
      const items = filas.filter((f) => f.usuarioId === usuarioId).map((f) => ({ ordenCola: f.ordenCola!, tarea: f.tarea }));
      const planes = planificar(
        dias,
        items.map(({ tarea: t }) => ({ id: t.id, minutos: t.minutosEstimados, noAntesDe: soloFecha(t.fecha) })),
        ahora,
      );
      resultado.set(usuarioId, { items, planes });
    }
    return resultado;
  }

  /** Agenda día por día de varias personas, con los tramos planificados de su cola. */
  async calcular(usuarioIds: string[], desde: string, hasta: string, db: Cliente = this.prisma): Promise<Map<string, DiaAgenda[]>> {
    const [entradas, colas] = await Promise.all([this.entradas(usuarioIds, desde, hasta, db), this.colas(usuarioIds, db)]);
    for (const [usuarioId, cola] of colas) {
      const dias = entradas.get(usuarioId) ?? [];
      for (const { tarea } of cola.items) {
        for (const s of cola.planes.get(tarea.id)?.segmentos ?? []) {
          const dia = dias.find((d) => d.fecha === s.fecha);
          if (dia) dia.tareas.push({ ...aTareaAgenda(tarea), inicio: s.inicio, fin: s.fin, minutos: s.fin - s.inicio, enCola: true });
        }
      }
    }
    return new Map([...entradas].map(([id, dias]) => [id, dias.map(calcularDia)]));
  }

  /** Disponibilidad de cada persona para una tarea (día y, si la tiene, hora). */
  async disponibilidad(
    usuarioIds: string[],
    tarea: { id?: string; fecha: string; inicio: Date | null; minutos: number },
    db: Cliente = this.prisma,
  ): Promise<Map<string, Disponibilidad>> {
    const agendas = await this.calcular(usuarioIds, tarea.fecha, tarea.fecha, db);
    const inicio = tarea.inicio ? horaAMinutos(horaEnLima(tarea.inicio)) : null;
    return new Map([...agendas].map(([id, [dia]]) => [id, evaluar(dia, { id: tarea.id, inicio, minutos: tarea.minutos })]));
  }

  async deUsuario(usuarioId: string, desde: string, hasta: string): Promise<AgendaPersona> {
    const [persona] = await this.personas({ id: usuarioId }, desde, hasta);
    return persona;
  }

  /** Agenda del personal (todos menos quienes solo son administradores), opcionalmente de un rol. */
  async equipo(desde: string, hasta: string, rol?: string): Promise<AgendaEquipo> {
    return { desde, hasta, personas: await this.personas(this.filtroPersonal(rol), desde, hasta) };
  }

  filtroPersonal(rol?: string): Prisma.UsuarioWhereInput {
    return {
      activo: true,
      eliminadoEn: null,
      roles: { some: { rol: { activo: true, ...(rol ? { codigo: rol } : { codigo: { not: ROLES_BASE.ADMIN } }) } } },
    };
  }

  private async personas(where: Prisma.UsuarioWhereInput, desde: string, hasta: string): Promise<AgendaPersona[]> {
    const usuarios = await this.prisma.usuario.findMany({
      where,
      orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }],
      select: { id: true, nombres: true, apellidos: true, roles: { select: { rol: { select: { nombre: true } } } } },
    });
    const agendas = await this.calcular(
      usuarios.map((u) => u.id),
      desde,
      hasta,
    );
    return usuarios.map((u) => ({
      usuario: { id: u.id, nombres: u.nombres, apellidos: u.apellidos },
      roles: u.roles.map((r) => r.rol.nombre),
      dias: agendas.get(u.id) ?? [],
    }));
  }
}

export function aTareaAgenda(t: TareaDeAgenda): TareaAgenda {
  const inicio = t.inicio ? horaAMinutos(horaEnLima(t.inicio)) : null;
  const contacto = t.prospecto?.contactos[0]?.persona;
  const nombreContacto = contacto ? [contacto.nombres, contacto.apellidos].filter(Boolean).join(' ') || null : null;
  const actividad = t.titulo ?? t.actividad.nombre;
  return {
    id: t.id,
    actividad,
    comportamiento: t.actividad.tipo.comportamiento,
    color: t.actividad.tipo.color,
    estado: t.estado,
    inicio,
    fin: inicio === null ? null : inicio + t.minutosEstimados,
    minutos: t.minutosEstimados,
    referencia: t.prospecto
      ? { tipo: 'prospecto', id: t.prospecto.id, codigo: t.prospecto.codigo, nombre: nombreContacto }
      : t.trabajo
        ? { tipo: 'trabajo', id: t.trabajo.id, codigo: t.trabajo.codigo, nombre: t.entregable?.nombre ?? t.trabajo.titulo }
        : null,
    enCola: false,
  };
}
