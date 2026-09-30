import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  diaEnLima,
  horaEnLima,
  instanteDesdeLima,
  ROLES_BASE,
  type ActividadCatalogo,
  type AsignarTareaDatos,
  type CandidatosTarea,
  type CompletarTareaDatos,
  type ConflictoAgenda,
  type EstadoDisponibilidad,
  type PermisoCodigo,
  type ProgramarTareaDatos,
  type ReprogramarTareaDatos,
  type ResultadoCompletar,
  type TareaItem,
} from '@grupoes/shared';
import { AgendaService } from '../agenda/agenda.service.js';
import { AuditoriaService } from '../common/auditoria.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ParametrosService } from '../parametros/parametros.service.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmbudoService } from './embudo.service.js';
import { aTareaItem, esActiva, finDe, INCLUIR_TAREA, ORDEN_TAREAS } from './mapeo.js';

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
    if (!tx) return this.prisma.$transaction((t) => this.programarParaProspecto(prospectoId, datos, actor, t, prefijo));

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
    const esReunion = actividad.tipo.comportamiento === 'reunion';
    const resultadoContacto = datos.resultadoContactoId
      ? await this.prisma.resultadoContacto.findFirst({ where: { id: datos.resultadoContactoId, activo: true } })
      : null;
    if (actividad.esSeguimiento && !resultadoContacto) throw errorCampo('resultadoContactoId', 'Elige el resultado del contacto');
    if (datos.siguiente && datos.marcarPerdido) throw new BadRequestException('Agenda el siguiente paso o márcalo como perdido, no ambos');

    const estado = esReunion && !datos.asistio ? 'no_asistio' : 'completada';
    const efectivos = await this.permisos.efectivos(actor.usuarioId);
    let intentos = 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.tarea.update({
        where: { id: tareaId },
        data: { estado, completadaEn: new Date(), resultado: datos.resultado ?? null, resultadoContactoId: resultadoContacto?.id ?? null },
      });
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
        await this.programarParaProspecto(prospecto.id, datos.siguiente, actor, tx, 'siguiente.');
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

    const umbral = await this.parametros.numero('prospectos.intentos_sin_respuesta');
    return {
      tarea: await this.detalle(tareaId, actor.usuarioId),
      sugerirPerdido: !datos.marcarPerdido && actividad.esSeguimiento && intentos >= umbral,
      intentosSinRespuesta: intentos,
    };
  }

  async reprogramar(tareaId: string, datos: ReprogramarTareaDatos, actor: ActorTarea): Promise<TareaItem> {
    const tarea = await this.obtenerVisible(tareaId, actor.usuarioId, 'tareas.editar');
    if (!esActiva(tarea.estado)) throw new BadRequestException('Solo se reprograman tareas pendientes');
    const { fecha, inicio } = this.validarProgramacion(tarea.actividad, { ...datos, modalidad: tarea.modalidad ?? undefined });

    await this.verificarLaborable(
      this.prisma,
      tarea.responsables.map((r) => r.usuario.id),
      { id: tarea.id, fecha: datos.fecha, inicio, minutos: tarea.minutosEstimados },
      actor.usuarioId,
      'fecha',
    );

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
      if (tarea.prospectoId) {
        await tx.prospectoEvento.create({
          data: { prospectoId: tarea.prospectoId, tipo: 'tarea', detalle: `Se canceló "${tarea.actividad.nombre}" — ${motivo}`, datos: { tareaId }, usuarioId: actor.usuarioId },
        });
      }
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'cancelar', entidad: 'tarea', entidadId: tareaId, despues: { motivo }, ip: actor.ip }, tx);
    });
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
