import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  horaEnLima,
  ROLES_BASE,
  type AplicarReasignacionDatos,
  type CandidatoReasignacion,
  MAX_PERSONAS_URGENTE,
  type EjecutarUrgenteDatos,
  type ImpactoReparto,
  type ImpactoUrgente,
  type MotivoCandidato,
  type PlanReasignacion,
  type PropuestaReasignacion,
  type PropuestaUrgente,
  type RepartoUrgente,
  type ResultadoPlan,
  type Semaforo,
  type SolicitudUrgenteItem,
} from '@grupoes/shared';
import { AgendaService, aTareaEnCola, type TareaDeAgenda } from '../agenda/agenda.service.js';
import { holgura, planificar, type PlanCola } from '../agenda/cola.js';
import { AuditoriaService } from '../common/auditoria.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type ActorProduccion } from './produccion.service.js';

type Tx = Prisma.TransactionClient;
const CAMPOS_USUARIO = { id: true, nombres: true, apellidos: true } as const;
const soloFecha = (d: Date) => d.toISOString().slice(0, 10);
const nombreDe = (u: { nombres: string; apellidos: string }) => `${u.nombres} ${u.apellidos}`;
const ACTIVAS = ['pendiente', 'en_proceso'] as const;
const RANGO: Record<Semaforo, number> = { verde: 0, ambar: 1, rojo: 2, sin_plan: 3 };
const ORDEN_MOTIVO: Record<MotivoCandidato, number> = { equipo: 0, auxiliar: 1, jefe: 2 };

/** Fecha límite de una tarea de la cola: la de su entregable o la del trabajo. */
const limiteDe = (t: TareaDeAgenda) => (t.entregable ? soloFecha(t.entregable.fechaLimite) : t.trabajo ? soloFecha(t.trabajo.fechaLimite) : null);

function resultado(plan: PlanCola | undefined, fechaLimite: string | null): ResultadoPlan {
  const fin = plan?.fin ? new Date(new Date(`${plan.fin.fecha}T00:00:00-05:00`).getTime() + plan.fin.fin * 60_000).toISOString() : null;
  if (!fechaLimite) return { fin, semaforo: plan?.fin ? 'verde' : 'sin_plan', holguraDias: null };
  const h = holgura(plan?.fin?.fecha ?? null, fechaLimite);
  return { fin, semaforo: h.semaforo, holguraDias: h.dias };
}

const enRiesgo = (r: ResultadoPlan | null) => r?.semaforo === 'rojo' || r?.semaforo === 'sin_plan';

const INCLUIR_FILA_URGENTE = {
  tarea: { include: { entregable: { select: { orden: true } }, actividad: { include: { tipo: true } } } },
} as const satisfies Prisma.TareaResponsableInclude;
type FilaUrgente = Prisma.TareaResponsableGetPayload<{ include: typeof INCLUIR_FILA_URGENTE }>;

/** Para planificar: la tarea con lo que hace falta para su fecha límite. */
const INCLUIR_TAREA_PLAN = {
  actividad: { include: { tipo: true } },
  trabajo: { select: { id: true, codigo: true, fechaLimite: true } },
  entregable: { select: { fechaLimite: true } },
} as const satisfies Prisma.TareaInclude;

/** Las tareas pendientes de un entregable de la urgencia, que van juntas a una misma persona. */
interface BloqueInterno {
  entregableId: string | null;
  filas: FilaUrgente[];
  minutos: number;
  /** Tiene tareas de elaboración o corrección (no solo revisión). */
  elabora: boolean;
}
interface Candidato {
  id: string;
  nombres: string;
  apellidos: string;
  roles: { rol: { codigo: string; activo: boolean } }[];
}
interface GrupoReparto {
  usuario: { id: string; nombres: string; apellidos: string };
  bloques: BloqueInterno[];
  filas: FilaUrgente[];
}

const INCLUIR_URGENTE = {
  trabajo: { select: { id: true, codigo: true, titulo: true, fechaLimite: true, prioridad: { select: { nombre: true, color: true } } } },
  solicitadaPor: { select: CAMPOS_USUARIO },
  resueltaPor: { select: CAMPOS_USUARIO },
  usuarioAsignado: { select: CAMPOS_USUARIO },
  asignaciones: { include: { usuario: { select: CAMPOS_USUARIO } } },
} as const satisfies Prisma.SolicitudUrgenteInclude;

@Injectable()
export class ContingenciasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agenda: AgendaService,
    private readonly auditoria: AuditoriaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // ─── Utilidades ──────────────────────────────────────────

  /** Rol con el que una persona puede cubrir una participación (o error si no tiene ninguno permitido). */
  private async rolPara(db: Tx | PrismaService, participacionId: string, usuarioId: string) {
    const [permitidos, roles] = await Promise.all([
      db.actividadParticipacionRol.findMany({ where: { participacionId } }),
      db.usuarioRol.findMany({ where: { usuarioId, rol: { activo: true }, usuario: { activo: true, eliminadoEn: null } } }),
    ]);
    const rol = permitidos.find((p) => roles.some((r) => r.rolId === p.rolId));
    if (!rol) throw new BadRequestException({ message: 'Datos inválidos', errores: [{ campo: 'usuarioId', mensaje: 'Esa persona no tiene un rol permitido para esta tarea' }] });
    return { rolId: rol.rolId, prioridadRolId: rol.prioridadRolId };
  }

  /** Si la tarea es de un trabajo y la persona no está en su equipo, entra como auxiliar de apoyo. */
  private async sumarAlEquipo(tx: Tx, trabajoId: string, usuarioId: string, actor: ActorProduccion, motivo: string) {
    const enEquipo = await tx.trabajoEquipo.count({ where: { trabajoId, usuarioId, hasta: null } });
    const esAuxiliar = await tx.usuarioRol.count({ where: { usuarioId, rol: { codigo: ROLES_BASE.AUXILIAR } } });
    if (enEquipo || !esAuxiliar) return;
    await tx.trabajoEquipo.create({ data: { trabajoId, usuarioId, funcion: 'auxiliar_apoyo', desde: new Date(), asignadoPorId: actor.usuarioId, motivo } });
  }

  private personal(roles: string[]) {
    return this.prisma.usuario.findMany({
      where: { activo: true, eliminadoEn: null, roles: { some: { rol: { activo: true, codigo: { in: roles } } } } },
      select: { ...CAMPOS_USUARIO, roles: { select: { rol: { select: { codigo: true, activo: true } } } } },
      orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }],
    });
  }

  // ─── Reasignación por ausencia ───────────────────────────

  /**
   * Qué pasa con las tareas de quien se ausenta:
   * - reuniones en esos días: reasignar a alguien libre a esa hora, o coordinar con el cliente;
   * - tareas de su cola: la cola se corre sola; si ya no llegan a su fecha, se propone a otra persona
   *   (equipo del trabajo → otros auxiliares → jefes) simulando cómo quedaría en su cola.
   */
  async planReasignacion(ausenciaId: string): Promise<PlanReasignacion> {
    const ausencia = await this.prisma.ausencia.findUnique({ where: { id: ausenciaId }, include: { usuario: { select: CAMPOS_USUARIO } } });
    if (!ausencia) throw new NotFoundException('Ausencia no encontrada');
    if (ausencia.estado !== 'aprobada') throw new BadRequestException('Solo se reasignan las tareas de ausencias aprobadas');
    const u = ausencia.usuarioId;
    const desde = soloFecha(ausencia.fechaDesde);
    const propuestas: PropuestaReasignacion[] = [];

    // Reuniones (con hora) dentro de la ausencia.
    const reuniones = await this.prisma.tareaResponsable.findMany({
      where: { usuarioId: u, tarea: { estado: { in: [...ACTIVAS] }, inicio: { not: null }, fecha: { gte: ausencia.fechaDesde, lte: ausencia.fechaHasta } } },
      include: { tarea: { include: { actividad: { include: { tipo: true } }, prospecto: { select: { id: true, codigo: true } }, trabajo: { select: { id: true, codigo: true } } } } },
    });
    for (const r of reuniones) {
      const t = r.tarea;
      const permitidos = await this.prisma.actividadParticipacionRol.findMany({ where: { participacionId: r.participacionId }, include: { rol: true } });
      const candidatos = (await this.personal(permitidos.map((p) => p.rol.codigo))).filter((c) => c.id !== u);
      const disponibilidad = await this.agenda.disponibilidad(
        candidatos.map((c) => c.id),
        { id: t.id, fecha: soloFecha(t.fecha), inicio: t.inicio, minutos: t.minutosEstimados },
      );
      const lista: CandidatoReasignacion[] = candidatos
        .map((c) => {
          const d = disponibilidad.get(c.id)!;
          const motivo: MotivoCandidato = c.roles.some((x) => x.rol.codigo === ROLES_BASE.JEFE_PROD) ? 'jefe' : 'auxiliar';
          return {
            usuario: { id: c.id, nombres: c.nombres, apellidos: c.apellidos },
            motivo,
            resultado: null,
            disponible: d.estado === 'libre',
            aviso: d.bloqueo ?? d.avisos[0] ?? null,
          };
        })
        .sort((a, b) => Number(b.disponible) - Number(a.disponible) || ORDEN_MOTIVO[a.motivo] - ORDEN_MOTIVO[b.motivo]);
      const sugerido = lista.find((c) => c.disponible)?.usuario.id ?? null;
      propuestas.push({
        tarea: {
          id: t.id,
          titulo: t.titulo ?? t.actividad.nombre,
          color: t.actividad.tipo.color,
          enCola: false,
          fecha: soloFecha(t.fecha),
          hora: horaEnLima(t.inicio!),
          minutos: t.minutosEstimados,
          referencia: t.prospecto ? { tipo: 'prospecto', ...t.prospecto } : t.trabajo ? { tipo: 'trabajo', ...t.trabajo } : null,
          fechaLimite: null,
        },
        actual: null,
        sugerencia: sugerido ? 'reasignar' : 'coordinar',
        sugerido,
        candidatos: lista,
      });
    }

    // Tareas de la cola que aún no terminan cuando empieza la ausencia.
    const base = (await this.agenda.basesDeCola([u])).get(u)!;
    const planActual = planificar(base.dias, base.items.map(({ tarea }) => aTareaEnCola(tarea)), base.ahora);
    const afectadas = base.items.filter(({ tarea }) => {
      const fin = planActual.get(tarea.id)?.fin?.fecha;
      return !fin || fin >= desde;
    });
    if (afectadas.length > 0) {
      const personal = (await this.personal([ROLES_BASE.AUXILIAR, ROLES_BASE.JEFE_PROD])).filter((c) => c.id !== u);
      const bases = await this.agenda.basesDeCola(personal.map((c) => c.id));
      const equipos = await this.prisma.trabajoEquipo.findMany({
        where: { trabajoId: { in: afectadas.map((a) => a.tarea.trabajoId!).filter(Boolean) }, hasta: null },
        select: { trabajoId: true, usuarioId: true, funcion: true },
      });
      for (const { tarea } of afectadas) {
        // Quien elabora no puede revisar lo suyo: el jefe responsable del trabajo no recibe su elaboración ni su corrección.
        const eselabora = ['produccion', 'correccion'].includes(tarea.actividad.tipo.comportamiento);
        const fechaLimite = limiteDe(tarea);
        const actual = resultado(planActual.get(tarea.id), fechaLimite);
        const responsable = await this.prisma.tareaResponsable.findFirst({ where: { tareaId: tarea.id, usuarioId: u } });
        const permitidos = new Set((await this.prisma.actividadParticipacionRol.findMany({ where: { participacionId: responsable!.participacionId }, include: { rol: true } })).map((p) => p.rol.codigo));
        const lista: CandidatoReasignacion[] = personal
          .filter((c) => c.roles.some((r) => permitidos.has(r.rol.codigo)))
          .map((c) => {
            const b = bases.get(c.id)!;
            const plan = planificar(b.dias, [...b.items.map(({ tarea: x }) => aTareaEnCola(x)), aTareaEnCola(tarea)], b.ahora).get(tarea.id);
            // Orden de búsqueda: auxiliares del equipo → otros auxiliares → jefes (aunque el jefe sea del equipo).
            const esAuxiliar = c.roles.some((r) => r.rol.codigo === ROLES_BASE.AUXILIAR);
            const enEquipo = equipos.some((e) => e.trabajoId === tarea.trabajoId && e.usuarioId === c.id);
            const motivo: MotivoCandidato = !esAuxiliar ? 'jefe' : enEquipo ? 'equipo' : 'auxiliar';
            const r = resultado(plan, fechaLimite);
            const esJefeDelTrabajo = eselabora && equipos.some((e) => e.trabajoId === tarea.trabajoId && e.usuarioId === c.id && e.funcion === 'jefe_responsable');
            return {
              usuario: { id: c.id, nombres: c.nombres, apellidos: c.apellidos },
              motivo,
              resultado: r,
              disponible: !esJefeDelTrabajo && r.semaforo !== 'rojo' && r.semaforo !== 'sin_plan',
              aviso: esJefeDelTrabajo ? 'Es el jefe responsable de este trabajo: si la elabora, otra persona tendría que revisarla' : null,
            };
          })
          .sort(
            (a, b) =>
              ORDEN_MOTIVO[a.motivo] - ORDEN_MOTIVO[b.motivo] ||
              RANGO[a.resultado!.semaforo] - RANGO[b.resultado!.semaforo] ||
              (a.resultado!.fin ?? '9').localeCompare(b.resultado!.fin ?? '9'),
          );
        const enRiesgo = actual.semaforo === 'rojo' || actual.semaforo === 'sin_plan';
        // Se sugiere a quien la termina a tiempo, en el orden de búsqueda (equipo → auxiliares → jefes).
        const sugerido = enRiesgo ? (lista.find((c) => c.disponible)?.usuario.id ?? null) : null;
        propuestas.push({
          tarea: {
            id: tarea.id,
            titulo: tarea.titulo ?? tarea.actividad.nombre,
            color: tarea.actividad.tipo.color,
            enCola: true,
            fecha: soloFecha(tarea.fecha),
            hora: null,
            minutos: tarea.minutosEstimados,
            referencia: tarea.trabajo ? { tipo: 'trabajo', id: tarea.trabajo.id, codigo: tarea.trabajo.codigo } : null,
            fechaLimite,
          },
          actual,
          sugerencia: enRiesgo ? 'reasignar' : 'posponer',
          sugerido,
          candidatos: lista,
        });
      }
    }

    // Primero lo que más urge: reuniones y tareas en rojo.
    const peso = (p: PropuestaReasignacion) => (p.tarea.enCola ? (p.sugerencia === 'reasignar' ? 1 : 2) : 0);
    propuestas.sort((a, b) => peso(a) - peso(b) || (a.tarea.fechaLimite ?? a.tarea.fecha).localeCompare(b.tarea.fechaLimite ?? b.tarea.fecha));
    return { ausenciaId, usuario: ausencia.usuario, propuestas };
  }

  async aplicarReasignacion(ausenciaId: string, datos: AplicarReasignacionDatos, actor: ActorProduccion): Promise<number> {
    const ausencia = await this.prisma.ausencia.findUnique({ where: { id: ausenciaId }, include: { usuario: true } });
    if (!ausencia || ausencia.estado !== 'aprobada') throw new BadRequestException('Solo se reasignan las tareas de ausencias aprobadas');
    const u = ausencia.usuarioId;
    await this.prisma.$transaction(async (tx) => {
      for (const cambio of datos.cambios) {
        if (cambio.usuarioId === u) continue;
        const responsable = await tx.tareaResponsable.findFirst({
          where: { tareaId: cambio.tareaId, usuarioId: u, tarea: { estado: { in: [...ACTIVAS] } } },
          include: { tarea: { include: { actividad: true } } },
        });
        if (!responsable) throw new ConflictException('Alguna tarea ya no está a cargo de esa persona: vuelve a cargar la propuesta');
        if (await tx.tareaResponsable.count({ where: { tareaId: cambio.tareaId, usuarioId: cambio.usuarioId } })) {
          throw new BadRequestException('Esa persona ya participa en la tarea');
        }
        const t = responsable.tarea;
        if (t.inicio) {
          const d = (await this.agenda.disponibilidad([cambio.usuarioId], { id: t.id, fecha: soloFecha(t.fecha), inicio: t.inicio, minutos: t.minutosEstimados }, tx)).get(cambio.usuarioId)!;
          if (d.estado === 'no_laborable') throw new BadRequestException(`No trabaja ese día (${d.bloqueo})`);
        }
        const rol = await this.rolPara(tx, responsable.participacionId, cambio.usuarioId);
        const enCola = responsable.ordenCola !== null;
        const ultimo = enCola
          ? ((await tx.tareaResponsable.aggregate({ where: { usuarioId: cambio.usuarioId, ordenCola: { not: null }, tarea: { estado: { in: [...ACTIVAS] } } }, _max: { ordenCola: true } }))._max.ordenCola ?? 0)
          : 0;
        await tx.tareaResponsable.update({
          where: { id: responsable.id },
          data: { usuarioId: cambio.usuarioId, ...rol, asignadoPorId: actor.usuarioId, asignadoEn: new Date(), ordenCola: enCola ? ultimo + 1 : null, forzado: false, motivoForzado: null },
        });
        if (t.estado === 'en_proceso') await tx.tarea.update({ where: { id: t.id }, data: { estado: 'pendiente' } });
        const motivo = `Ausencia de ${nombreDe(ausencia.usuario)}`;
        const destino = await tx.usuario.findUniqueOrThrow({ where: { id: cambio.usuarioId } });
        const detalle = `"${t.titulo ?? t.actividad.nombre}" pasó de ${nombreDe(ausencia.usuario)} a ${nombreDe(destino)} — ${motivo}`;
        if (t.trabajoId) {
          await this.sumarAlEquipo(tx, t.trabajoId, cambio.usuarioId, actor, motivo);
          await tx.trabajoEvento.create({ data: { trabajoId: t.trabajoId, tipo: 'equipo', detalle, usuarioId: actor.usuarioId } });
        }
        if (t.prospectoId) await tx.prospectoEvento.create({ data: { prospectoId: t.prospectoId, tipo: 'tarea', detalle, datos: { tareaId: t.id }, usuarioId: actor.usuarioId } });
      }
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'reasignar_por_ausencia', entidad: 'ausencia', entidadId: ausenciaId, despues: datos, ip: actor.ip }, tx);
    });
    const porPersona = new Map<string, number>();
    for (const c of datos.cambios) if (c.usuarioId !== u) porPersona.set(c.usuarioId, (porPersona.get(c.usuarioId) ?? 0) + 1);
    for (const [usuarioId, n] of porPersona) {
      await this.notificaciones.notificar(
        [usuarioId],
        { tipo: 'tarea.reasignada', titulo: `Recibiste ${n} ${n === 1 ? 'tarea' : 'tareas'} de ${nombreDe(ausencia.usuario)}`, mensaje: 'Por su ausencia', enlace: '/tareas' },
        actor.usuarioId,
      );
    }
    return datos.cambios.length;
  }

  // ─── Inserción urgente ───────────────────────────────────

  private async aItem(s: Prisma.SolicitudUrgenteGetPayload<{ include: typeof INCLUIR_URGENTE }>): Promise<SolicitudUrgenteItem> {
    const pendientes = await this.prisma.tarea.aggregate({
      where: { trabajoId: s.trabajoId, estado: { in: [...ACTIVAS] }, inicio: null },
      _count: true,
      _sum: { minutosEstimados: true },
    });
    return {
      id: s.id,
      trabajo: { ...s.trabajo, fechaLimite: soloFecha(s.trabajo.fechaLimite) },
      motivo: s.motivo,
      estado: s.estado,
      solicitadaPor: s.solicitadaPor,
      solicitadaEn: s.solicitadaEn.toISOString(),
      resueltaPor: s.resueltaPor,
      resueltaEn: s.resueltaEn?.toISOString() ?? null,
      usuarioAsignado: s.usuarioAsignado,
      asignaciones: [...new Map(s.asignaciones.map((a) => [a.usuarioId, a.usuario])).values()].map((usuario) => ({
        usuario,
        tareas: s.asignaciones.filter((a) => a.usuarioId === usuario.id).reduce((n, a) => n + a.tareas, 0),
        minutos: s.asignaciones.filter((a) => a.usuarioId === usuario.id).reduce((n, a) => n + a.minutos, 0),
      })),
      observacion: s.observacion,
      tareasPendientes: pendientes._count,
      minutosPendientes: pendientes._sum.minutosEstimados ?? 0,
    };
  }

  async urgentes(estado?: 'pendiente' | 'ejecutada' | 'rechazada', trabajoId?: string): Promise<SolicitudUrgenteItem[]> {
    const filas = await this.prisma.solicitudUrgente.findMany({
      where: { estado, trabajoId },
      include: INCLUIR_URGENTE,
      orderBy: { solicitadaEn: 'desc' },
      take: 100,
    });
    return Promise.all(filas.map((f) => this.aItem(f)));
  }

  /** La asistente administrativa autoriza la urgencia: el trabajo pasa a prioridad urgente y producción la ejecuta. */
  async solicitarUrgente(trabajoId: string, motivo: string, actor: ActorProduccion): Promise<SolicitudUrgenteItem> {
    const trabajo = await this.prisma.trabajo.findFirst({ where: { id: trabajoId, eliminadoEn: null } });
    if (!trabajo) throw new NotFoundException('Trabajo no encontrado');
    if (['finalizado', 'cancelado'].includes(trabajo.estado)) throw new BadRequestException('El trabajo ya está cerrado');
    if (await this.prisma.solicitudUrgente.count({ where: { trabajoId, estado: 'pendiente' } })) throw new ConflictException('Ya hay una solicitud de urgencia pendiente para este trabajo');
    const urgente = await this.prisma.prioridadTrabajo.findFirst({ where: { permiteInsercionUrgente: true, activo: true }, orderBy: { nivel: 'asc' } });
    const id = await this.prisma.$transaction(async (tx) => {
      const s = await tx.solicitudUrgente.create({ data: { trabajoId, motivo, solicitadaPorId: actor.usuarioId } });
      await tx.trabajo.update({
        where: { id: trabajoId },
        data: {
          ...(urgente && { prioridadId: urgente.id }),
          eventos: { create: { tipo: 'estado', detalle: `Urgencia autorizada — ${motivo}`, usuarioId: actor.usuarioId } },
        },
      });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'solicitar_urgente', entidad: 'trabajo', entidadId: trabajoId, despues: { motivo }, ip: actor.ip }, tx);
      return s.id;
    });
    await this.notificaciones.notificar(
      await this.notificaciones.conPermiso('programacion.insertar_urgente'),
      { tipo: 'urgente.solicitada', titulo: `Urgencia por insertar: ${trabajo.codigo}`, mensaje: motivo, enlace: '/programacion?vista=urgentes' },
      actor.usuarioId,
    );
    return this.aItem(await this.prisma.solicitudUrgente.findUniqueOrThrow({ where: { id }, include: INCLUIR_URGENTE }));
  }

  private async pendiente(id: string) {
    const s = await this.prisma.solicitudUrgente.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Solicitud no encontrada');
    if (s.estado !== 'pendiente') throw new BadRequestException('La solicitud ya se resolvió');
    return s;
  }

  /** Tareas en cola del trabajo urgente (de cualquier responsable), en su orden natural. */
  private async tareasUrgentes(trabajoId: string): Promise<FilaUrgente[]> {
    const filas = await this.prisma.tareaResponsable.findMany({
      where: { ordenCola: { not: null }, tarea: { trabajoId, estado: { in: [...ACTIVAS] }, inicio: null } },
      include: INCLUIR_FILA_URGENTE,
    });
    if (filas.length === 0) throw new BadRequestException('El trabajo no tiene tareas pendientes en cola: genera su plan o agrégale tareas');
    return filas.sort((a, b) => (a.tarea.entregable?.orden ?? 0) - (b.tarea.entregable?.orden ?? 0) || a.tarea.creadoEn.getTime() - b.tarea.creadoEn.getTime());
  }

  private async validarAuxiliar(usuarioId: string) {
    const u = await this.prisma.usuario.findFirst({
      where: { id: usuarioId, activo: true, eliminadoEn: null, roles: { some: { rol: { codigo: { in: [ROLES_BASE.AUXILIAR, ROLES_BASE.JEFE_PROD] } } } } },
      select: CAMPOS_USUARIO,
    });
    if (!u) throw new BadRequestException({ message: 'Datos inválidos', errores: [{ campo: 'usuarioId', mensaje: 'Debe ser un auxiliar o jefe de producción activo' }] });
    return u;
  }

  // ─── Reparto de la urgencia ──────────────────────────────

  /** Roles permitidos de cada participación: quién puede tomar cada tarea. */
  private async permitidosPorParticipacion(participacionIds: string[]) {
    const filas = await this.prisma.actividadParticipacionRol.findMany({ where: { participacionId: { in: participacionIds } }, include: { rol: { select: { codigo: true } } } });
    const mapa = new Map<string, Set<string>>();
    for (const f of filas) mapa.set(f.participacionId, new Set([...(mapa.get(f.participacionId) ?? []), f.rol.codigo]));
    return mapa;
  }

  private async jefeResponsableDe(trabajoId: string): Promise<string | null> {
    return (await this.prisma.trabajoEquipo.findFirst({ where: { trabajoId, funcion: 'jefe_responsable', hasta: null }, select: { usuarioId: true } }))?.usuarioId ?? null;
  }

  /** Las tareas de la urgencia agrupadas por entregable (las que no tienen entregable van juntas), en su orden natural. */
  private agrupar(filas: FilaUrgente[]): BloqueInterno[] {
    const bloques = new Map<string, BloqueInterno>();
    for (const f of filas) {
      const clave = f.tarea.entregableId ?? 'sin-entregable';
      const b = bloques.get(clave) ?? { entregableId: f.tarea.entregableId, filas: [], minutos: 0, elabora: false };
      b.filas.push(f);
      b.minutos += f.tarea.minutosEstimados;
      b.elabora ||= ['produccion', 'correccion'].includes(f.tarea.actividad.tipo.comportamiento);
      bloques.set(clave, b);
    }
    return [...bloques.values()];
  }

  /** ¿Puede esta persona tomar todo el bloque? Con un rol permitido para cada tarea y, si se elabora, sin ser el jefe que luego lo revisa. */
  private puedeTomar(c: Candidato, b: BloqueInterno, permitidos: Map<string, Set<string>>, jefeId: string | null): boolean {
    const roles = new Set(c.roles.filter((r) => r.rol.activo).map((r) => r.rol.codigo));
    if (b.elabora && c.id === jefeId) return false;
    return b.filas.every((f) => [...(permitidos.get(f.participacionId) ?? [])].some((codigo) => roles.has(codigo)));
  }

  /** Todo el trabajo para una sola persona (la urgencia de siempre). */
  private async repartoUnico(trabajoId: string, usuarioId: string): Promise<RepartoUrgente> {
    return this.agrupar(await this.tareasUrgentes(trabajoId)).map((b) => ({ entregableId: b.entregableId, usuarioId }));
  }

  /** Bloques y reparto sugerido (el que termina antes), para que producción lo ajuste. */
  async propuestaUrgente(id: string): Promise<PropuestaUrgente> {
    const s = await this.pendiente(id);
    const filas = await this.tareasUrgentes(s.trabajoId);
    const bloques = this.agrupar(filas);
    const jefeId = await this.jefeResponsableDe(s.trabajoId);
    const personal = await this.personal([ROLES_BASE.AUXILIAR, ROLES_BASE.JEFE_PROD]);
    const permitidos = await this.permitidosPorParticipacion(filas.map((f) => f.participacionId));
    const [entregables, duenos, equipo] = await Promise.all([
      this.prisma.entregable.findMany({ where: { id: { in: bloques.map((b) => b.entregableId).filter((x): x is string => Boolean(x)) } }, select: { id: true, nombre: true, fechaLimite: true } }),
      this.prisma.usuario.findMany({ where: { id: { in: [...new Set(filas.map((f) => f.usuarioId))] } }, select: CAMPOS_USUARIO }),
      this.prisma.trabajoEquipo.findMany({ where: { trabajoId: s.trabajoId, hasta: null }, select: { usuarioId: true } }),
    ]);
    const trabajo = await this.prisma.trabajo.findUniqueOrThrow({ where: { id: s.trabajoId }, select: { fechaLimite: true } });
    return {
      bloques: bloques.map((b) => {
        const e = entregables.find((x) => x.id === b.entregableId);
        return {
          entregableId: b.entregableId,
          nombre: e?.nombre ?? 'Tareas del trabajo (sin entregable)',
          tareas: b.filas.length,
          minutos: b.minutos,
          fechaLimite: soloFecha(e?.fechaLimite ?? trabajo.fechaLimite),
          responsableActual: duenos.find((d) => d.id === b.filas[0].usuarioId) ?? null,
          elegibles: personal.filter((c) => this.puedeTomar(c, b, permitidos, jefeId)).map(({ id: uid, nombres, apellidos }) => ({ id: uid, nombres, apellidos })),
        };
      }),
      sugerencia: await this.sugerirReparto(filas, bloques, personal, permitidos, jefeId, new Set(equipo.map((e) => e.usuarioId))),
    };
  }

  /**
   * Reparto goloso: de los entregables más largos a los más cortos, cada uno va a quien lo termina antes
   * (contando lo que ya se le dio); a igual día, a quien menos tareas suyas deja en riesgo, luego a los auxiliares antes que a los jefes y a quien ya es del equipo.
   * Nunca más de MAX_PERSONAS_URGENTE personas distintas.
   */
  private async sugerirReparto(
    filas: FilaUrgente[],
    bloques: BloqueInterno[],
    personal: Candidato[],
    permitidos: Map<string, Set<string>>,
    jefeId: string | null,
    equipo: Set<string>,
  ): Promise<RepartoUrgente> {
    const idsUrgentes = new Set(filas.map((f) => f.tareaId));
    const candidatos = personal.filter((c) => bloques.some((b) => this.puedeTomar(c, b, permitidos, jefeId)));
    if (candidatos.length === 0) return [];
    const bases = await this.agenda.basesDeCola(candidatos.map((c) => c.id));
    const tareas = await this.prisma.tarea.findMany({ where: { id: { in: [...idsUrgentes] } }, include: INCLUIR_TAREA_PLAN });
    const porId = new Map(tareas.map((t) => [t.id, t]));
    const orden = new Map(filas.map((f, i) => [f.tareaId, i]));
    // Lo que ya tiene cada persona (sin las tareas urgentes, que se mueven) y qué de eso ya iba justo.
    const resto = new Map(candidatos.map((c) => [c.id, bases.get(c.id)!.items.map(({ tarea }) => tarea).filter((t) => !idsUrgentes.has(t.id))]));
    const yaEnRiesgo = new Map(
      candidatos.map((c) => {
        const b = bases.get(c.id)!;
        const plan = planificar(b.dias, b.items.map(({ tarea }) => aTareaEnCola(tarea)), b.ahora);
        return [c.id, new Set(b.items.filter(({ tarea }) => enRiesgo(resultado(plan.get(tarea.id), limiteDe(tarea)))).map(({ tarea }) => tarea.id))] as const;
      }),
    );

    const asignado = new Map<string, BloqueInterno[]>();
    const reparto: RepartoUrgente = [];
    for (const b of [...bloques].sort((x, y) => y.minutos - x.minutos)) {
      let mejor: { c: Candidato; clave: string[] } | null = null;
      for (const c of candidatos) {
        if (!this.puedeTomar(c, b, permitidos, jefeId)) continue;
        if (!asignado.has(c.id) && asignado.size >= MAX_PERSONAS_URGENTE) continue;
        const base = bases.get(c.id)!;
        const mias = [...(asignado.get(c.id) ?? []), b]
          .flatMap((x) => x.filas)
          .sort((p, q) => orden.get(p.tareaId)! - orden.get(q.tareaId)!)
          .map((f) => porId.get(f.tareaId)!);
        const plan = planificar(base.dias, [...mias.map(aTareaEnCola), ...resto.get(c.id)!.map(aTareaEnCola)], base.ahora);
        const fines = b.filas.map((f) => plan.get(f.tareaId)?.fin).filter((x): x is NonNullable<typeof x> => Boolean(x));
        // Si no alcanza el horizonte, es la peor opción.
        const fin = fines.length === b.filas.length ? fines.map((x) => `${x.fecha}${String(x.fin).padStart(4, '0')}`).sort().at(-1)! : '9999-99-990000';
        const nuevos = resto.get(c.id)!.filter((t) => enRiesgo(resultado(plan.get(t.id), limiteDe(t))) && !yaEnRiesgo.get(c.id)!.has(t.id)).length;
        const esAuxiliar = c.roles.some((r) => r.rol.codigo === ROLES_BASE.AUXILIAR);
        const clave = [fin.slice(0, 10), String(nuevos).padStart(3, '0'), esAuxiliar ? '0' : '1', equipo.has(c.id) ? '0' : '1', fin];
        if (!mejor || clave.join('|') < mejor.clave.join('|')) mejor = { c, clave };
      }
      if (!mejor) continue;
      asignado.set(mejor.c.id, [...(asignado.get(mejor.c.id) ?? []), b]);
      reparto.push({ entregableId: b.entregableId, usuarioId: mejor.c.id });
    }
    // En el orden natural de los entregables.
    return bloques.flatMap((b) => reparto.filter((r) => r.entregableId === b.entregableId));
  }

  /**
   * Comprueba que el reparto cubre todo, que cada persona puede con lo que se le da y que nadie elabora lo que luego revisa.
   * Devuelve lo que recibe cada persona, con sus tareas en el orden natural.
   */
  private async resolverReparto(trabajoId: string, reparto: RepartoUrgente) {
    const error = (mensaje: string) => new BadRequestException({ message: mensaje, errores: [{ campo: 'reparto', mensaje }] });
    const filas = await this.tareasUrgentes(trabajoId);
    const bloques = this.agrupar(filas);
    const claveDe = (id: string | null) => id ?? 'sin-entregable';
    for (const r of reparto) if (!bloques.some((b) => claveDe(b.entregableId) === claveDe(r.entregableId))) throw error('El reparto incluye un entregable que no tiene tareas pendientes');
    const faltan = bloques.filter((b) => !reparto.some((r) => claveDe(r.entregableId) === claveDe(b.entregableId)));
    if (faltan.length > 0) throw error('Falta asignar a quién va cada entregable');

    const jefeId = await this.jefeResponsableDe(trabajoId);
    const permitidos = await this.permitidosPorParticipacion(filas.map((f) => f.participacionId));
    const personal = await this.personal([ROLES_BASE.AUXILIAR, ROLES_BASE.JEFE_PROD]);
    const entregables = await this.prisma.entregable.findMany({ where: { id: { in: bloques.map((b) => b.entregableId).filter((x): x is string => Boolean(x)) } }, select: { id: true, nombre: true } });
    const nombreBloque = (b: BloqueInterno) => entregables.find((e) => e.id === b.entregableId)?.nombre ?? 'las tareas sin entregable';

    const porUsuario = new Map<string, GrupoReparto>();
    for (const r of reparto) {
      const b = bloques.find((x) => claveDe(x.entregableId) === claveDe(r.entregableId))!;
      const usuario = await this.validarAuxiliar(r.usuarioId);
      const c = personal.find((p) => p.id === r.usuarioId);
      if (b.elabora && r.usuarioId === jefeId) throw error(`${nombreDe(usuario)} es el jefe responsable del trabajo: no puede elaborar «${nombreBloque(b)}» y luego revisarlo`);
      if (!c || !this.puedeTomar(c, b, permitidos, jefeId)) throw error(`${nombreDe(usuario)} no tiene un rol permitido para las tareas de «${nombreBloque(b)}»`);
      const actual = porUsuario.get(r.usuarioId) ?? { usuario, bloques: [], filas: [] };
      actual.bloques.push(b);
      actual.filas.push(...b.filas);
      porUsuario.set(r.usuarioId, actual);
    }
    const orden = new Map(filas.map((f, i) => [f.tareaId, i]));
    for (const g of porUsuario.values()) g.filas.sort((a, b) => orden.get(a.tareaId)! - orden.get(b.tareaId)!);
    return { filas, porUsuario, nombreBloque };
  }

  /** Cómo queda la cola de cada persona si recibe lo que se le asigna (primero lo urgente, luego lo suyo). */
  private async impactoPorPersona(filas: FilaUrgente[], porUsuario: Map<string, GrupoReparto>, nombreBloque: (b: BloqueInterno) => string) {
    const idsUrgentes = new Set(filas.map((f) => f.tareaId));
    const duenos = [...new Set([...porUsuario.keys(), ...filas.map((f) => f.usuarioId)])];
    const bases = await this.agenda.basesDeCola(duenos);

    // Antes: el plan actual de cada tarea en la cola de su responsable.
    const antes = new Map<string, PlanCola>();
    for (const b of bases.values()) for (const [k, v] of planificar(b.dias, b.items.map(({ tarea }) => aTareaEnCola(tarea)), b.ahora)) antes.set(k, v);

    const tareasUrgentes = await this.prisma.tarea.findMany({ where: { id: { in: [...idsUrgentes] } }, include: INCLUIR_TAREA_PLAN });
    const limite = (t: { entregable: { fechaLimite: Date } | null; trabajo: { fechaLimite: Date } | null }) =>
      t.entregable ? soloFecha(t.entregable.fechaLimite) : t.trabajo ? soloFecha(t.trabajo.fechaLimite) : null;

    return [...porUsuario.entries()].map(([usuarioId, g]) => {
      const base = bases.get(usuarioId)!;
      const mias = g.filas.map((f) => tareasUrgentes.find((t) => t.id === f.tareaId)!);
      // De su cola se quita todo lo urgente: lo suyo vuelve a entrar delante y lo de otros se va con quien lo reciba.
      const resto = base.items.filter(({ tarea }) => !idsUrgentes.has(tarea.id)).map(({ tarea }) => tarea);
      const despues = planificar(base.dias, [...mias.map(aTareaEnCola), ...resto.map(aTareaEnCola)], base.ahora);
      const items = [
        ...mias.map((t) => ({
          tareaId: t.id,
          titulo: t.titulo ?? t.actividad.nombre,
          trabajo: { id: t.trabajo!.id, codigo: t.trabajo!.codigo },
          esUrgente: true,
          antes: antes.has(t.id) ? resultado(antes.get(t.id), limite(t)) : null,
          despues: resultado(despues.get(t.id), limite(t)),
        })),
        ...resto.map((t) => ({
          tareaId: t.id,
          titulo: t.titulo ?? t.actividad.nombre,
          trabajo: { id: t.trabajo!.id, codigo: t.trabajo!.codigo },
          esUrgente: false,
          antes: resultado(antes.get(t.id), limiteDe(t)),
          despues: resultado(despues.get(t.id), limiteDe(t)),
        })),
      ];
      const enProceso = resto.find((t) => t.estado === 'en_proceso');
      return {
        usuario: g.usuario,
        items,
        pasanARojo: items.filter((i) => !i.esUrgente && !enRiesgo(i.antes) && enRiesgo(i.despues)).length,
        pausada: enProceso ? { tareaId: enProceso.id, titulo: enProceso.titulo ?? enProceso.actividad.nombre } : null,
        entregables: g.bloques.map(nombreBloque),
        minutos: g.bloques.reduce((s, b) => s + b.minutos, 0),
      };
    });
  }

  /** Simulación en cascada del reparto: lo urgente pasa primero en la cola de cada persona. */
  async simularReparto(id: string, reparto: RepartoUrgente): Promise<ImpactoReparto> {
    const s = await this.pendiente(id);
    const { filas, porUsuario, nombreBloque } = await this.resolverReparto(s.trabajoId, reparto);
    const personas = await this.impactoPorPersona(filas, porUsuario, nombreBloque);
    const fines = personas.flatMap((p) => p.items.filter((i) => i.esUrgente).map((i) => i.despues.fin));
    return {
      personas,
      terminaEl: fines.some((f) => f === null) ? null : (fines as string[]).sort().at(-1) ?? null,
      pasanARojo: personas.reduce((n, p) => n + p.pasanARojo, 0),
    };
  }

  /** Simulación con un solo auxiliar para todo (la urgencia de siempre). */
  async simularUrgente(id: string, usuarioId: string): Promise<ImpactoUrgente> {
    const s = await this.pendiente(id);
    const r = await this.simularReparto(id, await this.repartoUnico(s.trabajoId, usuarioId));
    const { entregables: _e, minutos: _m, ...impacto } = r.personas[0];
    return impacto;
  }

  async ejecutarUrgente(id: string, datos: EjecutarUrgenteDatos, actor: ActorProduccion): Promise<SolicitudUrgenteItem> {
    const s = await this.pendiente(id);
    const reparto = datos.reparto ?? (await this.repartoUnico(s.trabajoId, datos.usuarioId!));
    const { porUsuario } = await this.resolverReparto(s.trabajoId, reparto);
    await this.prisma.$transaction(async (tx) => {
      // 1) Las tareas urgentes pasan a quien se asignó.
      for (const [usuarioId, g] of porUsuario) {
        for (const f of g.filas) {
          if (f.usuarioId === usuarioId) continue;
          if (await tx.tareaResponsable.count({ where: { tareaId: f.tareaId, usuarioId } })) continue;
          const rol = await this.rolPara(tx, f.participacionId, usuarioId);
          await tx.tareaResponsable.update({ where: { id: f.id }, data: { usuarioId, ...rol, asignadoPorId: actor.usuarioId, asignadoEn: new Date() } });
          await tx.tarea.updateMany({ where: { id: f.tareaId, estado: 'en_proceso' }, data: { estado: 'pendiente' } });
        }
      }
      // 2) Nueva cola de cada persona: primero sus tareas urgentes, luego el resto en su orden; lo que estaba en proceso se pausa.
      for (const [usuarioId, g] of porUsuario) {
        const idsUrgentes = new Set(g.filas.map((f) => f.tareaId));
        const cola = await tx.tareaResponsable.findMany({
          where: { usuarioId, ordenCola: { not: null }, tarea: { estado: { in: [...ACTIVAS] }, inicio: null } },
          orderBy: [{ ordenCola: 'asc' }, { asignadoEn: 'asc' }],
          include: { tarea: true },
        });
        const ordenUrgentes = g.filas.map((f) => f.tareaId);
        const nuevaCola = [...cola.filter((c) => idsUrgentes.has(c.tareaId)).sort((a, b) => ordenUrgentes.indexOf(a.tareaId) - ordenUrgentes.indexOf(b.tareaId)), ...cola.filter((c) => !idsUrgentes.has(c.tareaId))];
        for (const [i, c] of nuevaCola.entries()) await tx.tareaResponsable.update({ where: { id: c.id }, data: { ordenCola: i + 1 } });
        await tx.tarea.updateMany({ where: { id: { in: cola.filter((c) => !idsUrgentes.has(c.tareaId)).map((c) => c.tareaId) }, estado: 'en_proceso' }, data: { estado: 'pendiente' } });
        await this.sumarAlEquipo(tx, s.trabajoId, usuarioId, actor, 'Inserción urgente');
      }

      const resumen = [...porUsuario.values()].map((g) => ({ usuarioId: g.usuario.id, tareas: g.filas.length, minutos: g.bloques.reduce((n, b) => n + b.minutos, 0) }));
      const principal = [...resumen].sort((a, b) => b.minutos - a.minutos)[0];
      await tx.solicitudUrgenteAsignacion.createMany({
        data: [...porUsuario.values()].flatMap((g) => g.bloques.map((b) => ({ solicitudId: id, usuarioId: g.usuario.id, entregableId: b.entregableId, tareas: b.filas.length, minutos: b.minutos }))),
      });
      await tx.solicitudUrgente.update({
        where: { id },
        data: { estado: 'ejecutada', resueltaPorId: actor.usuarioId, resueltaEn: new Date(), usuarioAsignadoId: principal.usuarioId, observacion: datos.observacion ?? null },
      });
      const donde = [...porUsuario.values()].map((g) => nombreDe(g.usuario)).join(', ').replace(/, ([^,]*)$/, ' y $1');
      await tx.trabajoEvento.create({
        data: { trabajoId: s.trabajoId, tipo: 'estado', detalle: `Inserción urgente en ${porUsuario.size > 1 ? 'las colas de' : 'la cola de'} ${donde}${datos.observacion ? ` — ${datos.observacion}` : ''}`, usuarioId: actor.usuarioId },
      });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'ejecutar_urgente', entidad: 'solicitud_urgente', entidadId: id, despues: { reparto, observacion: datos.observacion }, ip: actor.ip }, tx);
    });
    const trabajo = await this.prisma.trabajo.findUniqueOrThrow({
      where: { id: s.trabajoId },
      select: { codigo: true, equipo: { where: { hasta: null, funcion: 'jefe_responsable' }, select: { usuarioId: true } } },
    });
    const asignados = [...porUsuario.keys()];
    await this.notificaciones.notificar(
      asignados,
      { tipo: 'urgente.en_tu_cola', titulo: `Trabajo urgente primero en tu cola: ${trabajo.codigo}`, mensaje: s.motivo, enlace: '/tareas?vista=cola' },
      actor.usuarioId,
    );
    await this.notificaciones.notificar(
      [s.solicitadaPorId, ...trabajo.equipo.map((e) => e.usuarioId)].filter((x) => !asignados.includes(x)),
      {
        tipo: 'urgente.ejecutada',
        titulo: `${trabajo.codigo} se insertó como urgente`,
        mensaje: `En ${asignados.length > 1 ? 'las colas de' : 'la cola de'} ${[...porUsuario.values()].map((g) => nombreDe(g.usuario)).join(', ')}`,
        enlace: `/trabajos/${s.trabajoId}`,
      },
      actor.usuarioId,
    );
    return this.aItem(await this.prisma.solicitudUrgente.findUniqueOrThrow({ where: { id }, include: INCLUIR_URGENTE }));
  }

  async rechazarUrgente(id: string, observacion: string, actor: ActorProduccion): Promise<SolicitudUrgenteItem> {
    const s = await this.pendiente(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.solicitudUrgente.update({ where: { id }, data: { estado: 'rechazada', resueltaPorId: actor.usuarioId, resueltaEn: new Date(), observacion } });
      await tx.trabajoEvento.create({ data: { trabajoId: s.trabajoId, tipo: 'estado', detalle: `Urgencia no ejecutada — ${observacion}`, usuarioId: actor.usuarioId } });
    });
    await this.notificaciones.notificar(
      [s.solicitadaPorId],
      { tipo: 'urgente.rechazada', titulo: 'Producción no ejecutó la urgencia', mensaje: observacion, enlace: `/trabajos/${s.trabajoId}` },
      actor.usuarioId,
    );
    return this.aItem(await this.prisma.solicitudUrgente.findUniqueOrThrow({ where: { id }, include: INCLUIR_URGENTE }));
  }

  /** Para comprobar que quien solicita puede ver el trabajo (lo hace el controlador). */
  async trabajoDeUrgente(id: string): Promise<string> {
    const s = await this.prisma.solicitudUrgente.findUnique({ where: { id }, select: { trabajoId: true } });
    if (!s) throw new NotFoundException('Solicitud no encontrada');
    return s.trabajoId;
  }
}
