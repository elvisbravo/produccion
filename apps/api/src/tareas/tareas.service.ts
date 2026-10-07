import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  diaEnLima,
  horaAMinutos,
  horaEnLima,
  instanteDesdeLima,
  ROLES_BASE,
  type ActividadCatalogo,
  type AsignarTareaDatos,
  type CandidatosTarea,
  type CompletarTareaDatos,
  type ConflictoAgenda,
  type EnlaceReunionDatos,
  type EquipoReunionDatos,
  type ImpactoReunion,
  type EstadoDisponibilidad,
  type ListarReunionesConsulta,
  type PermisoCodigo,
  type ProgramarTareaDatos,
  type ReprogramarTareaDatos,
  type ResultadoCompletar,
  type ReunionFila,
  type TareaItem,
} from '@grupoes/shared';
import { AgendaService } from '../agenda/agenda.service.js';
import { errorFechasFijas } from '../trabajos/fechas-fijas.error.js';
import { AuditoriaService } from '../common/auditoria.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ParametrosService } from '../parametros/parametros.service.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { ContingenciasService } from '../produccion/contingencias.service.js';
import { ProduccionService } from '../produccion/produccion.service.js';
import { EmbudoService } from './embudo.service.js';
import { cerrarTramos } from './tramos.js';
import { CAMPOS_PERSONA } from '../personas/personas.service.js';
import { aTareaItem, esActiva, finDe, INCLUIR_TAREA, ORDEN_TAREAS, type TareaCompleta } from './mapeo.js';

export interface ActorTarea {
  usuarioId: string;
  ip: string | null;
}

const INCLUIR_ACTIVIDAD = {
  tipo: true,
  participaciones: {
    orderBy: { orden: 'asc' },
    include: { roles: { include: { rol: true, prioridad: true }, orderBy: { prioridad: { nivel: 'asc' } } } },
  },
} as const satisfies Prisma.ActividadInclude;
type ActividadCompleta = Prisma.ActividadGetPayload<{ include: typeof INCLUIR_ACTIVIDAD }>;

const errorCampo = (campo: string, mensaje: string) => new BadRequestException({ message: 'Datos inválidos', errores: [{ campo, mensaje }] });

const fechaLegible = (dia: string, hora?: string | null) => {
  const texto = new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${dia}T12:00:00Z`),
  );
  return hora ? `${texto}, ${hora}` : texto;
};

const nombreDe = (u: { nombres: string; apellidos: string }) => `${u.nombres} ${u.apellidos}`;

/** Orden de los candidatos dentro de la misma prioridad: primero los libres. */
const RANGO_DISPONIBILIDAD: Record<EstadoDisponibilidad, number> = { libre: 0, sobrecargado: 1, fuera_horario: 2, ocupado: 3, no_laborable: 4 };

@Injectable()
export class TareasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
    private readonly parametros: ParametrosService,
    private readonly auditoria: AuditoriaService,
    private readonly embudo: EmbudoService,
    private readonly agenda: AgendaService,
    private readonly produccion: ProduccionService,
    private readonly notificaciones: NotificacionesService,
    private readonly contingencias: ContingenciasService,
  ) {}

  // ─── Catálogo ─────────────────────────────────────────────

  async actividades(aplicaA?: 'prospecto' | 'cliente'): Promise<ActividadCatalogo[]> {
    const filas = await this.prisma.actividad.findMany({
      where: { activa: true, ...(aplicaA && { aplicaA: { in: [aplicaA, 'ambos'] } }) },
      orderBy: { orden: 'asc' },
      include: INCLUIR_ACTIVIDAD,
    });
    return filas.map((a) => ({
      id: a.id,
      nombre: a.nombre,
      tipo: { nombre: a.tipo.nombre, comportamiento: a.tipo.comportamiento, color: a.tipo.color },
      minutosEstimados: a.minutosEstimados,
      aplicaA: a.aplicaA,
      requiereHoraFija: a.requiereHoraFija,
      modoAsignacion: a.modoAsignacion,
      esSeguimiento: a.esSeguimiento,
      participaciones: a.participaciones.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        obligatoria: p.obligatoria,
        cantidad: p.cantidad,
        roles: p.roles.map((r) => ({ codigo: r.rol.codigo, nombre: r.rol.nombre, prioridad: { nombre: r.prioridad.nombre, nivel: r.prioridad.nivel } })),
      })),
    }));
  }

  // ─── Acceso ──────────────────────────────────────────────

  private async alcance(usuarioId: string, permiso: PermisoCodigo) {
    return (await this.permisos.efectivos(usuarioId))[permiso];
  }

  /**
   * Con alcance "propios" se ven las tareas donde es responsable o creador, o las de sus prospectos.
   * Un permiso sin alcance (p. ej. tareas.asignar) aplica a todas.
   */
  async filtroVisibles(usuarioId: string, permiso: PermisoCodigo = 'tareas.ver'): Promise<Prisma.TareaWhereInput> {
    const alcance = await this.alcance(usuarioId, permiso);
    if (alcance === 'todos' || alcance === null) return {};
    return {
      OR: [{ responsables: { some: { usuarioId } } }, { creadaPorId: usuarioId }, { prospecto: { responsableId: usuarioId } }],
    };
  }

  private async obtenerVisible(id: string, usuarioId: string, permiso: PermisoCodigo = 'tareas.ver') {
    const tarea = await this.prisma.tarea.findFirst({
      where: { id, ...(await this.filtroVisibles(usuarioId, permiso)) },
      include: { ...INCLUIR_TAREA, actividad: { include: INCLUIR_ACTIVIDAD } },
    });
    if (!tarea) throw new NotFoundException('Tarea no encontrada');
    return tarea;
  }

  /** El prospecto debe estar dentro del alcance de "prospectos.ver" del usuario. */
  async verificarProspecto(prospectoId: string, usuarioId: string) {
    const alcance = await this.alcance(usuarioId, 'prospectos.ver');
    const prospecto = await this.prisma.prospecto.findFirst({
      where: { id: prospectoId, eliminadoEn: null, ...(alcance !== 'todos' && { responsableId: usuarioId }) },
      select: { id: true },
    });
    if (!alcance || !prospecto) throw new NotFoundException('Prospecto no encontrado');
  }

  async detalle(id: string, usuarioId: string): Promise<TareaItem> {
    return aTareaItem(await this.obtenerVisible(id, usuarioId));
  }

  // ─── Programar ───────────────────────────────────────────

  /** Programa una actividad para un prospecto. Acepta una transacción para usarse dentro del alta del prospecto. */
  async programarParaProspecto(
    prospectoId: string,
    datos: ProgramarTareaDatos,
    actor: ActorTarea,
    tx?: Prisma.TransactionClient,
    /** Prefijo de los campos en los errores (p. ej. "primeraActividad.") para que el formulario los ubique. */
    prefijo = '',
  ): Promise<string> {
    if (!tx) {
      const id = await this.prisma.$transaction((t) => this.programarParaProspecto(prospectoId, datos, actor, t, prefijo));
      await this.avisarPorAsignar(id, actor.usuarioId);
      return id;
    }

    const actividad = await tx.actividad.findFirst({ where: { id: datos.actividadId, activa: true }, include: INCLUIR_ACTIVIDAD });
    if (!actividad || actividad.aplicaA === 'cliente') throw errorCampo(`${prefijo}actividadId`, 'Esta actividad no aplica a prospectos');

    const { fecha, inicio } = this.validarProgramacion(actividad, datos, prefijo);

    const prospecto = await tx.prospecto.findUniqueOrThrow({
      where: { id: prospectoId },
      include: { etapa: true, contactos: { select: { personaId: true } } },
    });
    if (prospecto.etapa.clase !== 'abierta') throw new BadRequestException('El prospecto está cerrado: reactívalo para programar actividades');

    const contactos = prospecto.contactos.map((c) => c.personaId);
    const personaIds = datos.personaIds ?? contactos;
    if (personaIds.some((id) => !contactos.includes(id))) throw errorCampo(`${prefijo}personaIds`, 'Solo pueden participar contactos del prospecto');

    let estado: 'por_asignar' | 'pendiente' = 'pendiente';
    let responsables: Prisma.TareaResponsableCreateManyTareaInput[] = [];
    if (actividad.modoAsignacion === 'coordinada') {
      estado = 'por_asignar';
    } else if (actividad.modoAsignacion === 'creador') {
      responsables = [await this.responsableCreador(tx, actividad, actor.usuarioId)];
    } else if (actividad.modoAsignacion === 'directa') {
      if (!datos.responsables?.length) throw errorCampo(`${prefijo}responsables`, 'Elige al responsable');
      responsables = await this.resolverResponsables(tx, actividad, datos.responsables, actor.usuarioId);
    } else {
      throw errorCampo(`${prefijo}actividadId`, 'Esta actividad se asigna al responsable de un trabajo (clientes)');
    }

    await this.verificarLaborable(tx, responsables.map((r) => r.usuarioId), { fecha: datos.fecha, inicio, minutos: actividad.minutosEstimados }, actor.usuarioId, `${prefijo}fecha`);

    const tarea = await tx.tarea.create({
      data: {
        actividadId: actividad.id,
        prospectoId,
        fecha,
        inicio,
        minutosEstimados: actividad.minutosEstimados,
        modalidad: datos.modalidad ?? null,
        estado,
        notas: datos.notas ?? null,
        creadaPorId: actor.usuarioId,
        responsables: { createMany: { data: responsables } },
        personas: { createMany: { data: personaIds.map((personaId) => ({ personaId })) } },
      },
      select: { id: true },
    });

    await tx.prospectoEvento.create({
      data: {
        prospectoId,
        tipo: 'tarea',
        detalle: `Se programó "${actividad.nombre}" para el ${fechaLegible(datos.fecha, datos.hora)}${estado === 'por_asignar' ? ' (por asignar)' : ''}`,
        datos: { tareaId: tarea.id },
        usuarioId: actor.usuarioId,
      },
    });
    await this.embudo.alOcurrir(tx, prospectoId, actividad.id, 'al_programar', actor.usuarioId);
    await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'crear', entidad: 'tarea', entidadId: tarea.id, despues: datos, ip: actor.ip }, tx);
    return tarea.id;
  }

  /** El trabajo debe estar dentro del alcance de "trabajos.ver" del usuario (todos, su equipo o los de sus prospectos). */
  async verificarTrabajo(trabajoId: string, usuarioId: string) {
    const alcance = await this.alcance(usuarioId, 'trabajos.ver');
    const enEquipo: Prisma.TrabajoWhereInput = { equipo: { some: { usuarioId, hasta: null } } };
    const visible: Prisma.TrabajoWhereInput =
      alcance === 'todos' ? {} : alcance === 'propios' ? { OR: [enEquipo, { prospecto: { responsableId: usuarioId } }, { creadoPor: usuarioId, proveedorId: { not: null } }] } : enEquipo;
    const trabajo = alcance ? await this.prisma.trabajo.findFirst({ where: { id: trabajoId, eliminadoEn: null, ...visible }, select: { id: true } }) : null;
    if (!trabajo) throw new NotFoundException('Trabajo no encontrado');
  }

  /**
   * Programa una reunión a un cliente (un trabajo): la misma validación y asignación que a un prospecto, según cómo esté configurada la actividad.
   * La reunión queda ligada al trabajo (una tarea es de un prospecto o de un trabajo, no de ambos); su prospecto se alcanza a través del trabajo.
   */
  async programarReunionDeTrabajo(trabajoId: string, datos: ProgramarTareaDatos, actor: ActorTarea): Promise<string> {
    const id = await this.prisma.$transaction(async (tx) => {
      const actividad = await tx.actividad.findFirst({ where: { id: datos.actividadId, activa: true }, include: INCLUIR_ACTIVIDAD });
      if (!actividad || actividad.aplicaA === 'prospecto' || actividad.tipo.comportamiento !== 'reunion') throw errorCampo('actividadId', 'Elige una reunión que aplique a clientes');
      const { fecha, inicio } = this.validarProgramacion(actividad, datos);

      const trabajo = await tx.trabajo.findUniqueOrThrow({ where: { id: trabajoId }, select: { codigo: true, estado: true, integrantes: { select: { personaId: true } } } });
      if (['finalizado', 'cancelado'].includes(trabajo.estado)) throw new BadRequestException('El trabajo ya está cerrado: no se le programan reuniones');
      const integrantes = trabajo.integrantes.map((i) => i.personaId);
      const personaIds = datos.personaIds ?? integrantes;
      if (personaIds.some((p) => !integrantes.includes(p))) throw errorCampo('personaIds', 'Solo pueden participar integrantes del trabajo');

      let estado: 'por_asignar' | 'pendiente' = 'pendiente';
      let responsables: Prisma.TareaResponsableCreateManyTareaInput[] = [];
      if (actividad.modoAsignacion === 'coordinada') estado = 'por_asignar';
      else if (actividad.modoAsignacion === 'creador') responsables = [await this.responsableCreador(tx, actividad, actor.usuarioId)];
      else if (actividad.modoAsignacion === 'directa') {
        if (!datos.responsables?.length) throw errorCampo('responsables', 'Elige al responsable');
        responsables = await this.resolverResponsables(tx, actividad, datos.responsables, actor.usuarioId);
      } else throw errorCampo('actividadId', 'Esta actividad se asigna al responsable de un trabajo: elige otra reunión');

      await this.verificarLaborable(tx, responsables.map((r) => r.usuarioId), { fecha: datos.fecha, inicio, minutos: actividad.minutosEstimados }, actor.usuarioId, 'fecha');

      const tarea = await tx.tarea.create({
        data: {
          actividadId: actividad.id,
          trabajoId,
          fecha,
          inicio,
          minutosEstimados: actividad.minutosEstimados,
          modalidad: datos.modalidad ?? null,
          estado,
          notas: datos.notas ?? null,
          creadaPorId: actor.usuarioId,
          responsables: { createMany: { data: responsables } },
          personas: { createMany: { data: personaIds.map((personaId) => ({ personaId })) } },
        },
        select: { id: true },
      });
      await tx.trabajoEvento.create({
        data: {
          trabajoId,
          tipo: 'reunion',
          detalle: `Se programó "${actividad.nombre}" para el ${fechaLegible(datos.fecha, datos.hora)}${estado === 'por_asignar' ? ' (por asignar)' : ''}`,
          datos: { tareaId: tarea.id },
          usuarioId: actor.usuarioId,
        },
      });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'crear', entidad: 'tarea', entidadId: tarea.id, despues: datos, ip: actor.ip }, tx);
      return tarea.id;
    });
    await this.avisarPorAsignar(id, actor.usuarioId);
    return id;
  }

  /** Valida día, hora y modalidad según la actividad; devuelve la fecha y el inicio a guardar. */
  private validarProgramacion(actividad: ActividadCompleta, d: { fecha: string; hora?: string; modalidad?: string }, prefijo = '') {
    if (actividad.requiereHoraFija && !d.hora) throw errorCampo(`${prefijo}hora`, `"${actividad.nombre}" necesita día y hora`);
    if (actividad.tipo.comportamiento === 'reunion' && !d.modalidad) throw errorCampo(`${prefijo}modalidad`, 'Elige si es presencial o virtual');
    if (d.fecha < diaEnLima()) throw errorCampo(`${prefijo}fecha`, 'No se puede programar en un día pasado');
    const inicio = d.hora ? instanteDesdeLima(d.fecha, d.hora) : null;
    if (inicio && inicio.getTime() < Date.now() - 5 * 60_000) throw errorCampo(`${prefijo}hora`, 'Esa hora ya pasó');
    return { fecha: new Date(`${d.fecha}T00:00:00Z`), inicio };
  }

  /** Modo "al creador": participa con su rol permitido de mayor prioridad (el administrador puede hacer cualquiera). */
  private async responsableCreador(tx: Prisma.TransactionClient, actividad: ActividadCompleta, usuarioId: string) {
    const participacion = actividad.participaciones.find((p) => p.obligatoria) ?? actividad.participaciones[0];
    const roles = await tx.usuarioRol.findMany({ where: { usuarioId, rol: { activo: true } }, include: { rol: true } });
    const permitido = participacion.roles.find((r) => roles.some((u) => u.rolId === r.rolId));
    const admin = roles.find((r) => r.rol.codigo === ROLES_BASE.ADMIN);
    if (!permitido && !admin) {
      throw new BadRequestException(`Tu rol no puede realizar "${actividad.nombre}". Pide a quien corresponda que la programe.`);
    }
    return {
      usuarioId,
      participacionId: participacion.id,
      rolId: permitido?.rolId ?? admin!.rolId,
      prioridadRolId: permitido?.prioridadRolId ?? null,
      asignadoPorId: usuarioId,
    };
  }

  /** Valida que cada persona tenga un rol permitido para su participación y que se cubran las obligatorias. */
  private async resolverResponsables(
    tx: Prisma.TransactionClient,
    actividad: ActividadCompleta,
    elegidos: { participacionId: string; usuarioId: string }[],
    asignadorId: string,
  ): Promise<Prisma.TareaResponsableCreateManyTareaInput[]> {
    const usuarios = await tx.usuario.findMany({
      where: { id: { in: elegidos.map((e) => e.usuarioId) }, activo: true, eliminadoEn: null },
      include: { roles: { where: { rol: { activo: true } } } },
    });

    const vistos = new Set<string>();
    const resultado = elegidos.map((e) => {
      const participacion = actividad.participaciones.find((p) => p.id === e.participacionId);
      if (!participacion) throw errorCampo('responsables', 'Participación no válida para esta actividad');
      const usuario = usuarios.find((u) => u.id === e.usuarioId);
      if (!usuario) throw errorCampo('responsables', 'Usuario no disponible');
      if (vistos.has(e.usuarioId)) throw errorCampo('responsables', `${nombreDe(usuario)} está elegido dos veces`);
      vistos.add(e.usuarioId);
      const rol = participacion.roles.find((r) => usuario.roles.some((u) => u.rolId === r.rolId));
      if (!rol) throw errorCampo('responsables', `${nombreDe(usuario)} no tiene un rol permitido para "${participacion.nombre}"`);
      return { usuarioId: usuario.id, participacionId: participacion.id, rolId: rol.rolId, prioridadRolId: rol.prioridadRolId, asignadoPorId: asignadorId };
    });

    for (const p of actividad.participaciones) {
      const cantidad = resultado.filter((r) => r.participacionId === p.id).length;
      if (p.obligatoria && cantidad === 0) throw errorCampo('responsables', `Falta asignar "${p.nombre}"`);
      if (cantidad > p.cantidad) throw errorCampo('responsables', `"${p.nombre}" admite ${p.cantidad} persona(s)`);
    }
    return resultado;
  }

  // ─── Avisos ──────────────────────────────────────────────

  /** "Enfoque · P-2026-0003 · jue. 1 oct., 10:00" y el enlace a su prospecto o trabajo. */
  private async describir(tareaId: string) {
    const t = await this.prisma.tarea.findUnique({
      where: { id: tareaId },
      include: {
        actividad: true,
        prospecto: { select: { id: true, codigo: true, responsableId: true } },
        trabajo: { select: { id: true, codigo: true } },
        responsables: { select: { usuarioId: true } },
      },
    });
    if (!t) return null;
    const referencia = t.prospecto?.codigo ?? t.trabajo?.codigo;
    const cuando = t.inicio ? fechaLegible(t.fecha.toISOString().slice(0, 10), horaEnLima(t.inicio)) : null;
    return {
      tarea: t,
      texto: [t.titulo ?? t.actividad.nombre, referencia, cuando].filter(Boolean).join(' · '),
      enlace: t.prospecto ? `/prospectos/${t.prospecto.id}` : t.trabajo ? `/trabajos/${t.trabajo.id}` : '/tareas',
      responsables: t.responsables.map((r) => r.usuarioId),
    };
  }

  /** Una tarea quedó por asignar: avisa a quienes coordinan esa actividad. */
  async avisarPorAsignar(tareaId: string, autorId: string): Promise<void> {
    const d = await this.describir(tareaId);
    if (!d || d.tarea.estado !== 'por_asignar' || !d.tarea.actividad.rolCoordinadorId) return;
    const coordinadores = await this.notificaciones.conRol(d.tarea.actividad.rolCoordinadorId);
    // Una reunión (con hora fija) llega a su propia bandeja: confirmar la hora o proponer otra.
    const reunion = d.tarea.actividad.requiereHoraFija;
    await this.notificaciones.notificar(
      coordinadores,
      { tipo: 'tarea.por_asignar', titulo: reunion ? 'Reunión por programar' : 'Nueva tarea por asignar', mensaje: d.texto, enlace: reunion ? '/reuniones' : '/tareas?vista=por-asignar' },
      autorId,
    );
  }

  /** Días u horas no laborables (feriado, cumpleaños, ausencia) bloquean la programación: no es solo un aviso. */
  private async verificarLaborable(
    db: Prisma.TransactionClient | PrismaService,
    usuarioIds: string[],
    tarea: { id?: string; fecha: string; inicio: Date | null; minutos: number },
    actorId: string,
    campo: string,
  ) {
    if (usuarioIds.length === 0) return;
    const disponibilidad = await this.agenda.disponibilidad(usuarioIds, tarea, db);
    const bloqueados = usuarioIds.filter((id) => disponibilidad.get(id)?.estado === 'no_laborable');
    if (bloqueados.length === 0) return;
    const usuarios = await db.usuario.findMany({ where: { id: { in: bloqueados } }, select: { id: true, nombres: true, apellidos: true } });
    const mensaje = bloqueados
      .map((id) => {
        const motivo = disponibilidad.get(id)!.bloqueo;
        if (id === actorId) return `Ese día no trabajas (${motivo})`;
        const u = usuarios.find((x) => x.id === id);
        return `${u ? nombreDe(u) : 'La persona'} no trabaja ese día (${motivo})`;
      })
      .join('. ');
    throw errorCampo(campo, mensaje);
  }

  // ─── Agenda de reuniones (tabla por días) ─────────────────

  /** Las reuniones de un rango de días con los datos del cliente y de quienes participan; con alcance «propios», las suyas. */
  async reuniones(consulta: ListarReunionesConsulta, usuarioId: string): Promise<ReunionFila[]> {
    const desde = consulta.desde ?? diaEnLima();
    const hasta = consulta.hasta ?? desde;
    if (hasta < desde) throw errorCampo('hasta', 'Debe ser igual o posterior al primer día');
    if (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`) > 31 * 86_400_000) throw errorCampo('hasta', 'Máximo 31 días a la vez');
    const filas = await this.prisma.tarea.findMany({
      where: {
        AND: [await this.filtroVisibles(usuarioId, 'agenda_reuniones.ver')],
        actividad: { tipo: { comportamiento: 'reunion' }, ...(consulta.actividadId && { id: consulta.actividadId }) },
        inicio: { not: null },
        fecha: { gte: new Date(`${desde}T00:00:00Z`), lte: new Date(`${hasta}T00:00:00Z`) },
        ...(consulta.estado && { estado: consulta.estado }),
        ...(consulta.responsableId && { OR: [{ prospecto: { responsableId: consulta.responsableId } }, { trabajo: { prospecto: { responsableId: consulta.responsableId } } }] }),
      },
      include: {
        ...INCLUIR_TAREA,
        responsables: { ...INCLUIR_TAREA.responsables, include: { ...INCLUIR_TAREA.responsables.include, rol: { select: { nombre: true, codigo: true } } } },
        prospecto: {
          select: {
            ...INCLUIR_TAREA.prospecto.select,
            responsable: { select: { id: true, nombres: true, apellidos: true } },
            nivelAcademico: { select: { nombre: true } },
            carrera: { select: { nombre: true } },
            universidad: { select: { nombre: true } },
            trabajo: { select: { id: true } },
          },
        },
        trabajo: {
          select: {
            id: true,
            codigo: true,
            titulo: true,
            nivelAcademico: { select: { nombre: true } },
            carrera: { select: { nombre: true } },
            universidad: { select: { nombre: true } },
            prospecto: { select: { responsable: { select: { id: true, nombres: true, apellidos: true } } } },
            integrantes: { where: { esTitular: true }, take: 1, select: { persona: { select: CAMPOS_PERSONA } } },
          },
        },
      },
      orderBy: [{ fecha: 'asc' }, { inicio: 'asc' }, { creadoEn: 'asc' }],
    });
    const ahora = new Date();
    return filas.map((t) => {
      const tarea = aTareaItem(t as unknown as TareaCompleta, ahora);
      const p = t.prospecto;
      const w = t.trabajo;
      const quien = (codigo: string) => t.responsables.find((r) => r.rol.codigo === codigo)?.usuario ?? null;
      return {
        tarea,
        cliente: p?.contactos[0]?.persona ?? w?.integrantes[0]?.persona ?? null,
        nivelAcademico: p?.nivelAcademico?.nombre ?? w?.nivelAcademico?.nombre ?? null,
        carrera: p?.carrera?.nombre ?? w?.carrera?.nombre ?? null,
        universidad: p?.universidad?.nombre ?? w?.universidad?.nombre ?? null,
        enlace: t.enlaceReunion,
        jefe: quien(ROLES_BASE.JEFE_PROD),
        auxiliar: quien(ROLES_BASE.AUXILIAR),
        asistente: p?.responsable ?? w?.prospecto?.responsable ?? null,
        condicion: p && !p.trabajo ? ('potencial_cliente' as const) : ('cliente' as const),
        motivo: t.motivoCancelacion ?? (t.estado === 'no_asistio' ? 'El cliente no asistió' : null),
      };
    });
  }

  /**
   * Elige el jefe de producción y, opcionalmente, el auxiliar de apoyo de una reunión. Cada uno ocupa la participación de la actividad que admite
   * su rol; lo demás (p. ej. quien acompaña desde administración) se conserva. Usa la misma asignación y avisos que «Asignar».
   */
  async cambiarEquipoReunion(tareaId: string, datos: EquipoReunionDatos, actor: ActorTarea): Promise<TareaItem> {
    const tarea = await this.obtenerVisible(tareaId, actor.usuarioId, 'tareas.asignar');
    if (tarea.actividad.tipo.comportamiento !== 'reunion') throw new BadRequestException('Solo las reuniones tienen jefe y auxiliar de apoyo');
    if (!esActiva(tarea.estado)) throw new BadRequestException('La reunión ya está cerrada');
    if (!datos.jefeId && !datos.auxiliarId) throw errorCampo('jefeId', 'Elige al menos al jefe de producción o a un auxiliar');
    if (datos.jefeId && datos.jefeId === datos.auxiliarId) throw errorCampo('auxiliarId', 'El auxiliar de apoyo debe ser otra persona que el jefe');

    const participaciones = tarea.actividad.participaciones;
    const paraRol = (codigo: string) => participaciones.find((p) => p.roles.some((r) => r.rol.codigo === codigo));
    const lugarJefe = paraRol(ROLES_BASE.JEFE_PROD);
    const lugarAuxiliar = paraRol(ROLES_BASE.AUXILIAR);
    if (datos.jefeId && !lugarJefe) throw errorCampo('jefeId', 'Esta reunión no admite jefe de producción: revisa sus participaciones en Catálogos');
    if (datos.auxiliarId && !lugarAuxiliar) throw errorCampo('auxiliarId', 'Esta reunión no admite auxiliar: revisa sus participaciones en Catálogos');
    if (datos.jefeId && datos.auxiliarId && lugarJefe!.id === lugarAuxiliar!.id && lugarJefe!.cantidad < 2) {
      throw errorCampo('auxiliarId', `«${lugarJefe!.nombre}» admite una sola persona. En Catálogos → Actividades → ${tarea.actividad.nombre}, sube «Personas» a 2 (o crea una participación para el auxiliar de apoyo).`);
    }

    // Cada uno debe tener el rol que se le pide (la participación puede admitir varios).
    const roles = await this.prisma.usuarioRol.findMany({ where: { usuarioId: { in: [datos.jefeId, datos.auxiliarId].filter((x): x is string => Boolean(x)) }, rol: { activo: true } }, select: { usuarioId: true, rol: { select: { codigo: true } } } });
    const tiene = (id: string, codigo: string) => roles.some((r) => r.usuarioId === id && r.rol.codigo === codigo);
    if (datos.jefeId && !tiene(datos.jefeId, ROLES_BASE.JEFE_PROD)) throw errorCampo('jefeId', 'Debe ser un jefe de producción activo');
    if (datos.auxiliarId && !tiene(datos.auxiliarId, ROLES_BASE.AUXILIAR)) throw errorCampo('auxiliarId', 'Debe ser un auxiliar de producción activo');

    // Se conserva a quien no es jefe ni auxiliar (p. ej. quien acompaña desde administración).
    const actuales = await this.prisma.tareaResponsable.findMany({ where: { tareaId }, select: { usuarioId: true, participacionId: true, rol: { select: { codigo: true } } } });
    const conservados = actuales.filter((r) => ![ROLES_BASE.JEFE_PROD, ROLES_BASE.AUXILIAR].includes(r.rol.codigo as never)).map((r) => ({ participacionId: r.participacionId, usuarioId: r.usuarioId }));
    const responsables = [
      ...conservados,
      ...(datos.jefeId ? [{ participacionId: lugarJefe!.id, usuarioId: datos.jefeId }] : []),
      ...(datos.auxiliarId ? [{ participacionId: lugarAuxiliar!.id, usuarioId: datos.auxiliarId }] : []),
    ];
    return this.asignar(tareaId, { responsables, motivoForzado: datos.motivoForzado, confirmarImpacto: datos.confirmarImpacto, forzarFechasFijas: datos.forzarFechasFijas }, actor);
  }

  /** Si una reunión deja tareas sin llegar a su fecha hay que confirmarlo; si atrasa un trabajo de fechas inamovibles, aceptarlo de forma expresa. Devuelve cuántas dejan de llegar. */
  private async exigirImpacto(impactos: ImpactoReunion[], datos: { confirmarImpacto?: boolean; forzarFechasFijas?: boolean }, actorId: string): Promise<number> {
    const fijas = [...new Set(impactos.flatMap((i) => i.fijasAfectadas))];
    if (fijas.length > 0 && !datos.forzarFechasFijas) {
      throw new ConflictException({ message: `Esta reunión atrasaría trabajos con fechas inamovibles (${fijas.join(', ')}). Cambia la hora o, si de verdad debe hacerse, acéptalo de forma expresa.`, codigo: 'fechas_fijas', impacto: impactos });
    }
    if (fijas.length > 0 && !('trabajos.fijar_fechas' in (await this.permisos.efectivos(actorId)))) {
      throw new ForbiddenException('Solo quien puede fijar o liberar fechas puede atrasar un trabajo con fechas inamovibles');
    }
    const enRojo = impactos.reduce((n, i) => n + i.pasanARojo, 0);
    if (enRojo > 0 && !datos.confirmarImpacto) {
      throw new ConflictException({ message: `Con esta reunión ${enRojo} ${enRojo === 1 ? 'tarea deja' : 'tareas dejan'} de llegar a su fecha límite. Confírmalo para continuar.`, codigo: 'impacto_cola', impacto: impactos });
    }
    return enRojo;
  }

  /** Avisa a quien coordina y al jefe responsable de cada trabajo que una reunión dejó tareas sin llegar a su fecha límite. */
  private async avisarImpacto(impactos: ImpactoReunion[], rolCoordinadorId: string | null, autorId: string): Promise<void> {
    const afectadas = impactos.flatMap((i) => i.tareas.filter((t) => t.pasaARojo));
    if (afectadas.length === 0) return;
    const codigos = [...new Set(afectadas.map((t) => t.trabajoCodigo))];
    const jefes = await this.prisma.trabajoEquipo.findMany({ where: { funcion: 'jefe_responsable', hasta: null, trabajo: { codigo: { in: codigos } } }, select: { usuarioId: true } });
    const coordinadores = rolCoordinadorId ? await this.notificaciones.conRol(rolCoordinadorId) : [];
    await this.notificaciones.notificar(
      [...coordinadores, ...jefes.map((j) => j.usuarioId)],
      { tipo: 'cola.impacto', titulo: 'Una reunión dejó trabajos sin llegar a su fecha', mensaje: `${codigos.join(', ')}: reordena la cola, busca apoyo o ajusta la reunión`, enlace: '/entregas' },
      autorId,
    );
  }

  /** Impacto de asignar esta reunión a esas personas: qué tareas de su cola se corren y cuáles dejan de llegar a su fecha. */
  async impactoDeAsignar(tareaId: string, usuarioIds: string[], usuarioActor: string, nuevo?: { fecha: string; hora: string } | 'cancelar'): Promise<ImpactoReunion[]> {
    const tarea = await this.obtenerVisible(tareaId, usuarioActor, nuevo ? 'tareas.editar' : 'tareas.asignar');
    if (!tarea.inicio) return [];
    // Cancelar una reunión asignada: el tiempo libre lo aprovechan las actividades siguientes de su cola (se adelantan).
    if (nuevo === 'cancelar') return this.contingencias.impactoDeReunion(tarea.responsables.map((r) => r.usuario.id), null, tarea.id, tarea.fecha.toISOString().slice(0, 10));
    // Reprogramar una reunión ya asignada: qué le pasa a la cola de quienes la hacen si cambia de hora.
    if (nuevo) {
      const quienes = tarea.responsables.map((r) => r.usuario.id);
      const desde = horaAMinutos(nuevo.hora);
      return this.contingencias.impactoDeReunion(quienes, { fecha: nuevo.fecha, inicio: desde, fin: desde + tarea.minutosEstimados }, tarea.id);
    }
    // Quien ya la tiene asignada ya la lleva en su agenda: solo importan las personas nuevas.
    const nuevos = usuarioIds.filter((id) => !tarea.responsables.some((r) => r.usuario.id === id));
    const inicio = horaAMinutos(horaEnLima(tarea.inicio));
    return this.contingencias.impactoDeReunion(nuevos, { fecha: tarea.fecha.toISOString().slice(0, 10), inicio, fin: inicio + tarea.minutosEstimados });
  }

  /** Guarda (o quita) el enlace de la videollamada de una reunión. */
  async guardarEnlaceReunion(tareaId: string, datos: EnlaceReunionDatos, actor: ActorTarea): Promise<TareaItem> {
    const tarea = await this.obtenerVisible(tareaId, actor.usuarioId, 'tareas.editar');
    if (tarea.actividad.tipo.comportamiento !== 'reunion') throw new BadRequestException('Solo las reuniones tienen enlace');
    const enlace = datos.enlace ?? null;
    await this.prisma.$transaction(async (tx) => {
      await tx.tarea.update({ where: { id: tareaId }, data: { enlaceReunion: enlace } });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'enlace_reunion', entidad: 'tarea', entidadId: tareaId, antes: { enlace: tarea.enlaceReunion }, despues: { enlace }, ip: actor.ip }, tx);
    });
    return this.detalle(tareaId, actor.usuarioId);
  }

  // ─── Asignar (bandeja del coordinador) ────────────────────

  /** Tareas por asignar de las actividades que coordina alguno de sus roles (el administrador ve todas). */
  async porAsignar(usuarioId: string): Promise<TareaItem[]> {
    const roles = await this.prisma.usuarioRol.findMany({ where: { usuarioId, rol: { activo: true } }, include: { rol: true } });
    const esAdmin = roles.some((r) => r.rol.codigo === ROLES_BASE.ADMIN);
    const filas = await this.prisma.tarea.findMany({
      where: { estado: 'por_asignar', ...(!esAdmin && { actividad: { rolCoordinadorId: { in: roles.map((r) => r.rolId) } } }) },
      include: INCLUIR_TAREA,
      orderBy: ORDEN_TAREAS,
    });
    const ahora = new Date();
    return filas.map((t) => aTareaItem(t, ahora));
  }

  /** Personas que pueden cubrir cada participación, ordenadas por prioridad del rol y disponibilidad. */
  async candidatos(tareaId: string, usuarioId: string): Promise<CandidatosTarea> {
    const tarea = await this.obtenerVisible(tareaId, usuarioId, 'tareas.asignar');
    const rolIds = [...new Set(tarea.actividad.participaciones.flatMap((p) => p.roles.map((r) => r.rolId)))];
    const usuarios = await this.prisma.usuario.findMany({
      where: { activo: true, eliminadoEn: null, roles: { some: { rolId: { in: rolIds } } } },
      select: { id: true, nombres: true, apellidos: true, roles: { select: { rolId: true } } },
    });
    const agenda = await this.agendaDelDia(usuarios.map((u) => u.id), tarea.fecha, tarea.id);
    const disponibilidad = await this.agenda.disponibilidad(
      usuarios.map((u) => u.id),
      { id: tarea.id, fecha: tarea.fecha.toISOString().slice(0, 10), inicio: tarea.inicio, minutos: tarea.minutosEstimados },
    );

    return {
      tarea: aTareaItem(tarea),
      participaciones: tarea.actividad.participaciones.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        obligatoria: p.obligatoria,
        cantidad: p.cantidad,
        candidatos: usuarios
          .flatMap((u) => {
            const rol = p.roles.find((r) => u.roles.some((ur) => ur.rolId === r.rolId));
            if (!rol) return [];
            const suyas = agenda.filter((a) => a.usuarioId === u.id);
            return [
              {
                usuario: { id: u.id, nombres: u.nombres, apellidos: u.apellidos },
                rol: { codigo: rol.rol.codigo, nombre: rol.rol.nombre },
                prioridad: { nombre: rol.prioridad.nombre, nivel: rol.prioridad.nivel },
                conflictos: this.conflictos(suyas, tarea.inicio, tarea.minutosEstimados),
                tareasDelDia: suyas.length,
                disponibilidad: disponibilidad.get(u.id)!,
              },
            ];
          })
          .sort(
            (a, b) =>
              Number(a.disponibilidad.estado === 'no_laborable') - Number(b.disponibilidad.estado === 'no_laborable') ||
              a.prioridad.nivel - b.prioridad.nivel ||
              RANGO_DISPONIBILIDAD[a.disponibilidad.estado] - RANGO_DISPONIBILIDAD[b.disponibilidad.estado] ||
              a.disponibilidad.ocupado - b.disponibilidad.ocupado ||
              a.usuario.apellidos.localeCompare(b.usuario.apellidos),
          ),
      })),
    };
  }

  /** Tareas activas del día de un grupo de personas (para detectar choques y medir carga). */
  private async agendaDelDia(usuarioIds: string[], fecha: Date, excluirTareaId?: string) {
    const filas = await this.prisma.tareaResponsable.findMany({
      where: {
        usuarioId: { in: usuarioIds },
        tarea: { fecha, estado: { in: ['pendiente', 'en_proceso'] }, ...(excluirTareaId && { id: { not: excluirTareaId } }) },
      },
      include: { tarea: { include: { actividad: { select: { nombre: true } } } } },
    });
    return filas.map((f) => ({ usuarioId: f.usuarioId, tarea: f.tarea }));
  }

  private conflictos(
    agenda: { tarea: { id: string; inicio: Date | null; minutosEstimados: number; actividad: { nombre: string } } }[],
    inicio: Date | null,
    minutos: number,
  ): ConflictoAgenda[] {
    if (!inicio) return [];
    const fin = finDe(inicio, minutos);
    return agenda
      .filter(({ tarea: t }) => t.inicio && t.inicio < fin && finDe(t.inicio, t.minutosEstimados) > inicio)
      .map(({ tarea: t }) => ({
        tareaId: t.id,
        actividad: t.actividad.nombre,
        inicio: t.inicio!.toISOString(),
        fin: finDe(t.inicio!, t.minutosEstimados).toISOString(),
      }));
  }

  async asignar(tareaId: string, datos: AsignarTareaDatos, actor: ActorTarea): Promise<TareaItem> {
    const tarea = await this.obtenerVisible(tareaId, actor.usuarioId, 'tareas.asignar');
    if (!esActiva(tarea.estado)) throw new BadRequestException('Solo se asignan tareas pendientes');

    const responsables = await this.resolverResponsables(this.prisma, tarea.actividad, datos.responsables, actor.usuarioId);
    const ids = responsables.map((r) => r.usuarioId);
    const referencia = { id: tarea.id, fecha: tarea.fecha.toISOString().slice(0, 10), inicio: tarea.inicio, minutos: tarea.minutosEstimados };
    await this.verificarLaborable(this.prisma, ids, referencia, actor.usuarioId, 'responsables');

    const [agenda, disponibilidad] = await Promise.all([this.agendaDelDia(ids, tarea.fecha, tarea.id), this.agenda.disponibilidad(ids, referencia)]);
    const choques = responsables
      .map((r) => ({
        usuarioId: r.usuarioId,
        conflictos: this.conflictos(agenda.filter((a) => a.usuarioId === r.usuarioId), tarea.inicio, tarea.minutosEstimados),
        avisos: disponibilidad.get(r.usuarioId)?.avisos ?? [],
      }))
      .filter((c) => c.avisos.length > 0);

    if (choques.length > 0 && !datos.motivoForzado) {
      throw new ConflictException({
        message: 'Hay avisos de agenda (choque, fuera de horario o capacidad). Indica un motivo para asignar de todos modos.',
        choques,
      });
    }
    if (choques.length > 0 && !('tareas.forzar_agenda' in (await this.permisos.efectivos(actor.usuarioId)))) {
      throw new ForbiddenException('No tienes permiso para forzar la agenda');
    }

    // Una reunión con hora corre lo que ya tiene en su cola: si algo deja de llegar a su fecha límite hay que aceptarlo; un trabajo de fechas inamovibles, aceptarlo de forma expresa.
    const impactos = tarea.actividad.tipo.comportamiento === 'reunion' ? await this.impactoDeAsignar(tareaId, ids, actor.usuarioId) : [];
    const enRojo = await this.exigirImpacto(impactos, datos, actor.usuarioId);

    const usuarios = await this.prisma.usuario.findMany({ where: { id: { in: responsables.map((r) => r.usuarioId) } } });
    await this.prisma.$transaction(async (tx) => {
      await tx.tareaResponsable.deleteMany({ where: { tareaId } });
      await tx.tareaResponsable.createMany({
        data: responsables.map((r) => {
          const forzado = choques.some((c) => c.usuarioId === r.usuarioId);
          return { ...r, tareaId, forzado, motivoForzado: forzado ? datos.motivoForzado : null };
        }),
      });
      await tx.tarea.update({ where: { id: tareaId }, data: { estado: tarea.estado === 'por_asignar' ? 'pendiente' : tarea.estado } });
      if (tarea.prospectoId) {
        await tx.prospectoEvento.create({
          data: {
            prospectoId: tarea.prospectoId,
            tipo: 'tarea',
            detalle: `"${tarea.actividad.nombre}" asignado a ${usuarios.map(nombreDe).join(', ')}`,
            datos: { tareaId },
            usuarioId: actor.usuarioId,
          },
        });
      }
      await this.auditoria.registrar(
        { usuarioId: actor.usuarioId, accion: 'asignar', entidad: 'tarea', entidadId: tareaId, antes: tarea.responsables, despues: datos, ip: actor.ip },
        tx,
      );
    });
    const d = await this.describir(tareaId);
    if (d) await this.notificaciones.notificar(d.responsables, { tipo: 'tarea.asignada', titulo: 'Te asignaron una tarea', mensaje: d.texto, enlace: '/tareas' }, actor.usuarioId);
    if (enRojo > 0) await this.avisarImpacto(impactos, tarea.actividad.rolCoordinadorId, actor.usuarioId);
    return this.detalle(tareaId, actor.usuarioId);
  }

  // ─── Completar, reprogramar, cancelar ─────────────────────

  async completar(tareaId: string, datos: CompletarTareaDatos, actor: ActorTarea): Promise<ResultadoCompletar> {
    const tarea = await this.obtenerVisible(tareaId, actor.usuarioId, 'tareas.editar');
    if (tarea.estado === 'por_asignar') throw new BadRequestException('Primero hay que asignar a un responsable');
    if (!esActiva(tarea.estado)) throw new BadRequestException('La tarea ya está cerrada');
    // Con alcance "propios" solo la completa quien la realiza (el dueño del prospecto puede reprogramarla o cancelarla).
    const alcance = await this.alcance(actor.usuarioId, 'tareas.editar');
    if (alcance !== 'todos' && !tarea.responsables.some((r) => r.usuario.id === actor.usuarioId)) {
      throw new ForbiddenException('Solo el responsable de la actividad puede completarla');
    }

    const { actividad } = tarea;
    if (tarea.entregableId && actividad.tipo.comportamiento === 'revision') {
      throw new BadRequestException('Las revisiones se cierran aprobando u observando el entregable');
    }
    const esReunion = actividad.tipo.comportamiento === 'reunion';
    const resultadoContacto = datos.resultadoContactoId
      ? await this.prisma.resultadoContacto.findFirst({ where: { id: datos.resultadoContactoId, activo: true } })
      : null;
    if (actividad.esSeguimiento && !resultadoContacto) throw errorCampo('resultadoContactoId', 'Elige el resultado del contacto');
    if (datos.siguiente && datos.marcarPerdido) throw new BadRequestException('Agenda el siguiente paso o márcalo como perdido, no ambos');

    const estado = esReunion && !datos.asistio ? 'no_asistio' : 'completada';
    const efectivos = await this.permisos.efectivos(actor.usuarioId);
    let intentos = 0;
    let siguienteId: string | null = null;

    await this.prisma.$transaction(async (tx) => {
      await tx.tarea.update({
        where: { id: tareaId },
        data: { estado, completadaEn: new Date(), resultado: datos.resultado ?? null, resultadoContactoId: resultadoContacto?.id ?? null },
      });
      // Al terminar la tarea se detiene el cronómetro de quien lo tuviera corriendo.
      await cerrarTramos(tx, { tareaId });
      if (tarea.trabajoId) await this.produccion.alAvanzarTarea(tx, tareaId, true);
      if (!tarea.prospectoId) return;

      const prospecto = await tx.prospecto.findUniqueOrThrow({ where: { id: tarea.prospectoId }, include: { etapa: true } });
      intentos = prospecto.intentosSinRespuesta;
      if (actividad.esSeguimiento) {
        intentos = resultadoContacto?.cuentaSinRespuesta ? intentos + 1 : 0;
        await tx.prospecto.update({ where: { id: prospecto.id }, data: { intentosSinRespuesta: intentos } });
      }

      const partes = [
        estado === 'no_asistio' ? `El cliente no asistió a "${actividad.nombre}"` : `${actividad.nombre}${resultadoContacto ? `: ${resultadoContacto.nombre}` : ' realizado'}`,
        datos.resultado,
      ].filter(Boolean);
      await tx.prospectoEvento.create({
        data: {
          prospectoId: prospecto.id,
          tipo: actividad.esSeguimiento ? 'contacto' : 'tarea',
          detalle: partes.join(' — '),
          datos: { tareaId },
          usuarioId: actor.usuarioId,
        },
      });

      if (estado === 'completada') await this.embudo.alOcurrir(tx, prospecto.id, actividad.id, 'al_completar', actor.usuarioId);

      if (datos.siguiente) {
        siguienteId = await this.programarParaProspecto(prospecto.id, datos.siguiente, actor, tx, 'siguiente.');
      } else if (datos.marcarPerdido) {
        const perdida = await tx.etapaProspecto.findFirst({ where: { clase: 'perdida', activa: true } });
        if (!perdida) throw new BadRequestException('No hay una etapa de pérdida configurada');
        await this.embudo.cambiar(tx, {
          prospectoId: prospecto.id,
          etapaId: perdida.id,
          motivoPerdidaId: datos.marcarPerdido.motivoPerdidaId,
          usuarioId: actor.usuarioId,
          puedeMarcarPerdido: 'prospectos.marcar_perdido' in efectivos,
          puedeReactivar: false,
        });
      } else if (actividad.esSeguimiento && prospecto.etapa.clase === 'abierta') {
        // Todo prospecto activo debe tener un próximo paso.
        const pendientes = await tx.tarea.count({ where: { prospectoId: prospecto.id, estado: { in: ['por_asignar', 'pendiente', 'en_proceso'] } } });
        if (pendientes === 0) {
          throw errorCampo('siguiente', 'Agenda el siguiente seguimiento o marca el prospecto como perdido');
        }
      }

      await this.auditoria.registrar(
        { usuarioId: actor.usuarioId, accion: 'completar', entidad: 'tarea', entidadId: tareaId, despues: datos, ip: actor.ip },
        tx,
      );
    });

    if (siguienteId) await this.avisarPorAsignar(siguienteId, actor.usuarioId);
    // Al dueño del prospecto le interesa saber que se hizo una reunión (p. ej., el enfoque).
    if (esReunion && tarea.prospecto) {
      await this.notificaciones.notificar(
        [tarea.prospecto.responsableId],
        {
          tipo: 'prospecto.reunion',
          titulo: estado === 'no_asistio' ? `El cliente no asistió a "${actividad.nombre}"` : `Se realizó "${actividad.nombre}"`,
          mensaje: [tarea.prospecto.codigo, datos.resultado].filter(Boolean).join(' · '),
          enlace: `/prospectos/${tarea.prospecto.id}`,
        },
        actor.usuarioId,
      );
    }
    const umbral = await this.parametros.numero('prospectos.intentos_sin_respuesta');
    return {
      tarea: await this.detalle(tareaId, actor.usuarioId),
      sugerirPerdido: !datos.marcarPerdido && actividad.esSeguimiento && intentos >= umbral,
      intentosSinRespuesta: intentos,
    };
  }

  /** Quien la realiza marca que empezó (en producción, el entregable y el trabajo pasan a "en proceso"). */
  async iniciar(tareaId: string, actor: ActorTarea): Promise<TareaItem> {
    const tarea = await this.obtenerVisible(tareaId, actor.usuarioId, 'tareas.editar');
    if (tarea.estado !== 'pendiente') throw new BadRequestException('Solo se empiezan tareas pendientes');
    if (!tarea.responsables.some((r) => r.usuario.id === actor.usuarioId)) throw new ForbiddenException('Solo el responsable puede empezarla');
    await this.prisma.$transaction(async (tx) => {
      await tx.tarea.update({ where: { id: tareaId }, data: { estado: 'en_proceso' } });
      if (tarea.trabajoId) await this.produccion.alAvanzarTarea(tx, tareaId, false);
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'iniciar', entidad: 'tarea', entidadId: tareaId, ip: actor.ip }, tx);
    });
    return this.detalle(tareaId, actor.usuarioId);
  }

  async reprogramar(tareaId: string, datos: ReprogramarTareaDatos, actor: ActorTarea): Promise<TareaItem> {
    const tarea = await this.obtenerVisible(tareaId, actor.usuarioId, 'tareas.editar');
    if (!esActiva(tarea.estado)) throw new BadRequestException('Solo se reprograman tareas pendientes');
    // Las tareas de producción de un trabajo con fechas fijas no se mueven.
    if (tarea.trabajoId && tarea.entregableId) {
      const trabajo = await this.prisma.trabajo.findUniqueOrThrow({ where: { id: tarea.trabajoId }, select: { codigo: true, fechasFijas: true, fechasFijasMotivo: true } });
      if (trabajo.fechasFijas) throw errorFechasFijas(trabajo);
    }
    const { fecha, inicio } = this.validarProgramacion(tarea.actividad, { ...datos, modalidad: tarea.modalidad ?? undefined });

    await this.verificarLaborable(
      this.prisma,
      tarea.responsables.map((r) => r.usuario.id),
      { id: tarea.id, fecha: datos.fecha, inicio, minutos: tarea.minutosEstimados },
      actor.usuarioId,
      'fecha',
    );

    // Una reunión ya asignada: si el nuevo horario choca o cae fuera del horario de quien la hace pide un motivo (como al asignar), y se ve qué se corre en su cola.
    let enRojo = 0;
    let impactos: ImpactoReunion[] = [];
    const quienes = tarea.responsables.map((r) => r.usuario.id);
    if (tarea.actividad.requiereHoraFija && inicio && quienes.length > 0) {
      const disponibilidad = await this.agenda.disponibilidad(quienes, { id: tarea.id, fecha: datos.fecha, inicio, minutos: tarea.minutosEstimados });
      const choques = quienes
        .map((usuarioId) => ({ usuarioId, avisos: disponibilidad.get(usuarioId)?.avisos ?? [] }))
        .filter((c) => c.avisos.length > 0);
      if (choques.length > 0 && !datos.motivoForzado) {
        throw new ConflictException({ message: 'Hay avisos de agenda (choque, fuera de horario o capacidad). Indica un motivo para reprogramar de todos modos.', choques });
      }
      if (choques.length > 0 && !('tareas.forzar_agenda' in (await this.permisos.efectivos(actor.usuarioId)))) {
        throw new ForbiddenException('No tienes permiso para forzar la agenda');
      }
      impactos = await this.contingencias.impactoDeReunion(quienes, { fecha: datos.fecha, inicio: horaAMinutos(datos.hora!), fin: horaAMinutos(datos.hora!) + tarea.minutosEstimados }, tarea.id);
      enRojo = await this.exigirImpacto(impactos, datos, actor.usuarioId);
    }

    const antes = `${fechaLegible(tarea.fecha.toISOString().slice(0, 10), tarea.inicio ? horaEnLima(tarea.inicio) : null)}`;
    await this.prisma.$transaction(async (tx) => {
      await tx.tarea.update({ where: { id: tareaId }, data: { fecha, inicio, vecesReprogramada: { increment: 1 } } });
      if (tarea.prospectoId) {
        await tx.prospectoEvento.create({
          data: {
            prospectoId: tarea.prospectoId,
            tipo: 'tarea',
            detalle: `"${tarea.actividad.nombre}" reprogramado del ${antes} al ${fechaLegible(datos.fecha, datos.hora)}${datos.motivo ? ` — ${datos.motivo}` : ''}`,
            datos: { tareaId },
            usuarioId: actor.usuarioId,
          },
        });
      }
      await this.auditoria.registrar(
        { usuarioId: actor.usuarioId, accion: 'reprogramar', entidad: 'tarea', entidadId: tareaId, antes: { fecha: tarea.fecha, inicio: tarea.inicio }, despues: datos, ip: actor.ip },
        tx,
      );
    });
    const d = await this.describir(tareaId);
    if (d) {
      await this.notificaciones.notificar(
        [...d.responsables, d.tarea.prospecto?.responsableId, d.tarea.creadaPorId],
        {
          tipo: 'tarea.reprogramada',
          // Si aún espera responsable, producción está proponiendo otra hora: quien la pidió debe confirmarla con el cliente.
          titulo: tarea.estado === 'por_asignar' ? 'Producción propone otra hora para la reunión' : 'Se reprogramó una tarea',
          mensaje: `${d.texto}${datos.motivo ? ` — ${datos.motivo}` : ''}`,
          enlace: d.enlace,
        },
        actor.usuarioId,
      );
    }
    if (enRojo > 0) await this.avisarImpacto(impactos, tarea.actividad.rolCoordinadorId, actor.usuarioId);
    return this.detalle(tareaId, actor.usuarioId);
  }

  async cancelar(tareaId: string, motivo: string, actor: ActorTarea): Promise<TareaItem> {
    const tarea = await this.obtenerVisible(tareaId, actor.usuarioId, 'tareas.editar');
    if (!esActiva(tarea.estado)) throw new BadRequestException('La tarea ya está cerrada');
    // Cancelan el coordinador, quien la creó o el dueño del prospecto; quien solo la realiza, no.
    const efectivos = await this.permisos.efectivos(actor.usuarioId);
    const puede =
      efectivos['tareas.editar'] === 'todos' ||
      'tareas.asignar' in efectivos ||
      tarea.creadaPorId === actor.usuarioId ||
      tarea.prospecto?.responsableId === actor.usuarioId;
    if (!puede) throw new ForbiddenException('Solo el coordinador o el responsable del prospecto pueden cancelar esta actividad');
    await this.prisma.$transaction(async (tx) => {
      await tx.tarea.update({ where: { id: tareaId }, data: { estado: 'cancelada', motivoCancelacion: motivo } });
      await cerrarTramos(tx, { tareaId });
      if (tarea.prospectoId) {
        await tx.prospectoEvento.create({
          data: { prospectoId: tarea.prospectoId, tipo: 'tarea', detalle: `Se canceló "${tarea.actividad.nombre}" — ${motivo}`, datos: { tareaId }, usuarioId: actor.usuarioId },
        });
      }
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'cancelar', entidad: 'tarea', entidadId: tareaId, despues: { motivo }, ip: actor.ip }, tx);
    });
    const d = await this.describir(tareaId);
    if (d) {
      await this.notificaciones.notificar(
        [...d.responsables, d.tarea.prospecto?.responsableId],
        { tipo: 'tarea.cancelada', titulo: 'Se canceló una tarea', mensaje: `${d.texto} — ${motivo}`, enlace: d.enlace },
        actor.usuarioId,
      );
    }
    return this.detalle(tareaId, actor.usuarioId);
  }

  // ─── Listados ────────────────────────────────────────────

  /** Tareas activas donde es responsable, más las que cerró hoy. */
  async mias(usuarioId: string): Promise<TareaItem[]> {
    const hoy = new Date(`${diaEnLima()}T00:00:00Z`);
    const filas = await this.prisma.tarea.findMany({
      where: {
        responsables: { some: { usuarioId } },
        OR: [{ estado: { in: ['pendiente', 'en_proceso'] } }, { completadaEn: { gte: hoy } }],
      },
      include: INCLUIR_TAREA,
      orderBy: ORDEN_TAREAS,
      take: 300,
    });
    const ahora = new Date();
    return filas.map((t) => aTareaItem(t, ahora));
  }

  /** Tareas de un prospecto (para su detalle): activas primero, luego el historial. */
  async deProspecto(prospectoId: string): Promise<TareaItem[]> {
    const filas = await this.prisma.tarea.findMany({ where: { prospectoId }, include: INCLUIR_TAREA, orderBy: ORDEN_TAREAS });
    const ahora = new Date();
    const items = filas.map((t) => aTareaItem(t, ahora));
    return [...items.filter((t) => esActiva(t.estado)), ...items.filter((t) => !esActiva(t.estado)).reverse()];
  }
}
