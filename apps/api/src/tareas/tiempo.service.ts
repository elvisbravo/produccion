import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  diaEnLima,
  instanteDesdeLima,
  sumarDias,
  type FilaComparacion,
  type ReporteTiempos,
  type TiempoActivo,
  type TiempoManualDatos,
  type TiemposDeTarea,
} from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProduccionService } from '../produccion/produccion.service.js';
import { minutosReales } from './mapeo.js';
import { cerrarTramos } from './tramos.js';

export interface ActorTiempo {
  usuarioId: string;
  ip: string | null;
}

const CAMPOS_USUARIO = { id: true, nombres: true, apellidos: true } as const;
const ACTIVAS = ['pendiente', 'en_proceso'] as const;
/** Un registro manual no puede pasar de un día de trabajo largo. */
const MAX_MINUTOS_MANUAL = 16 * 60;
const minutosEntre = (inicio: Date, fin: Date) => Math.max(0, Math.round((fin.getTime() - inicio.getTime()) / 60_000));
const errorCampo = (campo: string, mensaje: string) => new BadRequestException({ message: 'Datos inválidos', errores: [{ campo, mensaje }] });

const fila = (estimados: number, reales: number, tareas: number): FilaComparacion => ({
  tareas,
  minutosEstimados: estimados,
  minutosReales: reales,
  desviacion: estimados > 0 ? Math.round((reales / estimados - 1) * 1000) / 1000 : null,
});

const mediana = (valores: number[]) => {
  const v = [...valores].sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
};

@Injectable()
export class TiempoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
    private readonly auditoria: AuditoriaService,
    private readonly produccion: ProduccionService,
  ) {}

  /** La tarea debe estar activa y la persona ser su responsable. */
  private async tareaPropia(tareaId: string, usuarioId: string) {
    const tarea = await this.prisma.tarea.findUnique({
      where: { id: tareaId },
      include: { actividad: { include: { tipo: true } }, responsables: { select: { usuarioId: true } }, prospecto: { select: { id: true, codigo: true } }, trabajo: { select: { id: true, codigo: true } } },
    });
    if (!tarea) throw new NotFoundException('Tarea no encontrada');
    if (!tarea.responsables.some((r) => r.usuarioId === usuarioId)) throw new ForbiddenException('Solo quien realiza la tarea registra su tiempo');
    return tarea;
  }

  async activo(usuarioId: string): Promise<TiempoActivo | null> {
    const r = await this.prisma.registroTiempo.findFirst({
      where: { usuarioId, fin: null },
      include: {
        tarea: {
          include: {
            actividad: { include: { tipo: true } },
            prospecto: { select: { id: true, codigo: true } },
            trabajo: { select: { id: true, codigo: true } },
            tiempos: { where: { usuarioId, fin: { not: null } }, select: { minutos: true } },
          },
        },
      },
    });
    if (!r) return null;
    const t = r.tarea;
    return {
      registroId: r.id,
      tarea: {
        id: t.id,
        titulo: t.titulo ?? t.actividad.nombre,
        color: t.actividad.tipo.color,
        referencia: t.prospecto?.codigo ?? t.trabajo?.codigo ?? null,
        enlace: t.trabajo ? '/tareas?vista=cola' : t.prospecto ? `/prospectos/${t.prospecto.id}` : '/tareas',
      },
      inicio: r.inicio.toISOString(),
      minutosPrevios: t.tiempos.reduce((s, x) => s + (x.minutos ?? 0), 0),
      minutosEstimados: t.minutosEstimados,
    };
  }

  /**
   * Inicia el cronómetro en una tarea. Si la persona tenía otro corriendo, ese se pausa solo
   * (se trabaja en una cosa a la vez). La tarea pasa a "en proceso".
   */
  async iniciar(tareaId: string, actor: ActorTiempo): Promise<TiempoActivo> {
    const tarea = await this.tareaPropia(tareaId, actor.usuarioId);
    if (!(ACTIVAS as readonly string[]).includes(tarea.estado)) throw new BadRequestException('Solo se cronometran tareas pendientes o en proceso');
    const ahora = new Date();
    await this.prisma.$transaction(async (tx) => {
      const abierto = await tx.registroTiempo.findFirst({ where: { usuarioId: actor.usuarioId, fin: null } });
      if (abierto?.tareaId === tareaId) return;
      await cerrarTramos(tx, { usuarioId: actor.usuarioId }, ahora);
      await tx.registroTiempo.create({ data: { tareaId, usuarioId: actor.usuarioId, inicio: ahora } });
      if (tarea.estado === 'pendiente') {
        await tx.tarea.update({ where: { id: tareaId }, data: { estado: 'en_proceso' } });
        if (tarea.trabajoId) await this.produccion.alAvanzarTarea(tx, tareaId, false);
      }
    });
    return (await this.activo(actor.usuarioId))!;
  }

  async pausar(tareaId: string, actor: ActorTiempo): Promise<void> {
    await this.tareaPropia(tareaId, actor.usuarioId);
    await this.prisma.$transaction((tx) => cerrarTramos(tx, { usuarioId: actor.usuarioId, tareaId }));
  }

  async deTarea(tareaId: string): Promise<TiemposDeTarea> {
    const tarea = await this.prisma.tarea.findUnique({
      where: { id: tareaId },
      include: { tiempos: { orderBy: { inicio: 'desc' }, include: { usuario: { select: CAMPOS_USUARIO } } } },
    });
    if (!tarea) throw new NotFoundException('Tarea no encontrada');
    return {
      minutosEstimados: tarea.minutosEstimados,
      minutosReales: minutosReales(tarea.tiempos),
      registros: tarea.tiempos.map((r) => ({
        id: r.id,
        usuario: r.usuario,
        inicio: r.inicio.toISOString(),
        fin: r.fin?.toISOString() ?? null,
        minutos: r.minutos,
        manual: r.manual,
        motivo: r.motivo,
        autoCerrado: r.autoCerrado,
      })),
    };
  }

  /** Tiempo ingresado a mano (olvidó marcar): no en el futuro y sin cruzarse con otros tramos suyos. */
  async manual(tareaId: string, datos: TiempoManualDatos, actor: ActorTiempo): Promise<TiemposDeTarea> {
    const tarea = await this.tareaPropia(tareaId, actor.usuarioId);
    if (tarea.estado === 'cancelada' || tarea.estado === 'por_asignar') throw new BadRequestException('Esta tarea no admite registro de tiempo');
    const inicio = instanteDesdeLima(datos.fecha, datos.horaInicio);
    const fin = instanteDesdeLima(datos.fecha, datos.horaFin);
    const minutos = minutosEntre(inicio, fin);
    if (fin > new Date()) throw errorCampo('horaFin', 'No se registra tiempo a futuro');
    if (datos.fecha < sumarDias(diaEnLima(), -30)) throw errorCampo('fecha', 'Solo hasta 30 días atrás');
    if (minutos > MAX_MINUTOS_MANUAL) throw errorCampo('horaFin', 'Máximo 16 horas en un registro');
    const cruce = await this.prisma.registroTiempo.findFirst({
      where: { usuarioId: actor.usuarioId, inicio: { lt: fin }, OR: [{ fin: { gt: inicio } }, { fin: null }] },
      include: { tarea: { include: { actividad: true } } },
    });
    if (cruce) throw new ConflictException(`Se cruza con otro tiempo tuyo en "${cruce.tarea.titulo ?? cruce.tarea.actividad.nombre}"`);
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.registroTiempo.create({ data: { tareaId, usuarioId: actor.usuarioId, inicio, fin, minutos, manual: true, motivo: datos.motivo } });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'tiempo_manual', entidad: 'tarea', entidadId: tareaId, despues: { registroId: r.id, ...datos }, ip: actor.ip }, tx);
    });
    return this.deTarea(tareaId);
  }

  /** Quita un registro manual propio (o cualquiera, si edita todas las tareas). */
  async eliminar(tareaId: string, registroId: string, actor: ActorTiempo): Promise<TiemposDeTarea> {
    const r = await this.prisma.registroTiempo.findFirst({ where: { id: registroId, tareaId } });
    if (!r) throw new NotFoundException('Registro no encontrado');
    const todos = (await this.permisos.efectivos(actor.usuarioId))['tareas.editar'] === 'todos';
    if (!todos && (r.usuarioId !== actor.usuarioId || !r.manual)) throw new ForbiddenException('Solo puedes quitar tus registros manuales');
    await this.prisma.$transaction(async (tx) => {
      await tx.registroTiempo.delete({ where: { id: registroId } });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'quitar_tiempo', entidad: 'tarea', entidadId: tareaId, antes: r, ip: actor.ip }, tx);
    });
    return this.deTarea(tareaId);
  }

  // ─── Reporte ─────────────────────────────────────────────

  /** Estimado frente a real de las tareas completadas en el periodo (las que tienen tiempo registrado). */
  async reporte(desdeQ?: string, hastaQ?: string): Promise<ReporteTiempos> {
    const hasta = hastaQ ?? diaEnLima();
    const desde = desdeQ ?? sumarDias(hasta, -29);
    const tareas = await this.prisma.tarea.findMany({
      where: {
        estado: 'completada',
        completadaEn: { gte: instanteDesdeLima(desde, '00:00'), lt: instanteDesdeLima(sumarDias(hasta, 1), '00:00') },
        tiempos: { some: { fin: { not: null } } },
      },
      include: {
        actividad: { include: { tipo: true } },
        prospecto: { select: { id: true, codigo: true } },
        trabajo: { select: { id: true, codigo: true } },
        tiempos: { where: { fin: { not: null } }, include: { usuario: { select: CAMPOS_USUARIO } } },
      },
    });

    const conReal = tareas.map((t) => ({ t, real: t.tiempos.reduce((s, r) => s + (r.minutos ?? 0), 0) }));
    const total = fila(
      conReal.reduce((s, x) => s + x.t.minutosEstimados, 0),
      conReal.reduce((s, x) => s + x.real, 0),
      conReal.length,
    );

    const porActividad = new Map<string, typeof conReal>();
    for (const x of conReal) porActividad.set(x.t.actividadId, [...(porActividad.get(x.t.actividadId) ?? []), x]);
    const actividades = await this.prisma.actividad.findMany({ where: { id: { in: [...porActividad.keys()] } }, include: { tipo: true } });

    const porPersona = new Map<string, { usuario: { id: string; nombres: string; apellidos: string }; tareas: Set<string>; est: number; real: number; manual: number }>();
    for (const { t } of conReal) {
      for (const r of t.tiempos) {
        const p = porPersona.get(r.usuarioId) ?? { usuario: r.usuario, tareas: new Set<string>(), est: 0, real: 0, manual: 0 };
        if (!p.tareas.has(t.id)) {
          p.tareas.add(t.id);
          p.est += t.minutosEstimados;
        }
        p.real += r.minutos ?? 0;
        if (r.manual) p.manual += r.minutos ?? 0;
        porPersona.set(r.usuarioId, p);
      }
    }

    return {
      desde,
      hasta,
      total,
      porActividad: [...porActividad]
        .map(([id, lista]) => {
          const a = actividades.find((x) => x.id === id)!;
          return {
            ...fila(
              lista.reduce((s, x) => s + x.t.minutosEstimados, 0),
              lista.reduce((s, x) => s + x.real, 0),
              lista.length,
            ),
            actividad: { id, nombre: a.nombre, color: a.tipo.color },
            estimadoCatalogo: a.minutosEstimados,
            medianaReal: mediana(lista.map((x) => x.real)),
          };
        })
        .sort((a, b) => b.minutosReales - a.minutosReales),
      porPersona: [...porPersona.values()]
        .map((p) => ({ ...fila(p.est, p.real, p.tareas.size), usuario: p.usuario, minutosManuales: p.manual }))
        .sort((a, b) => a.usuario.nombres.localeCompare(b.usuario.nombres)),
      mayoresDesvios: conReal
        .sort((a, b) => Math.abs(b.real - b.t.minutosEstimados) - Math.abs(a.real - a.t.minutosEstimados))
        .slice(0, 15)
        .map(({ t, real }) => ({
          id: t.id,
          titulo: t.titulo ?? t.actividad.nombre,
          actividad: t.actividad.nombre,
          referencia: t.prospecto ? { tipo: 'prospecto' as const, ...t.prospecto } : t.trabajo ? { tipo: 'trabajo' as const, ...t.trabajo } : null,
          responsables: [...new Set(t.tiempos.map((r) => `${r.usuario.nombres} ${r.usuario.apellidos}`))],
          minutosEstimados: t.minutosEstimados,
          minutosReales: real,
          desviacion: fila(t.minutosEstimados, real, 1).desviacion,
          completadaEn: t.completadaEn!.toISOString(),
        })),
    };
  }
}
