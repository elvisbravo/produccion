import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  Alcance,
  CambiarEtapaDatos,
  CrearProspectoDatos,
  ListarProspectosConsulta,
  Paginado,
  ProspectoDatos,
  ProspectoDetalle,
  ProspectoListadoItem,
  ReasignarLoteDatos,
  ReasignarProspectoDatos,
  ResultadoReasignarLote,
  UsuarioResumen,
} from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import { contieneDigitos, contieneTodas, digitosDe, MAX_COINCIDENCIAS, palabrasDe } from '../common/busqueda.js';
import { siguienteCodigo } from '../common/correlativo.js';
import { Prisma } from '../generated/prisma/client.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PersonasService } from '../personas/personas.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmbudoService } from '../tareas/embudo.service.js';
import { TareasService } from '../tareas/tareas.service.js';
import { aDetalle, aListado, INCLUIR_DETALLE, INCLUIR_LISTADO } from './mapeo.js';

export interface Actor {
  usuarioId: string;
  alcance: Alcance | null;
  ip: string | null;
}

/** Nombres legibles de los campos, para el detalle del evento "editado". */
const ETIQUETAS: Partial<Record<keyof ProspectoDatos, string>> = {
  tipoTrabajoId: 'tipo de trabajo',
  prioridadId: 'prioridad',
  origenId: 'origen',
  nivelAcademicoId: 'nivel académico',
  universidadId: 'universidad',
  carreraId: 'carrera',
  referidoPorId: 'referido por',
  titulo: 'título',
  fechaEntregaTentativa: 'fecha de entrega tentativa',
  linkDrive: 'link del Drive',
  observaciones: 'observaciones',
  detalles: 'detalles',
  temperatura: 'temperatura',
};

@Injectable()
export class ProspectosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly personas: PersonasService,
    private readonly auditoria: AuditoriaService,
    private readonly tareas: TareasService,
    private readonly embudo: EmbudoService,
    private readonly permisos: PermisosService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /** Cambio manual de etapa (kanban, marcar perdido, reactivar). */
  async cambiarEtapa(id: string, datos: CambiarEtapaDatos, actor: Actor): Promise<ProspectoDetalle> {
    await this.obtener(id, actor);
    const efectivos = await this.permisos.efectivos(actor.usuarioId);
    await this.prisma.$transaction(async (tx) => {
      await this.embudo.cambiar(tx, {
        prospectoId: id,
        etapaId: datos.etapaId,
        motivoPerdidaId: datos.motivoPerdidaId,
        usuarioId: actor.usuarioId,
        puedeMarcarPerdido: 'prospectos.marcar_perdido' in efectivos,
        puedeReactivar: 'prospectos.reactivar' in efectivos,
      });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'cambiar_etapa', entidad: 'prospecto', entidadId: id, despues: datos, ip: actor.ip }, tx);
    });
    return this.obtener(id, actor);
  }

  // ─── Reasignar responsable ───────────────────────────────

  /** Para el filtro del listado: quienes pueden seguir prospectos y quienes ya figuran como responsables (aunque hoy no tengan el permiso). */
  async responsablesParaFiltro(actorId: string): Promise<UsuarioResumen[]> {
    const admins = (await this.permisos.veAdministradores(actorId)) ? [] : await this.permisos.idsAdministradores();
    const conPermiso = await this.notificaciones.conPermiso('prospectos.ver');
    const duenos = (await this.prisma.prospecto.findMany({ where: { eliminadoEn: null }, distinct: ['responsableId'], select: { responsableId: true } })).map((p) => p.responsableId);
    const ids = [...new Set([...conPermiso, ...duenos])].filter((id) => !admins.includes(id));
    return this.prisma.usuario.findMany({
      where: { id: { in: ids }, eliminadoEn: null },
      select: { id: true, nombres: true, apellidos: true },
      orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }],
    });
  }

  /** Personas que pueden seguir prospectos: las que tienen permiso para verlos. */
  async posiblesResponsables(actorId: string): Promise<UsuarioResumen[]> {
    const admins = (await this.permisos.veAdministradores(actorId)) ? [] : await this.permisos.idsAdministradores();
    const ids = (await this.notificaciones.conPermiso('prospectos.ver')).filter((id) => !admins.includes(id));
    return this.prisma.usuario.findMany({
      where: { id: { in: ids }, activo: true, eliminadoEn: null },
      select: { id: true, nombres: true, apellidos: true },
      orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }],
    });
  }

  private async validarNuevoResponsable(usuarioId: string, actorId: string): Promise<UsuarioResumen> {
    const u = (await this.posiblesResponsables(actorId)).find((x) => x.id === usuarioId);
    if (!u) {
      throw new BadRequestException({ message: 'Datos inválidos', errores: [{ campo: 'usuarioId', mensaje: 'Debe ser una persona activa que pueda seguir prospectos' }] });
    }
    return u;
  }

  /** Tareas pendientes de un prospecto que tiene a su nombre quien lo dejó: no se mueven solas, porque tienen día, hora y agenda propios. */
  private tareasConLaPersona(prospectoIds: string[], usuarioId: string) {
    return this.prisma.tarea.count({ where: { prospectoId: { in: prospectoIds }, estado: { in: ['pendiente', 'en_proceso'] }, responsables: { some: { usuarioId } } } });
  }

  /** "Reasignar" no lleva alcance propio: se rige por el de "ver prospectos" (con "propios" solo mueve los suyos). */
  private async alcanceDeVer(usuarioId: string): Promise<Alcance | null> {
    return (await this.permisos.efectivos(usuarioId))['prospectos.ver'] ?? null;
  }

  async reasignar(id: string, datos: ReasignarProspectoDatos, actor: Actor): Promise<ProspectoDetalle> {
    const alcance = await this.alcanceDeVer(actor.usuarioId);
    const prospecto = await this.prisma.prospecto.findFirst({
      where: { id, eliminadoEn: null, ...this.filtroAlcance({ ...actor, alcance }) },
      include: { etapa: { select: { clase: true } }, trabajo: { select: { id: true } }, responsable: { select: { id: true, nombres: true, apellidos: true } } },
    });
    if (!prospecto) throw new NotFoundException('Prospecto no encontrado');
    if (prospecto.trabajo || prospecto.etapa.clase !== 'abierta') throw new BadRequestException('Solo se reasignan prospectos abiertos');
    if (prospecto.responsableId === datos.usuarioId) throw new BadRequestException({ message: 'Datos inválidos', errores: [{ campo: 'usuarioId', mensaje: 'Ya es el responsable de este prospecto' }] });
    const nuevo = await this.validarNuevoResponsable(datos.usuarioId, actor.usuarioId);
    const nombre = (u: { nombres: string; apellidos: string }) => `${u.nombres} ${u.apellidos}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.prospecto.update({ where: { id }, data: { responsableId: nuevo.id, actualizadoPor: actor.usuarioId } });
      await tx.prospectoEvento.create({
        data: {
          prospectoId: id,
          tipo: 'reasignado',
          detalle: `Responsable: ${nombre(prospecto.responsable)} → ${nombre(nuevo)}${datos.motivo ? ` — ${datos.motivo}` : ''}`,
          datos: { desde: prospecto.responsableId, hacia: nuevo.id },
          usuarioId: actor.usuarioId,
        },
      });
      await this.auditoria.registrar(
        { usuarioId: actor.usuarioId, accion: 'reasignar', entidad: 'prospecto', entidadId: id, antes: { responsableId: prospecto.responsableId }, despues: { responsableId: nuevo.id, motivo: datos.motivo }, ip: actor.ip },
        tx,
      );
    });
    await this.notificaciones.notificar(
      [nuevo.id],
      { tipo: 'prospecto.reasignado', titulo: `Te asignaron el prospecto ${prospecto.codigo}`, mensaje: datos.motivo ?? null, enlace: `/prospectos/${id}` },
      actor.usuarioId,
    );
    await this.notificaciones.notificar(
      [prospecto.responsableId],
      { tipo: 'prospecto.reasignado', titulo: `Ya no sigues el prospecto ${prospecto.codigo}`, mensaje: `Ahora lo sigue ${nombre(nuevo)}`, enlace: `/prospectos/${id}` },
      actor.usuarioId,
    );
    // Después de reasignarlo, quien actúa puede dejar de verlo según su alcance.
    return this.obtener(id, { ...actor, alcance: 'todos' });
  }

  /** Todos los prospectos abiertos de una persona pasan a otra. Mueve cartera ajena: exige ver todos los prospectos. */
  async reasignarLote(datos: ReasignarLoteDatos, actor: Actor): Promise<ResultadoReasignarLote> {
    if ((await this.alcanceDeVer(actor.usuarioId)) !== 'todos') throw new ForbiddenException('Reasignar la cartera de otra persona exige ver todos los prospectos');
    await this.permisos.verificarObjetivo(actor.usuarioId, datos.desdeUsuarioId);
    const nuevo = await this.validarNuevoResponsable(datos.aUsuarioId, actor.usuarioId);
    const origen = await this.prisma.usuario.findFirst({ where: { id: datos.desdeUsuarioId, eliminadoEn: null }, select: { id: true, nombres: true, apellidos: true } });
    if (!origen) throw new NotFoundException('Usuario no encontrado');
    const prospectos = await this.prisma.prospecto.findMany({
      where: { responsableId: origen.id, eliminadoEn: null, trabajo: null, etapa: { clase: 'abierta' } },
      select: { id: true },
    });
    if (prospectos.length === 0) return { reasignados: 0, tareasPendientes: 0 };
    const ids = prospectos.map((p) => p.id);
    const nombre = (u: { nombres: string; apellidos: string }) => `${u.nombres} ${u.apellidos}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.prospecto.updateMany({ where: { id: { in: ids } }, data: { responsableId: nuevo.id, actualizadoPor: actor.usuarioId } });
      await tx.prospectoEvento.createMany({
        data: ids.map((prospectoId) => ({
          prospectoId,
          tipo: 'reasignado' as const,
          detalle: `Responsable: ${nombre(origen)} → ${nombre(nuevo)}${datos.motivo ? ` — ${datos.motivo}` : ''}`,
          datos: { desde: origen.id, hacia: nuevo.id },
          usuarioId: actor.usuarioId,
        })),
      });
      await this.auditoria.registrar(
        { usuarioId: actor.usuarioId, accion: 'reasignar_lote', entidad: 'usuario', entidadId: origen.id, despues: { aUsuarioId: nuevo.id, cantidad: ids.length, motivo: datos.motivo }, ip: actor.ip },
        tx,
      );
    });
    await this.notificaciones.notificar(
      [nuevo.id],
      {
        tipo: 'prospecto.reasignado',
        titulo: `Te asignaron ${ids.length} ${ids.length === 1 ? 'prospecto' : 'prospectos'} de ${nombre(origen)}`,
        mensaje: datos.motivo ?? null,
        enlace: '/prospectos',
      },
      actor.usuarioId,
    );
    return { reasignados: ids.length, tareasPendientes: await this.tareasConLaPersona(ids, origen.id) };
  }

  /** Filtro según el alcance del permiso: con "propios" (o "equipo") solo los que tiene a cargo. */
  private filtroAlcance(actor: Actor): Prisma.ProspectoWhereInput {
    return actor.alcance === 'todos' ? {} : { responsableId: actor.usuarioId };
  }

  async listar(filtros: ListarProspectosConsulta, actor: Actor): Promise<Paginado<ProspectoListadoItem>> {
    const { q, etapaId, temperatura, tipoTrabajoId, responsableId, pagina, porPagina } = filtros;
    const where: Prisma.ProspectoWhereInput = {
      eliminadoEn: null,
      ...this.filtroAlcance(actor),
      // En un AND aparte: con alcance «propios» no puede pisar el filtro de sus propios prospectos.
      ...(responsableId && { AND: [{ responsableId }] }),
      ...(etapaId && { etapaId }),
      ...(temperatura && { temperatura }),
      ...(tipoTrabajoId && { tipoTrabajoId }),
      ...(q && { id: { in: await this.idsQueCoinciden(q) } }),
    };

    const [total, filas] = await Promise.all([
      this.prisma.prospecto.count({ where }),
      this.prisma.prospecto.findMany({
        where,
        include: INCLUIR_LISTADO,
        orderBy: { creadoEn: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);
    return { datos: filas.map(aListado), total, pagina, porPagina };
  }

  /**
   * Busca, sin distinguir tildes ni mayúsculas, por código, título, nombre y apellido
   * o celular/documento de cualquiera de sus contactos.
   */
  private async idsQueCoinciden(q: string): Promise<string[]> {
    const palabras = palabrasDe(q);
    const digitos = digitosDe(q);
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM prospecto p
      WHERE p.eliminado_en IS NULL AND (
        ${contieneTodas([Prisma.sql`p.codigo`, Prisma.sql`p.titulo`], palabras)}
        OR EXISTS (
          SELECT 1 FROM prospecto_contacto pc JOIN persona pe ON pe.id = pc.persona_id
          WHERE pc.prospecto_id = p.id AND (
            ${contieneTodas([Prisma.sql`pe.nombres`, Prisma.sql`pe.apellidos`], palabras)}
            OR ${contieneDigitos(Prisma.sql`pe.celular`, digitos)}
            OR ${contieneDigitos(Prisma.sql`pe.numero_documento`, digitos)}
          )
        )
      )
      LIMIT ${MAX_COINCIDENCIAS}`;
    return filas.map((f) => f.id);
  }

  async obtener(id: string, actor: Actor): Promise<ProspectoDetalle> {
    const prospecto = await this.prisma.prospecto.findFirst({
      where: { id, eliminadoEn: null, ...this.filtroAlcance(actor) },
      include: INCLUIR_DETALLE,
    });
    if (!prospecto) throw new NotFoundException('Prospecto no encontrado');
    return aDetalle(prospecto, await this.tareas.deProspecto(id));
  }

  async crear(datos: CrearProspectoDatos, actor: Actor): Promise<ProspectoDetalle> {
    await this.validarReferencias(datos);
    const etapaInicial = await this.prisma.etapaProspecto.findFirst({ where: { inicial: true, activa: true }, orderBy: { orden: 'asc' } });
    if (!etapaInicial) throw new BadRequestException('No hay una etapa inicial configurada en el embudo');
    if (datos.primeraActividad && !('tareas.crear' in (await this.permisos.efectivos(actor.usuarioId)))) {
      throw new ForbiddenException('No tienes permiso para programar actividades');
    }

    let tareaId: string | null = null;
    const id = await this.prisma.$transaction(async (tx) => {
      const personas = await this.resolverContactos(tx, datos, actor.usuarioId);
      const codigo = await siguienteCodigo(tx, 'P');

      const prospecto = await tx.prospecto.create({
        data: {
          ...this.camposProspecto(datos),
          codigo,
          etapaId: etapaInicial.id,
          captadoPorId: actor.usuarioId,
          responsableId: actor.usuarioId,
          creadoPor: actor.usuarioId,
          contactos: { create: personas },
          eventos: { create: { tipo: 'creado', detalle: `Prospecto registrado en la etapa "${etapaInicial.nombre}"`, usuarioId: actor.usuarioId } },
        },
        select: { id: true },
      });

      await this.auditoria.registrar(
        { usuarioId: actor.usuarioId, accion: 'crear', entidad: 'prospecto', entidadId: prospecto.id, despues: { codigo, ...datos }, ip: actor.ip },
        tx,
      );
      if (datos.primeraActividad) {
        tareaId = await this.tareas.programarParaProspecto(prospecto.id, datos.primeraActividad, actor, tx, 'primeraActividad.');
      }
      return prospecto.id;
    });

    if (tareaId) await this.tareas.avisarPorAsignar(tareaId, actor.usuarioId);
    return this.obtener(id, { ...actor, alcance: 'todos' });
  }

  async editar(id: string, datos: ProspectoDatos, actor: Actor): Promise<ProspectoDetalle> {
    const antes = await this.obtener(id, actor);
    await this.validarReferencias(datos);

    await this.prisma.$transaction(async (tx) => {
      const personas = await this.resolverContactos(tx, datos, actor.usuarioId);
      const cambios = this.describirCambios(antes, datos, personas.map((p) => p.personaId));

      await tx.prospectoContacto.deleteMany({ where: { prospectoId: id } });
      await tx.prospecto.update({
        where: { id },
        data: {
          ...this.camposProspecto(datos),
          actualizadoPor: actor.usuarioId,
          contactos: { create: personas },
          ...(cambios.length > 0 && {
            eventos: { create: { tipo: 'editado', detalle: `Se actualizó: ${cambios.join(', ')}`, usuarioId: actor.usuarioId } },
          }),
        },
      });

      await this.auditoria.registrar(
        { usuarioId: actor.usuarioId, accion: 'editar', entidad: 'prospecto', entidadId: id, antes, despues: datos, ip: actor.ip },
        tx,
      );
    });

    return this.obtener(id, actor);
  }

  private camposProspecto(d: ProspectoDatos) {
    return {
      tipoTrabajoId: d.tipoTrabajoId,
      prioridadId: d.prioridadId,
      origenId: d.origenId,
      nivelAcademicoId: d.nivelAcademicoId ?? null,
      universidadId: d.universidadId ?? null,
      carreraId: d.carreraId ?? null,
      referidoPorId: d.referidoPorId ?? null,
      titulo: d.titulo ?? null,
      fechaEntregaTentativa: d.fechaEntregaTentativa ? new Date(`${d.fechaEntregaTentativa}T00:00:00Z`) : null,
      linkDrive: d.linkDrive ?? null,
      observaciones: d.observaciones ?? null,
      detalles: d.detalles ?? null,
      temperatura: d.temperatura ?? null,
    };
  }

  private async resolverContactos(tx: Prisma.TransactionClient, datos: ProspectoDatos, usuarioId: string) {
    const personas: { personaId: string; esPrincipal: boolean; orden: number }[] = [];
    for (const [orden, contacto] of datos.contactos.entries()) {
      const persona = await this.personas.resolver(tx, contacto, usuarioId);
      personas.push({ personaId: persona.id, esPrincipal: contacto.esPrincipal, orden });
    }
    if (datos.referidoPorId && personas.some((p) => p.personaId === datos.referidoPorId)) {
      throw new BadRequestException('Un contacto no puede ser referido por sí mismo');
    }
    return personas;
  }

  /** Verifica que los catálogos elegidos existan y estén activos, con mensajes claros. */
  private async validarReferencias(d: ProspectoDatos) {
    const [tipo, prioridad, origen, nivel, universidad, carrera, referido] = await Promise.all([
      this.prisma.tipoTrabajo.findFirst({ where: { id: d.tipoTrabajoId, activo: true } }),
      this.prisma.prioridadTrabajo.findFirst({ where: { id: d.prioridadId, activo: true }, select: { id: true } }),
      this.prisma.origenContacto.findFirst({ where: { id: d.origenId, activo: true }, select: { esReferido: true } }),
      d.nivelAcademicoId ? this.prisma.nivelAcademico.findFirst({ where: { id: d.nivelAcademicoId, activo: true }, select: { id: true } }) : true,
      d.universidadId ? this.prisma.universidad.findFirst({ where: { id: d.universidadId, activo: true }, select: { id: true } }) : true,
      d.carreraId ? this.prisma.carrera.findFirst({ where: { id: d.carreraId, activo: true }, select: { id: true } }) : true,
      d.referidoPorId ? this.prisma.persona.findFirst({ where: { id: d.referidoPorId, eliminadoEn: null }, select: { id: true } }) : true,
    ]);

    const errores: { campo: string; mensaje: string }[] = [];
    if (!tipo) errores.push({ campo: 'tipoTrabajoId', mensaje: 'Tipo de trabajo no disponible' });
    if (!prioridad) errores.push({ campo: 'prioridadId', mensaje: 'Prioridad no disponible' });
    if (!origen) errores.push({ campo: 'origenId', mensaje: 'Origen no disponible' });
    if (!nivel) errores.push({ campo: 'nivelAcademicoId', mensaje: 'Nivel académico no disponible' });
    if (!universidad) errores.push({ campo: 'universidadId', mensaje: 'Universidad no disponible' });
    if (!carrera) errores.push({ campo: 'carreraId', mensaje: 'Carrera no disponible' });
    if (!referido) errores.push({ campo: 'referidoPorId', mensaje: 'La persona que refirió no existe' });
    if (tipo && d.contactos.length > tipo.maxIntegrantes) {
      errores.push({
        campo: 'contactos',
        mensaje: `${tipo.nombre} admite hasta ${tipo.maxIntegrantes} ${tipo.maxIntegrantes === 1 ? 'integrante' : 'integrantes'}`,
      });
    }
    if (origen && !origen.esReferido && d.referidoPorId) {
      errores.push({ campo: 'referidoPorId', mensaje: 'Solo se indica "referido por" cuando el origen es Referido' });
    }
    if (errores.length > 0) throw new BadRequestException({ message: 'Datos inválidos', errores });
  }

  private describirCambios(antes: ProspectoDetalle, d: ProspectoDatos, personaIds: string[]): string[] {
    const previo: Record<string, unknown> = {
      tipoTrabajoId: antes.tipoTrabajo.id,
      prioridadId: antes.prioridad.id,
      origenId: antes.origen.id,
      nivelAcademicoId: antes.nivelAcademico?.id,
      universidadId: antes.universidad?.id,
      carreraId: antes.carrera?.id,
      referidoPorId: antes.referidoPor?.id,
      titulo: antes.titulo ?? undefined,
      fechaEntregaTentativa: antes.fechaEntregaTentativa ?? undefined,
      linkDrive: antes.linkDrive ?? undefined,
      observaciones: antes.observaciones ?? undefined,
      detalles: antes.detalles ?? undefined,
      temperatura: antes.temperatura ?? undefined,
    };
    const cambios = (Object.keys(ETIQUETAS) as (keyof ProspectoDatos)[])
      .filter((campo) => (previo[campo] ?? undefined) !== (d[campo] ?? undefined))
      .map((campo) => ETIQUETAS[campo]!);

    const contactosPrevios = antes.contactos.map((c) => `${c.id}:${c.esPrincipal}`).sort().join();
    const contactosNuevos = personaIds.map((id, i) => `${id}:${d.contactos[i].esPrincipal}`).sort().join();
    if (contactosPrevios !== contactosNuevos) cambios.unshift('contactos');
    return cambios;
  }
}
