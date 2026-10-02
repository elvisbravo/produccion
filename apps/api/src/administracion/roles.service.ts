import { BadRequestException, ForbiddenException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EVENTO_SESION_ACTUALIZADA, ROLES_BASE, type MatrizRolDatos, type RolDatos, type RolDetalle, type RolItem } from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import { NotificacionesGateway } from '../notificaciones/notificaciones.gateway.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ActorAdmin } from './usuarios.service.js';

/** "Asistente de calidad" → "ASISTENTE_DE_CALIDAD" */
const aCodigo = (nombre: string) =>
  nombre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 36) || 'ROL';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
    private readonly auditoria: AuditoriaService,
    private readonly gateway: NotificacionesGateway,
  ) {}

  /** Quien no gestiona administradores no ve el rol Administrador (ni cuántos usuarios lo tienen). */
  async listar(actorId: string): Promise<RolItem[]> {
    const roles = await this.listarTodos();
    return (await this.permisos.veAdministradores(actorId)) ? roles : roles.filter((r) => r.codigo !== ROLES_BASE.ADMIN);
  }

  private async listarTodos(): Promise<RolItem[]> {
    const roles = await this.prisma.rol.findMany({
      where: { eliminadoEn: null },
      orderBy: [{ esSistema: 'desc' }, { nombre: 'asc' }],
      include: { _count: { select: { permisos: true, usuarios: { where: { usuario: { activo: true, eliminadoEn: null } } } } } },
    });
    return roles.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      descripcion: r.descripcion,
      esSistema: r.esSistema,
      activo: r.activo,
      usuarios: r._count.usuarios,
      permisos: r._count.permisos,
    }));
  }

  async detalle(id: string, actorId: string): Promise<RolDetalle> {
    const item = (await this.listar(actorId)).find((r) => r.id === id);
    if (!item) throw new NotFoundException('Rol no encontrado');
    const filas = await this.prisma.rolPermiso.findMany({ where: { rolId: id, accion: { vigente: true } }, include: { accion: { include: { modulo: { select: { codigo: true } } } } } });
    return {
      ...item,
      esAdministrador: item.codigo === ROLES_BASE.ADMIN,
      matriz: filas.map((f) => ({ permiso: `${f.accion.modulo.codigo}.${f.accion.codigo}`, alcance: f.alcance })).sort((a, b) => a.permiso.localeCompare(b.permiso)),
    };
  }

  async crear(datos: RolDatos, actor: ActorAdmin): Promise<RolDetalle> {
    if (await this.prisma.rol.count({ where: { nombre: datos.nombre, eliminadoEn: null } })) {
      throw new ConflictException({ message: 'Ya existe un rol con ese nombre', errores: [{ campo: 'nombre', mensaje: 'Ya existe un rol con ese nombre' }] });
    }
    let codigo = aCodigo(datos.nombre);
    for (let i = 2; await this.prisma.rol.count({ where: { codigo } }); i++) codigo = `${aCodigo(datos.nombre)}_${i}`;
    const rol = await this.prisma.rol.create({ data: { codigo, nombre: datos.nombre, descripcion: datos.descripcion ?? null, activo: datos.activo, creadoPor: actor.usuarioId } });
    await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'crear', entidad: 'rol', entidadId: rol.id, despues: { codigo, ...datos }, ip: actor.ip });
    return this.detalle(rol.id, actor.usuarioId);
  }

  async editar(id: string, datos: RolDatos, actor: ActorAdmin): Promise<RolDetalle> {
    const antes = await this.detalle(id, actor.usuarioId);
    if (antes.esAdministrador && !datos.activo) throw new BadRequestException('El rol de administrador no se puede desactivar');
    if (await this.prisma.rol.count({ where: { nombre: datos.nombre, eliminadoEn: null, id: { not: id } } })) {
      throw new ConflictException({ message: 'Ya existe un rol con ese nombre', errores: [{ campo: 'nombre', mensaje: 'Ya existe un rol con ese nombre' }] });
    }
    await this.prisma.rol.update({ where: { id }, data: { nombre: datos.nombre, descripcion: datos.descripcion ?? null, activo: datos.activo, actualizadoPor: actor.usuarioId } });
    await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'editar', entidad: 'rol', entidadId: id, antes: { nombre: antes.nombre, descripcion: antes.descripcion, activo: antes.activo }, despues: datos, ip: actor.ip });
    if (antes.activo !== datos.activo) await this.avisarUsuarios(id);
    return this.detalle(id, actor.usuarioId);
  }

  /** Reemplaza la matriz de permisos del rol. Las acciones con alcance lo exigen (por defecto, "propios"). */
  async guardarMatriz(id: string, datos: MatrizRolDatos, actor: ActorAdmin): Promise<RolDetalle> {
    const antes = await this.detalle(id, actor.usuarioId);
    if (antes.esAdministrador) throw new BadRequestException('El administrador tiene siempre todos los permisos');
    const acciones = await this.prisma.accion.findMany({ where: { vigente: true }, include: { modulo: { select: { codigo: true } } } });
    const porCodigo = new Map(acciones.map((a) => [`${a.modulo.codigo}.${a.codigo}`, a]));
    const desconocido = datos.permisos.find((p) => !porCodigo.has(p.permiso));
    if (desconocido) throw new BadRequestException(`Permiso desconocido: ${desconocido.permiso}`);
    const unicos = new Map(datos.permisos.map((p) => [p.permiso, p]));
    // Quien no gestiona administradores no da a un rol permisos que él mismo no tiene (así no se los da a sí mismo por esta vía).
    if (!(await this.permisos.veAdministradores(actor.usuarioId))) {
      const propios = await this.permisos.efectivos(actor.usuarioId);
      const exceso = [...unicos.keys()].find((p) => !(p in propios));
      if (exceso) throw new ForbiddenException('No puedes dar a un rol un permiso que tú no tienes');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rolPermiso.deleteMany({ where: { rolId: id } });
      await tx.rolPermiso.createMany({
        data: [...unicos.values()].map((p) => {
          const accion = porCodigo.get(p.permiso)!;
          return { rolId: id, accionId: accion.id, alcance: accion.usaAlcance ? (p.alcance ?? 'propios') : null };
        }),
      });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'editar_permisos', entidad: 'rol', entidadId: id, antes: antes.matriz, despues: [...unicos.values()], ip: actor.ip }, tx);
    });
    await this.avisarUsuarios(id);
    return this.detalle(id, actor.usuarioId);
  }

  /** Solo roles creados por la empresa y sin usuarios. */
  async eliminar(id: string, actor: ActorAdmin): Promise<void> {
    const rol = await this.detalle(id, actor.usuarioId);
    if (rol.esSistema) throw new BadRequestException('Los roles base del sistema no se eliminan (puedes desactivarlos)');
    if ((await this.prisma.usuarioRol.count({ where: { rolId: id } })) > 0) throw new BadRequestException('Quita primero el rol a sus usuarios');
    await this.prisma.$transaction(async (tx) => {
      await tx.rolPermiso.deleteMany({ where: { rolId: id } });
      await tx.rol.update({ where: { id }, data: { eliminadoEn: new Date(), activo: false, codigo: `${rol.codigo}__${Date.now()}`.slice(0, 40) } });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'eliminar', entidad: 'rol', entidadId: id, antes: rol, ip: actor.ip }, tx);
    });
  }

  /** Los usuarios con este rol ven al instante su nuevo menú. */
  private async avisarUsuarios(rolId: string) {
    const usuarios = await this.prisma.usuarioRol.findMany({ where: { rolId }, select: { usuarioId: true } });
    this.permisos.invalidar();
    for (const u of usuarios) this.gateway.emitirEvento(u.usuarioId, EVENTO_SESION_ACTUALIZADA);
  }
}
