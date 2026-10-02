import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActividadAdmin, ActividadDatos, CatalogoActividades } from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ACTIVIDAD } from '../produccion/produccion.service.js';

const errorCampo = (campo: string, mensaje: string) => new BadRequestException({ message: 'Datos inválidos', errores: [{ campo, mensaje }] });
const DE_SISTEMA: string[] = Object.values(ACTIVIDAD);

const INCLUIR = {
  tipo: true,
  _count: { select: { tareas: true } },
  participaciones: { orderBy: { orden: 'asc' }, include: { roles: { include: { rol: true, prioridad: true }, orderBy: { prioridad: { nivel: 'asc' } } } } },
} as const satisfies Prisma.ActividadInclude;
type Fila = Prisma.ActividadGetPayload<{ include: typeof INCLUIR }>;

interface Actor {
  usuarioId: string;
  ip: string | null;
}

/** Catálogo de actividades: tiempo estimado, quién puede hacerlas y con qué prioridad cada rol. */
@Injectable()
export class ActividadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private aAdmin(a: Fila): ActividadAdmin {
    return {
      id: a.id,
      nombre: a.nombre,
      tipo: { id: a.tipo.id, nombre: a.tipo.nombre, comportamiento: a.tipo.comportamiento, color: a.tipo.color },
      minutosEstimados: a.minutosEstimados,
      aplicaA: a.aplicaA,
      modoAsignacion: a.modoAsignacion,
      requiereHoraFija: a.requiereHoraFija,
      esSeguimiento: a.esSeguimiento,
      rolCoordinadorId: a.rolCoordinadorId,
      activa: a.activa,
      deSistema: DE_SISTEMA.includes(a.nombre),
      tareas: a._count.tareas,
      participaciones: a.participaciones.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        cantidad: p.cantidad,
        obligatoria: p.obligatoria,
        roles: p.roles.map((r) => ({ rolId: r.rolId, rol: r.rol.nombre, prioridadRolId: r.prioridadRolId, prioridad: { nombre: r.prioridad.nombre, nivel: r.prioridad.nivel } })),
      })),
    };
  }

  async listar(): Promise<CatalogoActividades> {
    const [actividades, tipos, roles, prioridades] = await Promise.all([
      this.prisma.actividad.findMany({ orderBy: [{ activa: 'desc' }, { orden: 'asc' }, { nombre: 'asc' }], include: INCLUIR }),
      this.prisma.tipoActividad.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
      this.prisma.rol.findMany({ where: { activo: true, eliminadoEn: null }, orderBy: { nombre: 'asc' }, select: { id: true, codigo: true, nombre: true } }),
      this.prisma.prioridadRol.findMany({ orderBy: { nivel: 'asc' } }),
    ]);
    return {
      actividades: actividades.map((a) => this.aAdmin(a)),
      tipos: tipos.map((t) => ({ id: t.id, nombre: t.nombre, comportamiento: t.comportamiento, color: t.color })),
      roles,
      prioridades: prioridades.map((p) => ({ id: p.id, nombre: p.nombre, nivel: p.nivel, color: p.color })),
    };
  }

  private async validar(tx: Prisma.TransactionClient, datos: ActividadDatos, idActual: string | null) {
    const repetida = await tx.actividad.findFirst({ where: { nombre: { equals: datos.nombre, mode: 'insensitive' }, ...(idActual && { id: { not: idActual } }) }, select: { id: true } });
    if (repetida) throw errorCampo('nombre', 'Ya existe una actividad con ese nombre');
    if (!(await tx.tipoActividad.findFirst({ where: { id: datos.tipoActividadId, activo: true }, select: { id: true } }))) throw errorCampo('tipoActividadId', 'Tipo no válido');
    const roles = [...new Set([...datos.participaciones.flatMap((p) => p.roles.map((r) => r.rolId)), ...(datos.rolCoordinadorId ? [datos.rolCoordinadorId] : [])])];
    if ((await tx.rol.count({ where: { id: { in: roles }, activo: true, eliminadoEn: null } })) !== roles.length) throw errorCampo('participaciones', 'Algún rol no existe o está inactivo');
    const prioridades = await tx.prioridadRol.findMany();
    const nivel = new Map(prioridades.map((p) => [p.id, p.nivel]));
    const nombres = new Set<string>();
    datos.participaciones.forEach((p, i) => {
      const clave = p.nombre.toLowerCase();
      if (nombres.has(clave)) throw errorCampo(`participaciones.${i}.nombre`, 'Ya hay otra participación con ese nombre');
      nombres.add(clave);
      if (new Set(p.roles.map((r) => r.rolId)).size !== p.roles.length) throw errorCampo(`participaciones.${i}.roles`, 'Un rol no puede repetirse');
      if (p.roles.some((r) => !nivel.has(r.prioridadRolId))) throw errorCampo(`participaciones.${i}.roles`, 'Prioridad no válida');
      if (!p.roles.some((r) => nivel.get(r.prioridadRolId) === 1)) throw errorCampo(`participaciones.${i}.roles`, 'Al menos un rol debe ser el principal');
    });
  }

  /** Sincroniza las participaciones: conserva las que ya existen (las tareas las referencian) y quita las demás si nadie las usa. */
  private async guardarParticipaciones(tx: Prisma.TransactionClient, actividadId: string, participaciones: ActividadDatos['participaciones']) {
    const actuales = await tx.actividadParticipacion.findMany({ where: { actividadId }, select: { id: true, nombre: true } });
    const conservadas = new Set(participaciones.map((p) => p.id).filter((id): id is string => Boolean(id)));
    if ([...conservadas].some((id) => !actuales.some((a) => a.id === id))) throw errorCampo('participaciones', 'Una participación no pertenece a esta actividad');
    for (const quitada of actuales.filter((a) => !conservadas.has(a.id))) {
      if (await tx.tareaResponsable.count({ where: { participacionId: quitada.id } })) {
        throw errorCampo('participaciones', `«${quitada.nombre}» ya tiene tareas asignadas: no se puede quitar`);
      }
      await tx.actividadParticipacion.delete({ where: { id: quitada.id } });
    }
    // Primero se renombran las existentes con un nombre temporal para no chocar con la restricción única al intercambiar nombres.
    for (const p of participaciones.filter((x) => x.id)) await tx.actividadParticipacion.update({ where: { id: p.id! }, data: { nombre: `~${p.id}` } });
    for (const [orden, p] of participaciones.entries()) {
      const datos = { nombre: p.nombre, cantidad: p.cantidad, obligatoria: p.obligatoria, orden };
      const id = p.id ?? (await tx.actividadParticipacion.create({ data: { actividadId, ...datos }, select: { id: true } })).id;
      if (p.id) {
        await tx.actividadParticipacion.update({ where: { id }, data: datos });
        await tx.actividadParticipacionRol.deleteMany({ where: { participacionId: id } });
      }
      await tx.actividadParticipacionRol.createMany({ data: p.roles.map((r) => ({ participacionId: id, rolId: r.rolId, prioridadRolId: r.prioridadRolId })) });
    }
  }

  private campos(datos: ActividadDatos) {
    return {
      nombre: datos.nombre,
      tipoActividadId: datos.tipoActividadId,
      minutosEstimados: datos.minutosEstimados,
      aplicaA: datos.aplicaA,
      modoAsignacion: datos.modoAsignacion,
      requiereHoraFija: datos.requiereHoraFija,
      esSeguimiento: datos.esSeguimiento,
      rolCoordinadorId: datos.modoAsignacion === 'coordinada' ? (datos.rolCoordinadorId ?? null) : null,
    };
  }

  async crear(datos: ActividadDatos, actor: Actor): Promise<ActividadAdmin> {
    const id = await this.prisma.$transaction(async (tx) => {
      await this.validar(tx, datos, null);
      const orden = ((await tx.actividad.aggregate({ _max: { orden: true } }))._max.orden ?? 0) + 1;
      const a = await tx.actividad.create({ data: { ...this.campos(datos), orden }, select: { id: true } });
      await this.guardarParticipaciones(tx, a.id, datos.participaciones.map((p) => ({ ...p, id: null })));
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'crear', entidad: 'actividad', entidadId: a.id, despues: datos, ip: actor.ip }, tx);
      return a.id;
    });
    return this.una(id);
  }

  async editar(id: string, datos: ActividadDatos, actor: Actor): Promise<ActividadAdmin> {
    await this.prisma.$transaction(async (tx) => {
      const actual = await tx.actividad.findUnique({ where: { id }, select: { nombre: true } });
      if (!actual) throw new NotFoundException('Actividad no encontrada');
      if (DE_SISTEMA.includes(actual.nombre) && datos.nombre !== actual.nombre) throw errorCampo('nombre', 'El sistema usa esta actividad por su nombre: no se puede renombrar');
      await this.validar(tx, datos, id);
      await tx.actividad.update({ where: { id }, data: this.campos(datos) });
      await this.guardarParticipaciones(tx, id, datos.participaciones);
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'editar', entidad: 'actividad', entidadId: id, despues: datos, ip: actor.ip }, tx);
    });
    return this.una(id);
  }

  async cambiarActiva(id: string, activa: boolean, actor: Actor): Promise<ActividadAdmin> {
    const a = await this.prisma.actividad.findUnique({ where: { id }, select: { nombre: true, activa: true } });
    if (!a) throw new NotFoundException('Actividad no encontrada');
    if (!activa && DE_SISTEMA.includes(a.nombre)) throw new ConflictException('El sistema usa esta actividad: no se puede desactivar');
    await this.prisma.$transaction(async (tx) => {
      await tx.actividad.update({ where: { id }, data: { activa } });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: activa ? 'activar' : 'desactivar', entidad: 'actividad', entidadId: id, ip: actor.ip }, tx);
    });
    return this.una(id);
  }

  private async una(id: string): Promise<ActividadAdmin> {
    return this.aAdmin(await this.prisma.actividad.findUniqueOrThrow({ where: { id }, include: INCLUIR }));
  }
}
