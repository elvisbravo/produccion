import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  horaEnLima,
  ROLES_BASE,
  type AplicarReasignacionDatos,
  type CandidatoReasignacion,
  type EjecutarUrgenteDatos,
  type ImpactoUrgente,
  type MotivoCandidato,
  type PlanReasignacion,
  type PropuestaReasignacion,
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

const INCLUIR_URGENTE = {
  trabajo: { select: { id: true, codigo: true, titulo: true, fechaLimite: true, prioridad: { select: { nombre: true, color: true } } } },
  solicitadaPor: { select: CAMPOS_USUARIO },
  resueltaPor: { select: CAMPOS_USUARIO },
  usuarioAsignado: { select: CAMPOS_USUARIO },
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
      select: { ...CAMPOS_USUARIO, roles: { select: { rol: { select: { codigo: true } } } } },
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
        select: { trabajoId: true, usuarioId: true },
      });
      for (const { tarea } of afectadas) {
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
            return { usuario: { id: c.id, nombres: c.nombres, apellidos: c.apellidos }, motivo, resultado: r, disponible: r.semaforo !== 'rojo' && r.semaforo !== 'sin_plan', aviso: null };
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
  private async tareasUrgentes(trabajoId: string) {
    const filas = await this.prisma.tareaResponsable.findMany({
      where: { ordenCola: { not: null }, tarea: { trabajoId, estado: { in: [...ACTIVAS] }, inicio: null } },
      include: { tarea: { include: { entregable: { select: { orden: true } } } } },
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

  /** Simulación en cascada: el trabajo urgente pasa primero en la cola del auxiliar. */
  async simularUrgente(id: string, usuarioId: string): Promise<ImpactoUrgente> {
    const s = await this.pendiente(id);
    const usuario = await this.validarAuxiliar(usuarioId);
    const urgentes = await this.tareasUrgentes(s.trabajoId);
    const idsUrgentes = new Set(urgentes.map((f) => f.tareaId));
    const duenos = [...new Set([usuarioId, ...urgentes.map((f) => f.usuarioId)])];
    const bases = await this.agenda.basesDeCola(duenos);
    const base = bases.get(usuarioId)!;

    // Antes: el plan actual de cada tarea en la cola de su responsable.
    const antes = new Map<string, PlanCola>();
    for (const b of bases.values()) for (const [k, v] of planificar(b.dias, b.items.map(({ tarea }) => aTareaEnCola(tarea)), b.ahora)) antes.set(k, v);

    const tareasUrgentes = await this.prisma.tarea.findMany({
      where: { id: { in: [...idsUrgentes] } },
      include: { actividad: { include: { tipo: true } }, trabajo: { select: { id: true, codigo: true, fechaLimite: true } }, entregable: { select: { fechaLimite: true } } },
    });
    const ordenUrgentes = urgentes.map((f) => tareasUrgentes.find((t) => t.id === f.tareaId)!);
    const resto = base.items.filter(({ tarea }) => !idsUrgentes.has(tarea.id)).map(({ tarea }) => tarea);
    const despues = planificar(base.dias, [...ordenUrgentes.map(aTareaEnCola), ...resto.map(aTareaEnCola)], base.ahora);

    const limite = (t: { entregable: { fechaLimite: Date } | null; trabajo: { fechaLimite: Date } | null }) =>
      t.entregable ? soloFecha(t.entregable.fechaLimite) : t.trabajo ? soloFecha(t.trabajo.fechaLimite) : null;
    const items = [
      ...ordenUrgentes.map((t) => ({
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
    const enRiesgo = (r: ResultadoPlan | null) => r?.semaforo === 'rojo' || r?.semaforo === 'sin_plan';
    const enProceso = resto.find((t) => t.estado === 'en_proceso');
    return {
      usuario,
      items,
      pasanARojo: items.filter((i) => !i.esUrgente && !enRiesgo(i.antes) && enRiesgo(i.despues)).length,
      pausada: enProceso ? { tareaId: enProceso.id, titulo: enProceso.titulo ?? enProceso.actividad.nombre } : null,
    };
  }

  async ejecutarUrgente(id: string, datos: EjecutarUrgenteDatos, actor: ActorProduccion): Promise<SolicitudUrgenteItem> {
    const s = await this.pendiente(id);
    const usuario = await this.validarAuxiliar(datos.usuarioId);
    const urgentes = await this.tareasUrgentes(s.trabajoId);
    await this.prisma.$transaction(async (tx) => {
      // Las tareas urgentes pasan al auxiliar elegido.
      for (const f of urgentes) {
        if (f.usuarioId === datos.usuarioId) continue;
        if (await tx.tareaResponsable.count({ where: { tareaId: f.tareaId, usuarioId: datos.usuarioId } })) continue;
        const rol = await this.rolPara(tx, f.participacionId, datos.usuarioId);
        await tx.tareaResponsable.update({ where: { id: f.id }, data: { usuarioId: datos.usuarioId, ...rol, asignadoPorId: actor.usuarioId, asignadoEn: new Date() } });
        await tx.tarea.updateMany({ where: { id: f.tareaId, estado: 'en_proceso' }, data: { estado: 'pendiente' } });
      }
      // Nueva cola: primero las urgentes, luego el resto en su orden; lo que estaba en proceso se pausa.
      const idsUrgentes = new Set(urgentes.map((f) => f.tareaId));
      const cola = await tx.tareaResponsable.findMany({
        where: { usuarioId: datos.usuarioId, ordenCola: { not: null }, tarea: { estado: { in: [...ACTIVAS] }, inicio: null } },
        orderBy: [{ ordenCola: 'asc' }, { asignadoEn: 'asc' }],
        include: { tarea: true },
      });
      const ordenUrgentes = urgentes.map((f) => f.tareaId);
      const nuevaCola = [...cola.filter((c) => idsUrgentes.has(c.tareaId)).sort((a, b) => ordenUrgentes.indexOf(a.tareaId) - ordenUrgentes.indexOf(b.tareaId)), ...cola.filter((c) => !idsUrgentes.has(c.tareaId))];
      for (const [i, c] of nuevaCola.entries()) await tx.tareaResponsable.update({ where: { id: c.id }, data: { ordenCola: i + 1 } });
      await tx.tarea.updateMany({ where: { id: { in: cola.filter((c) => !idsUrgentes.has(c.tareaId)).map((c) => c.tareaId) }, estado: 'en_proceso' }, data: { estado: 'pendiente' } });

      await this.sumarAlEquipo(tx, s.trabajoId, datos.usuarioId, actor, 'Inserción urgente');
      await tx.solicitudUrgente.update({
        where: { id },
        data: { estado: 'ejecutada', resueltaPorId: actor.usuarioId, resueltaEn: new Date(), usuarioAsignadoId: datos.usuarioId, observacion: datos.observacion ?? null },
      });
      await tx.trabajoEvento.create({
        data: { trabajoId: s.trabajoId, tipo: 'estado', detalle: `Inserción urgente en la cola de ${nombreDe(usuario)}${datos.observacion ? ` — ${datos.observacion}` : ''}`, usuarioId: actor.usuarioId },
      });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'ejecutar_urgente', entidad: 'solicitud_urgente', entidadId: id, despues: datos, ip: actor.ip }, tx);
    });
    const trabajo = await this.prisma.trabajo.findUniqueOrThrow({
      where: { id: s.trabajoId },
      select: { codigo: true, equipo: { where: { hasta: null, funcion: 'jefe_responsable' }, select: { usuarioId: true } } },
    });
    await this.notificaciones.notificar(
      [datos.usuarioId],
      { tipo: 'urgente.en_tu_cola', titulo: `Trabajo urgente primero en tu cola: ${trabajo.codigo}`, mensaje: s.motivo, enlace: '/tareas?vista=cola' },
      actor.usuarioId,
    );
    await this.notificaciones.notificar(
      [s.solicitadaPorId, ...trabajo.equipo.map((e) => e.usuarioId)].filter((x) => x !== datos.usuarioId),
      { tipo: 'urgente.ejecutada', titulo: `${trabajo.codigo} se insertó como urgente`, mensaje: `En la cola de ${nombreDe(usuario)}`, enlace: `/trabajos/${s.trabajoId}` },
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
