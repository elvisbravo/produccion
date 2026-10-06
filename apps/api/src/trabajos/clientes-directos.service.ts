import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { ClienteDirectoDatos, ConvertirProspectoDatos, TrabajoDetalle, UsuarioResumen } from '@grupoes/shared';
import { siguienteCodigo } from '../common/correlativo.js';
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
  ) {}

  /** Quienes pueden figurar como responsable del cliente: personas activas que ven prospectos (sin los administradores ocultos). */
  async posiblesResponsables(actorId: string): Promise<UsuarioResumen[]> {
    const ocultos = (await this.permisos.veAdministradores(actorId)) ? [] : await this.permisos.idsAdministradores();
    const ids = (await this.notificaciones.conPermiso('prospectos.ver')).filter((id) => !ocultos.includes(id));
    return this.prisma.usuario.findMany({ where: { id: { in: ids }, activo: true, eliminadoEn: null }, select: { id: true, nombres: true, apellidos: true }, orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }] });
  }

  async registrar(datos: ClienteDirectoDatos, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    const efectivos = await this.permisos.efectivos(actor.usuarioId);
    if (datos.pagos.length > 0 && !('contratos.registrar_pago' in efectivos) && !('trabajos.registrar_cliente_directo' in efectivos)) {
      throw new ForbiddenException('No tienes permiso para registrar pagos');
    }

    const [responsables, tipo, prioridad, nivel, universidad, carrera, ganada, inicial] = await Promise.all([
      this.posiblesResponsables(actor.usuarioId),
      this.prisma.tipoTrabajo.findFirst({ where: { id: datos.tipoTrabajoId, activo: true } }),
      this.prisma.prioridadTrabajo.count({ where: { id: datos.prioridadId, activo: true } }),
      this.prisma.nivelAcademico.count({ where: { id: datos.trabajo.nivelAcademicoId } }),
      this.prisma.universidad.count({ where: { id: datos.trabajo.universidadId } }),
      this.prisma.carrera.count({ where: { id: datos.trabajo.carreraId } }),
      this.prisma.etapaProspecto.findFirst({ where: { clase: 'ganada', activa: true } }),
      this.prisma.etapaProspecto.findFirst({ where: { inicial: true, activa: true }, orderBy: { orden: 'asc' } }),
    ]);
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

      const conversion: ConvertirProspectoDatos = {
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
        },
        actor,
      );
    });

    await this.trabajos.avisarTrabajoNuevo(id, actor);
    return this.trabajos.obtener(id, actor.usuarioId);
  }
}
