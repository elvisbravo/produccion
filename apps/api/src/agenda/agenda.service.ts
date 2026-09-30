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
import { calcularDia, esCumpleanos, evaluar, tramosDelDia, type HorarioVigencia } from './disponibilidad.js';

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

@Injectable()
export class AgendaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tramos de la plantilla por defecto (para quien no tiene horario propio). */
  async tramosPorDefecto(db: Cliente = this.prisma): Promise<TramoSemanal[]> {
    const plantilla = await db.plantillaHorario.findFirst({ where: { porDefecto: true }, include: { tramos: true } });
    return plantilla ? aTramos(plantilla.tramos) : [];
  }

  /** Agenda día por día de varias personas. */
  async calcular(usuarioIds: string[], desde: string, hasta: string, db: Cliente = this.prisma): Promise<Map<string, DiaAgenda[]>> {
    const [usuarios, horarios, porDefecto, feriados, ausencias, asignaciones] = await Promise.all([
      db.usuario.findMany({ where: { id: { in: usuarioIds } }, select: { id: true, fechaNacimiento: true } }),
      db.horarioUsuario.findMany({ where: { usuarioId: { in: usuarioIds }, vigenteDesde: { lte: aFecha(hasta) } }, include: { tramos: true } }),
      this.tramosPorDefecto(db),
      db.feriado.findMany({ where: { fecha: { gte: aFecha(desde), lte: aFecha(hasta) } } }),
      db.ausencia.findMany({
        where: { usuarioId: { in: usuarioIds }, estado: 'aprobada', fechaDesde: { lte: aFecha(hasta) }, fechaHasta: { gte: aFecha(desde) } },
      }),
      db.tareaResponsable.findMany({
        where: { usuarioId: { in: usuarioIds }, tarea: { fecha: { gte: aFecha(desde), lte: aFecha(hasta) }, estado: { notIn: ['cancelada', 'por_asignar'] } } },
        include: {
          tarea: {
            include: {
              actividad: { include: { tipo: true } },
              prospecto: {
                select: {
                  id: true,
                  codigo: true,
                  contactos: { orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }], take: 1, select: { persona: { select: { nombres: true, apellidos: true } } } },
                },
              },
            },
          },
        },
      }),
    ]);

    const feriadoDe = new Map(feriados.map((f) => [soloFecha(f.fecha), f]));
    const resultado = new Map<string, DiaAgenda[]>();
    for (const u of usuarios) {
      const suyos: HorarioVigencia[] = horarios.filter((h) => h.usuarioId === u.id).map((h) => ({ vigenteDesde: soloFecha(h.vigenteDesde), tramos: aTramos(h.tramos) }));
      const nacimiento = u.fechaNacimiento ? soloFecha(u.fechaNacimiento) : null;
      const tareas = asignaciones.filter((a) => a.usuarioId === u.id).map((a) => a.tarea);
      resultado.set(
        u.id,
        diasEntre(desde, hasta).map((fecha) => {
          const feriado = feriadoDe.get(fecha);
          return calcularDia({
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
            tareas: tareas.filter((t) => soloFecha(t.fecha) === fecha).map(aTareaAgenda),
          });
        }),
      );
    }
    return resultado;
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
    const where: Prisma.UsuarioWhereInput = {
      activo: true,
      eliminadoEn: null,
      roles: { some: { rol: { activo: true, ...(rol ? { codigo: rol } : { codigo: { not: ROLES_BASE.ADMIN } }) } } },
    };
    return { desde, hasta, personas: await this.personas(where, desde, hasta) };
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

type TareaDeAgenda = Prisma.TareaGetPayload<{
  include: {
    actividad: { include: { tipo: true } };
    prospecto: { select: { id: true; codigo: true; contactos: { select: { persona: { select: { nombres: true; apellidos: true } } } } } };
  };
}>;

function aTareaAgenda(t: TareaDeAgenda): TareaAgenda {
  const inicio = t.inicio ? horaAMinutos(horaEnLima(t.inicio)) : null;
  const contacto = t.prospecto?.contactos[0]?.persona;
  const nombre = contacto ? [contacto.nombres, contacto.apellidos].filter(Boolean).join(' ') || null : null;
  return {
    id: t.id,
    actividad: t.actividad.nombre,
    comportamiento: t.actividad.tipo.comportamiento,
    color: t.actividad.tipo.color,
    estado: t.estado,
    inicio,
    fin: inicio === null ? null : inicio + t.minutosEstimados,
    minutos: t.minutosEstimados,
    referencia: t.prospecto ? { tipo: 'prospecto', id: t.prospecto.id, codigo: t.prospecto.codigo, nombre } : null,
  };
}
