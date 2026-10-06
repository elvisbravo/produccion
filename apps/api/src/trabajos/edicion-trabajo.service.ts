import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { diaEnLima, type EditarTrabajoDatos, type ReprogramarTrabajoDatos, type TrabajoDetalle } from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TrabajosService, type ActorTrabajo } from './trabajos.service.js';

const errorCampo = (campo: string, mensaje: string) => new BadRequestException({ message: 'Datos inválidos', errores: [{ campo, mensaje }] });
const dia = (fecha: string) => new Date(`${fecha}T00:00:00Z`);
const soloFecha = (f: Date) => f.toISOString().slice(0, 10);
const fechaCorta = (f: string) => f.split('-').reverse().join('/');

/** Reprogramar la entrega de un trabajo y corregir sus datos, con historial y aviso al equipo. */
@Injectable()
export class EdicionTrabajoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trabajos: TrabajosService,
    private readonly auditoria: AuditoriaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  private async interesados(trabajoId: string): Promise<string[]> {
    const t = await this.prisma.trabajo.findUniqueOrThrow({
      where: { id: trabajoId },
      select: { creadoPor: true, prospecto: { select: { responsableId: true } }, equipo: { where: { hasta: null }, select: { usuarioId: true } } },
    });
    return [t.prospecto?.responsableId ?? t.creadoPor, ...t.equipo.map((e) => e.usuarioId)].filter((id): id is string => Boolean(id));
  }

  /**
   * Mueve la fecha de entrega. El entregable final que seguía la fecha del trabajo se mueve con ella, y los demás se
   * ajustan solo si quedaban después de la nueva fecha. Con fechas inamovibles no se puede: primero hay que liberarlas.
   */
  async reprogramar(trabajoId: string, datos: ReprogramarTrabajoDatos, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    await this.trabajos.verificarVisible(trabajoId, actor.usuarioId);
    const t = await this.prisma.trabajo.findFirst({
      where: { id: trabajoId, eliminadoEn: null },
      select: { codigo: true, estado: true, fechaInicio: true, fechaLimite: true, fechasFijas: true, entregables: { select: { id: true, nombre: true, esFinal: true, estado: true, fechaLimite: true } } },
    });
    if (!t) throw new NotFoundException('Trabajo no encontrado');
    if (t.estado === 'finalizado' || t.estado === 'cancelado') throw new BadRequestException('El trabajo ya está cerrado');
    if (t.fechasFijas) throw new BadRequestException('Las fechas de este trabajo son inamovibles: libéralas antes de reprogramar');
    const antes = soloFecha(t.fechaLimite);
    if (datos.fechaLimite === antes) throw errorCampo('fechaLimite', 'Es la misma fecha de entrega que ya tiene');
    if (datos.fechaLimite < soloFecha(t.fechaInicio)) throw errorCampo('fechaLimite', 'No puede ser anterior al inicio del trabajo');
    if (datos.fechaLimite < diaEnLima()) throw errorCampo('fechaLimite', 'No puede ser una fecha pasada');

    const abiertos = t.entregables.filter((e) => !['cerrado', 'entregado'].includes(e.estado));
    const mover = abiertos.filter((e) => (e.esFinal && soloFecha(e.fechaLimite) === antes) || soloFecha(e.fechaLimite) > datos.fechaLimite);
    await this.prisma.$transaction(async (tx) => {
      await tx.trabajo.update({ where: { id: trabajoId }, data: { fechaLimite: dia(datos.fechaLimite), actualizadoPor: actor.usuarioId } });
      for (const e of mover) await tx.entregable.update({ where: { id: e.id }, data: { fechaLimite: dia(datos.fechaLimite) } });
      const ajustados = mover.length ? ` (se movió la fecha de ${mover.length === 1 ? 'un entregable' : `${mover.length} entregables`})` : '';
      await tx.trabajoEvento.create({
        data: { trabajoId, tipo: 'estado', detalle: `Entrega reprogramada: ${fechaCorta(antes)} → ${fechaCorta(datos.fechaLimite)}${ajustados}. Motivo: ${datos.motivo}`, usuarioId: actor.usuarioId },
      });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'reprogramar_entrega', entidad: 'trabajo', entidadId: trabajoId, antes: { fechaLimite: antes }, despues: { fechaLimite: datos.fechaLimite, motivo: datos.motivo }, ip: actor.ip }, tx);
    });
    await this.notificaciones.notificar(
      await this.interesados(trabajoId),
      { tipo: 'trabajo.reprogramado', titulo: `${t.codigo}: nueva entrega ${fechaCorta(datos.fechaLimite)}`, mensaje: `Antes ${fechaCorta(antes)}. ${datos.motivo}`, enlace: `/trabajos/${trabajoId}` },
      actor.usuarioId,
    );
    return this.trabajos.obtener(trabajoId, actor.usuarioId);
  }

  /** Corrige los datos del trabajo (no cambia fechas, prioridad ni tipo). */
  async editar(trabajoId: string, datos: EditarTrabajoDatos, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    await this.trabajos.verificarVisible(trabajoId, actor.usuarioId);
    const t = await this.prisma.trabajo.findFirst({
      where: { id: trabajoId, eliminadoEn: null },
      include: { nivelAcademico: { select: { nombre: true } }, universidad: { select: { nombre: true } }, carrera: { select: { nombre: true } } },
    });
    if (!t) throw new NotFoundException('Trabajo no encontrado');
    if (t.estado === 'cancelado') throw new BadRequestException('El trabajo está cancelado');
    const [nivel, universidad, carrera] = await Promise.all([
      this.prisma.nivelAcademico.findUnique({ where: { id: datos.nivelAcademicoId }, select: { nombre: true } }),
      this.prisma.universidad.findUnique({ where: { id: datos.universidadId }, select: { nombre: true } }),
      this.prisma.carrera.findUnique({ where: { id: datos.carreraId }, select: { nombre: true } }),
    ]);
    if (!nivel) throw errorCampo('nivelAcademicoId', 'Nivel académico no válido');
    if (!universidad) throw errorCampo('universidadId', 'Universidad no válida');
    if (!carrera) throw errorCampo('carreraId', 'Carrera no válida');

    const cambios: string[] = [];
    const cambia = (nombre: string, antes: string | null | undefined, despues: string | null | undefined) => {
      if ((antes ?? '') !== (despues ?? '')) cambios.push(nombre);
    };
    cambia('título', t.titulo, datos.titulo);
    cambia('nivel académico', t.nivelAcademico?.nombre, nivel.nombre);
    cambia('universidad', t.universidad?.nombre, universidad.nombre);
    cambia('carrera', t.carrera?.nombre, carrera.nombre);
    cambia('enlace de Drive', t.linkDrive, datos.linkDrive);
    cambia('observaciones', t.observaciones, datos.observaciones);
    cambia('detalles', t.detalles, datos.detalles);
    if (cambios.length === 0) return this.trabajos.obtener(trabajoId, actor.usuarioId);

    await this.prisma.$transaction(async (tx) => {
      await tx.trabajo.update({
        where: { id: trabajoId },
        data: {
          titulo: datos.titulo ?? null,
          nivelAcademicoId: datos.nivelAcademicoId,
          universidadId: datos.universidadId,
          carreraId: datos.carreraId,
          linkDrive: datos.linkDrive,
          observaciones: datos.observaciones ?? null,
          detalles: datos.detalles ?? null,
          actualizadoPor: actor.usuarioId,
        },
      });
      await tx.trabajoEvento.create({ data: { trabajoId, tipo: 'editado', detalle: `Se actualizó: ${cambios.join(', ')}`, usuarioId: actor.usuarioId } });
      await this.auditoria.registrar(
        {
          usuarioId: actor.usuarioId,
          accion: 'editar',
          entidad: 'trabajo',
          entidadId: trabajoId,
          antes: { titulo: t.titulo, nivel: t.nivelAcademico?.nombre, universidad: t.universidad?.nombre, carrera: t.carrera?.nombre, linkDrive: t.linkDrive },
          despues: datos,
          ip: actor.ip,
        },
        tx,
      );
    });
    return this.trabajos.obtener(trabajoId, actor.usuarioId);
  }
}
