import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { diaEnLima, formatearSoles, type CobroDatos, type TrabajoDetalle, type TrabajoProveedorDatos } from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import { siguienteCodigo } from '../common/correlativo.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TrabajosService, type ActorTrabajo } from './trabajos.service.js';

const errorCampo = (campo: string, mensaje: string) => new BadRequestException({ message: 'Datos inválidos', errores: [{ campo, mensaje }] });
const dia = (fecha: string) => new Date(`${fecha}T00:00:00Z`);

/**
 * Trabajos que entrega un proveedor: no pasan por el embudo (sin prospecto) ni llevan contrato firmado, pero sí
 * se les puede registrar el cobro, que paga el proveedor. Un proveedor puede tener varios trabajos.
 */
@Injectable()
export class TrabajosProveedorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trabajos: TrabajosService,
    private readonly permisos: PermisosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** El cobro se guarda como el contrato del trabajo (cuotas y pagos), sin documento ni garantía. */
  private async crearCobro(tx: Prisma.TransactionClient, trabajoId: string, cobro: CobroDatos, hoy: string, actor: ActorTrabajo, codigo: string, diasGarantia = 0) {
    await tx.contrato.create({
      data: {
        trabajoId,
        fechaFirma: dia(hoy),
        montoTotal: cobro.montoTotal,
        formaPago: cobro.formaPago,
        diasGarantia,
        creadoPor: actor.usuarioId,
        cuotas: { create: cobro.cuotas.map((c, i) => ({ numero: i + 1, monto: c.monto, vencimiento: dia(c.vencimiento) })) },
      },
    });
    await tx.trabajoEvento.create({
      data: { trabajoId, tipo: 'contrato', detalle: `Cobro registrado: ${formatearSoles(cobro.montoTotal)} en ${cobro.cuotas.length} ${cobro.cuotas.length === 1 ? 'pago' : 'pagos'}`, usuarioId: actor.usuarioId },
    });
    await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'registrar_cobro', entidad: 'trabajo', entidadId: trabajoId, despues: { codigo, ...cobro }, ip: actor.ip }, tx);
  }

  async registrar(datos: TrabajoProveedorDatos, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    const efectivos = await this.permisos.efectivos(actor.usuarioId);
    if (datos.cobro && !('contratos.crear' in efectivos)) throw new ForbiddenException('No tienes permiso para registrar cobros');
    const hoy = diaEnLima();
    if (datos.fechaLimite < hoy) throw errorCampo('fechaLimite', 'La fecha de entrega no puede ser anterior a hoy');

    const [proveedor, tipo, prioridad, nivel, universidad, carrera, actividad, cliente] = await Promise.all([
      this.prisma.proveedor.findFirst({ where: { id: datos.proveedorId, eliminadoEn: null }, select: { id: true, nombres: true, apellidos: true, activo: true } }),
      this.prisma.tipoTrabajo.count({ where: { id: datos.tipoTrabajoId } }),
      this.prisma.prioridadTrabajo.count({ where: { id: datos.prioridadId } }),
      this.prisma.nivelAcademico.count({ where: { id: datos.nivelAcademicoId } }),
      this.prisma.universidad.count({ where: { id: datos.universidadId } }),
      this.prisma.carrera.count({ where: { id: datos.carreraId } }),
      this.prisma.actividad.findFirst({ where: { id: datos.actividadId, activa: true }, select: { aplicaA: true, requiereHoraFija: true } }),
      datos.clienteId ? this.prisma.persona.findFirst({ where: { id: datos.clienteId, eliminadoEn: null }, select: { id: true, nombres: true, apellidos: true } }) : Promise.resolve(null),
    ]);
    if (datos.clienteId && !cliente) throw errorCampo('clienteId', 'Cliente no encontrado');
    if (!proveedor) throw errorCampo('proveedorId', 'Proveedor no encontrado');
    if (!proveedor.activo) throw errorCampo('proveedorId', 'El proveedor está inactivo');
    if (!tipo) throw errorCampo('tipoTrabajoId', 'Tipo de trabajo no válido');
    if (!prioridad) throw errorCampo('prioridadId', 'Prioridad no válida');
    if (!nivel) throw errorCampo('nivelAcademicoId', 'Nivel académico no válido');
    if (!universidad) throw errorCampo('universidadId', 'Universidad no válida');
    if (!carrera) throw errorCampo('carreraId', 'Carrera no válida');
    if (!actividad || actividad.aplicaA === 'prospecto') throw errorCampo('actividadId', 'Esta actividad no aplica a trabajos');
    if (actividad.requiereHoraFija) throw errorCampo('actividadId', 'Las actividades con hora fija se programan desde la agenda');

    const id = await this.prisma.$transaction(async (tx) => {
      const codigo = await siguienteCodigo(tx, 'PR');
      const trabajo = await tx.trabajo.create({
        data: {
          codigo,
          proveedorId: proveedor.id,
          tipoTrabajoId: datos.tipoTrabajoId,
          titulo: datos.titulo,
          prioridadId: datos.prioridadId,
          nivelAcademicoId: datos.nivelAcademicoId,
          universidadId: datos.universidadId,
          carreraId: datos.carreraId,
          linkDrive: datos.linkDrive,
          observaciones: datos.observaciones ?? null,
          actividadPlanId: datos.actividadId,
          minutosPlan: datos.minutosEstimados,
          fechaInicio: dia(hoy),
          fechaLimite: dia(datos.fechaLimite),
          creadoPor: actor.usuarioId,
          // El cliente de quien es el trabajo (si se indicó) queda como su titular.
          ...(cliente && { integrantes: { create: { personaId: cliente.id, esTitular: true, orden: 0 } } }),
        },
        select: { id: true },
      });
      await tx.trabajoEvento.create({
        data: {
          trabajoId: trabajo.id,
          tipo: 'creado',
          detalle: `Trabajo registrado del proveedor ${proveedor.nombres} ${proveedor.apellidos}${cliente ? ` para el cliente ${[cliente.nombres, cliente.apellidos].filter(Boolean).join(' ')}` : ''}`,
          usuarioId: actor.usuarioId,
        },
      });
      if (datos.cobro) await this.crearCobro(tx, trabajo.id, datos.cobro, hoy, actor, codigo);
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'crear', entidad: 'trabajo', entidadId: trabajo.id, despues: { ...datos, codigo }, ip: actor.ip }, tx);
      return trabajo.id;
    });
    return this.trabajos.obtener(id, actor.usuarioId);
  }

  /** Registra el cobro de un trabajo de proveedor que aún no lo tiene. */
  async registrarCobro(trabajoId: string, cobro: CobroDatos, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    await this.trabajos.verificarVisible(trabajoId, actor.usuarioId);
    const t = await this.prisma.trabajo.findFirst({ where: { id: trabajoId, eliminadoEn: null }, select: { codigo: true, proveedorId: true, estado: true, contrato: { select: { id: true } }, prospecto: { select: { clienteDirecto: true } }, tipoTrabajo: { select: { diasGarantia: true } } } });
    if (!t) throw new NotFoundException('Trabajo no encontrado');
    // Solo los trabajos de proveedor y los de clientes registrados directo sin monto se cobran así: los demás nacen con contrato.
    if (!t.proveedorId && !t.prospecto?.clienteDirecto) throw new BadRequestException('Solo los trabajos de proveedores o de clientes registrados directo se cobran así: los demás llevan contrato');
    if (t.estado === 'cancelado') throw new BadRequestException('El trabajo está cancelado');
    if (t.contrato) throw new ConflictException('Este trabajo ya tiene un cobro registrado');
    await this.prisma.$transaction((tx) => this.crearCobro(tx, trabajoId, cobro, diaEnLima(), actor, t.codigo, t.proveedorId ? 0 : t.tipoTrabajo.diasGarantia));
    return this.trabajos.obtener(trabajoId, actor.usuarioId);
  }
}
