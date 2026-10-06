import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ROLES_BASE, type ClienteDirectoDatos, ConvertirProspectoDatos, TrabajoDetalle, UsuarioResumen } from '@grupoes/shared';
import { siguienteCodigo } from '../common/correlativo.js';
import { ProduccionService } from '../produccion/produccion.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PersonasService } from '../personas/personas.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TrabajosService, type ActorTrabajo } from './trabajos.service.js';

const errorCampo = (campo: string, mensaje: string) => new BadRequestException({ message: 'Datos inválidos', errores: [{ campo, mensaje }] });
const ORIGEN = 'Cliente directo';

/**
 * Cliente que ya trabaja con nosotros y se registra sin pasar por el seguimiento comercial: por debajo se crea el prospecto
 * ya convertido (marcado como "cliente directo", fuera de los reportes de conversión), el trabajo, el contrato y los pagos
 * ya recibidos, todo en una sola transacción.
 */
@Injectable()
export class ClientesDirectosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trabajos: TrabajosService,
    private readonly personas: PersonasService,
    private readonly permisos: PermisosService,
    private readonly notificaciones: NotificacionesService,
    private readonly produccion: ProduccionService,
  ) {}

  /** Quienes pueden figurar como responsable del cliente: personas activas que ven prospectos (asistentes administrativos…) y los jefes de producción; sin los administradores ocultos. */
  async posiblesResponsables(actorId: string): Promise<UsuarioResumen[]> {
    const ocultos = (await this.permisos.veAdministradores(actorId)) ? [] : await this.permisos.idsAdministradores();
    const jefes = (await this.prisma.usuarioRol.findMany({ where: { rol: { codigo: ROLES_BASE.JEFE_PROD, activo: true } }, select: { usuarioId: true } })).map((r) => r.usuarioId);
    const ids = [...new Set([...(await this.notificaciones.conPermiso('prospectos.ver')), ...jefes])].filter((id) => !ocultos.includes(id));
    return this.prisma.usuario.findMany({ where: { id: { in: ids }, activo: true, eliminadoEn: null }, select: { id: true, nombres: true, apellidos: true }, orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }] });
  }

  async registrar(datos: ClienteDirectoDatos, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    const efectivos = await this.permisos.efectivos(actor.usuarioId);
    if (datos.pagos.length > 0 && !('contratos.registrar_pago' in efectivos) && !('trabajos.registrar_cliente_directo' in efectivos)) {
      throw new ForbiddenException('No tienes permiso para registrar pagos');
    }

    const [responsables, tipo, prioridad, nivel, universidad, carrera, ganada, inicial, proveedor, actividad] = await Promise.all([
      this.posiblesResponsables(actor.usuarioId),
      this.prisma.tipoTrabajo.findFirst({ where: { id: datos.tipoTrabajoId, activo: true } }),
      this.prisma.prioridadTrabajo.count({ where: { id: datos.prioridadId, activo: true } }),
      this.prisma.nivelAcademico.count({ where: { id: datos.trabajo.nivelAcademicoId } }),
      this.prisma.universidad.count({ where: { id: datos.trabajo.universidadId } }),
      this.prisma.carrera.count({ where: { id: datos.trabajo.carreraId } }),
      this.prisma.etapaProspecto.findFirst({ where: { clase: 'ganada', activa: true } }),
      this.prisma.etapaProspecto.findFirst({ where: { inicial: true, activa: true }, orderBy: { orden: 'asc' } }),
      datos.proveedorId ? this.prisma.proveedor.findFirst({ where: { id: datos.proveedorId, eliminadoEn: null }, select: { id: true, nombres: true, apellidos: true, activo: true } }) : Promise.resolve(null),
      datos.programacion ? this.prisma.actividad.findFirst({ where: { id: datos.programacion.actividadId, activa: true }, select: { aplicaA: true, requiereHoraFija: true } }) : Promise.resolve(null),
    ]);
    if (datos.programacion) {
      if (!actividad || actividad.aplicaA === 'prospecto') throw errorCampo('programacion.actividadId', 'Esta actividad no aplica a trabajos');
      if (actividad.requiereHoraFija) throw errorCampo('programacion.actividadId', 'Las actividades con hora fija se programan desde la agenda');
    }
    if (datos.proveedorId && !proveedor) throw errorCampo('proveedorId', 'Proveedor no encontrado');
    if (proveedor && !proveedor.activo) throw errorCampo('proveedorId', 'El proveedor está inactivo');
    if (!responsables.some((r) => r.id === datos.responsableId)) throw errorCampo('responsableId', 'Debe ser una persona activa que pueda seguir clientes');
    if (!tipo) throw errorCampo('tipoTrabajoId', 'Tipo de trabajo no disponible');
    if (!prioridad) throw errorCampo('prioridadId', 'Prioridad no disponible');
    if (!nivel) throw errorCampo('trabajo.nivelAcademicoId', 'Nivel académico no válido');
    if (!universidad) throw errorCampo('trabajo.universidadId', 'Universidad no válida');
    if (!carrera) throw errorCampo('trabajo.carreraId', 'Carrera no válida');
    if (!ganada) throw new BadRequestException('No hay una etapa "Convertido" configurada en el embudo');
    if (!inicial) throw new BadRequestException('No hay una etapa inicial configurada en el embudo');
    if (datos.integrantes.length > tipo.maxIntegrantes) throw errorCampo('integrantes', `${tipo.nombre} admite hasta ${tipo.maxIntegrantes} integrante(s)`);

    const id = await this.prisma.$transaction(async (tx) => {
      // Cada integrante es una persona (se identifica por su celular); si ya existía, se completan sus datos.
      const personas: { personaId: string; esPrincipal: boolean; orden: number; celular: string }[] = [];
      for (const [orden, i] of datos.integrantes.entries()) {
        const persona = await this.personas.resolver(
          tx,
          { celular: i.celular, nombres: i.nombres, apellidos: i.apellidos, email: i.email, tipoDocumento: i.tipoDocumento, numeroDocumento: i.numeroDocumento, esPrincipal: i.esTitular },
          actor.usuarioId,
        );
        personas.push({ personaId: persona.id, esPrincipal: i.esTitular, orden, celular: i.celular });
      }

      const origen = (await tx.origenContacto.findUnique({ where: { nombre: ORIGEN } })) ?? (await tx.origenContacto.create({ data: { nombre: ORIGEN, orden: 99 } }));
      const codigoProspecto = await siguienteCodigo(tx, 'P');
      const prospecto = await tx.prospecto.create({
        data: {
          codigo: codigoProspecto,
          clienteDirecto: true,
          tipoTrabajoId: datos.tipoTrabajoId,
          prioridadId: datos.prioridadId,
          origenId: origen.id,
          titulo: datos.trabajo.titulo ?? null,
          nivelAcademicoId: datos.trabajo.nivelAcademicoId,
          universidadId: datos.trabajo.universidadId,
          carreraId: datos.trabajo.carreraId,
          linkDrive: datos.trabajo.linkDrive,
          observaciones: datos.observaciones ?? null,
          etapaId: inicial.id,
          captadoPorId: datos.responsableId,
          responsableId: datos.responsableId,
          creadoPor: actor.usuarioId,
          contactos: { create: personas.map(({ personaId, esPrincipal, orden }) => ({ personaId, esPrincipal, orden })) },
          eventos: { create: { tipo: 'creado', detalle: 'Cliente registrado directamente (ya trabajaba con nosotros)', usuarioId: actor.usuarioId } },
        },
        select: { id: true, codigo: true, etapaId: true, tipoTrabajoId: true, titulo: true, prioridadId: true, observaciones: true, detalles: true },
      });

      const conversion: Omit<ConvertirProspectoDatos, 'contrato'> & { contrato?: ConvertirProspectoDatos['contrato'] } = {
        integrantes: datos.integrantes.map((i, n) => ({ personaId: personas[n].personaId, nombres: i.nombres, apellidos: i.apellidos, email: i.email, tipoDocumento: i.tipoDocumento, numeroDocumento: i.numeroDocumento, esTitular: i.esTitular })),
        trabajo: datos.trabajo,
        contrato: datos.contrato,
      };
      return this.trabajos.crearTrabajoDeProspectoTx(
        tx,
        {
          prospectoId: prospecto.id,
          prospecto: { ...prospecto, tipoTrabajo: { diasGarantia: tipo.diasGarantia } },
          celulares: new Map(personas.map((p) => [p.personaId, p.celular])),
          ganadaId: ganada.id,
          datos: conversion,
          pagos: datos.pagos,
          directo: true,
          ...(datos.programacion && { plan: { actividadId: datos.programacion.actividadId, minutos: datos.programacion.minutosEstimados } }),
          ...(proveedor && { proveedor }),
        },
        actor,
      );
    });

    await this.trabajos.avisarTrabajoNuevo(id, actor);
    // La primera actividad: se arma el equipo y se programa la tarea desde la fecha y hora de inicio.
    if (datos.programacion) {
      const [h, m] = datos.programacion.hora.split(':').map(Number);
      try {
        await this.trabajos.armarEquipo(id, { auxiliarPrincipalId: datos.programacion.auxiliarPrincipalId, auxiliaresApoyo: [], jefeResponsableId: datos.programacion.jefeResponsableId, motivo: 'Equipo al registrar el cliente' }, actor);
        // Desde la fecha y hora indicadas, aunque ya hayan pasado: el trabajo ya empezó y debe verse así en la agenda.
        await this.produccion.generarPlan(id, actor, { fecha: datos.trabajo.fechaInicio, minuto: h * 60 + m });
      } catch (err) {
        const cod = (await this.prisma.trabajo.findUniqueOrThrow({ where: { id }, select: { codigo: true } })).codigo;
        throw new BadRequestException(`El cliente quedó registrado (${cod}) pero no se pudo programar la actividad: ${err instanceof Error ? err.message : 'error'}. Arma el equipo y genera el plan desde su ficha.`);
      }
    }
    return this.trabajos.obtener(id, actor.usuarioId);
  }
}
