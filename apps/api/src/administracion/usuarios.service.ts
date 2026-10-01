import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EVENTO_SESION_ACTUALIZADA,
  EVENTO_SESION_CERRADA,
  ROLES_BASE,
  type ClaveTemporal,
  type CrearUsuarioDatos,
  type EditarUsuarioDatos,
  type ExcepcionPermisoDatos,
  type PermisoEfectivoItem,
  type TopesUsuario,
  type UsuarioDetalle,
  type UsuarioListadoItem,
} from '@grupoes/shared';
import { generarClaveTemporal } from '../auth/clave-temporal.js';
import { hashPassword } from '../auth/password.js';
import { AuditoriaService } from '../common/auditoria.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { NotificacionesGateway } from '../notificaciones/notificaciones.gateway.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ActorAdmin {
  usuarioId: string;
  ip: string | null;
}

const CAMPOS_USUARIO = { id: true, nombres: true, apellidos: true } as const;
const INCLUIR = { roles: { include: { rol: { select: { id: true, codigo: true, nombre: true, activo: true } } } } } as const satisfies Prisma.UsuarioInclude;
type UsuarioConRoles = Prisma.UsuarioGetPayload<{ include: typeof INCLUIR }>;
const soloFecha = (d: Date) => d.toISOString().slice(0, 10);
const errorCampo = (campo: string, mensaje: string) => new BadRequestException({ message: 'Datos inválidos', errores: [{ campo, mensaje }] });
const esDuplicado = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
    private readonly auditoria: AuditoriaService,
    private readonly gateway: NotificacionesGateway,
  ) {}

  private aListado(u: UsuarioConRoles): UsuarioListadoItem {
    return {
      id: u.id,
      nombres: u.nombres,
      apellidos: u.apellidos,
      email: u.email,
      celular: u.celular,
      activo: u.activo,
      bloqueado: Boolean(u.bloqueadoHasta && u.bloqueadoHasta > new Date()),
      roles: u.roles.filter((r) => r.rol.activo).map((r) => ({ id: r.rol.id, codigo: r.rol.codigo, nombre: r.rol.nombre })),
      ultimoAcceso: u.ultimoAcceso?.toISOString() ?? null,
    };
  }

  async listar(f: { q?: string; rol?: string; estado: 'activos' | 'inactivos' | 'todos' }): Promise<UsuarioListadoItem[]> {
    const palabras = f.q?.split(/\s+/).filter(Boolean) ?? [];
    const filas = await this.prisma.usuario.findMany({
      where: {
        eliminadoEn: null,
        ...(f.estado !== 'todos' && { activo: f.estado === 'activos' }),
        ...(f.rol && { roles: { some: { rol: { codigo: f.rol } } } }),
        AND: palabras.map((p) => ({
          OR: [{ nombres: { contains: p, mode: 'insensitive' as const } }, { apellidos: { contains: p, mode: 'insensitive' as const } }, { email: { contains: p, mode: 'insensitive' as const } }],
        })),
      },
      include: INCLUIR,
      orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }],
    });
    return filas.map((u) => this.aListado(u));
  }

  async detalle(id: string): Promise<UsuarioDetalle> {
    const u = await this.prisma.usuario.findFirst({ where: { id, eliminadoEn: null }, include: INCLUIR });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    const [efectivos, excepciones, tope, accesos] = await Promise.all([
      this.efectivosConOrigen(u),
      this.prisma.usuarioPermiso.findMany({
        where: { usuarioId: id },
        include: { accion: { include: { modulo: { select: { codigo: true } } } }, otorgante: { select: CAMPOS_USUARIO } },
        orderBy: { fecha: 'desc' },
      }),
      this.prisma.topeHorasExtraUsuario.findUnique({ where: { usuarioId: id } }),
      this.prisma.accesoLog.findMany({ where: { usuarioId: id }, orderBy: { fecha: 'desc' }, take: 10 }),
    ]);
    return {
      ...this.aListado(u),
      fechaNacimiento: u.fechaNacimiento ? soloFecha(u.fechaNacimiento) : null,
      debeCambiarClave: u.debeCambiarClave,
      bloqueadoHasta: u.bloqueadoHasta?.toISOString() ?? null,
      efectivos,
      excepciones: excepciones.map((e) => ({
        id: e.id,
        permiso: `${e.accion.modulo.codigo}.${e.accion.codigo}`,
        tipo: e.tipo,
        alcance: e.alcance,
        motivo: e.motivo,
        otorgadoPor: e.otorgante,
        fecha: e.fecha.toISOString(),
      })),
      topes: { semanal: tope?.semanal === null || !tope ? null : Number(tope.semanal), mensual: tope?.mensual === null || !tope ? null : Number(tope.mensual) },
      accesos: accesos.map((a) => ({ fecha: a.fecha.toISOString(), resultado: a.resultado, ip: a.ip, dispositivo: a.dispositivo })),
    };
  }

  /** Permisos efectivos con su origen: el rol del administrador, otros roles o una concesión individual. */
  private async efectivosConOrigen(u: UsuarioConRoles): Promise<PermisoEfectivoItem[]> {
    const efectivos = await this.permisos.efectivos(u.id);
    const esAdmin = u.roles.some((r) => r.rol.codigo === ROLES_BASE.ADMIN && r.rol.activo);
    const deRoles = await this.prisma.rolPermiso.findMany({
      where: { rol: { activo: true, eliminadoEn: null, usuarios: { some: { usuarioId: u.id } } } },
      include: { rol: { select: { nombre: true } }, accion: { include: { modulo: { select: { codigo: true } } } } },
    });
    return Object.entries(efectivos)
      .map(([permiso, alcance]) => {
        const roles = deRoles.filter((r) => `${r.accion.modulo.codigo}.${r.accion.codigo}` === permiso).map((r) => r.rol.nombre);
        return { permiso, alcance: alcance ?? null, origen: esAdmin ? ('admin' as const) : roles.length ? ('rol' as const) : ('concedido' as const), roles };
      })
      .sort((a, b) => a.permiso.localeCompare(b.permiso));
  }

  // ─── Alta y edición ──────────────────────────────────────

  private async validarRoles(rolIds: string[]) {
    const roles = await this.prisma.rol.findMany({ where: { id: { in: rolIds }, activo: true, eliminadoEn: null } });
    if (roles.length !== new Set(rolIds).size) throw errorCampo('rolIds', 'Algún rol no existe o está inactivo');
    return roles;
  }

  async crear(datos: CrearUsuarioDatos, actor: ActorAdmin): Promise<ClaveTemporal> {
    await this.validarRoles(datos.rolIds);
    const claveTemporal = datos.clave ? null : generarClaveTemporal();
    try {
      const u = await this.prisma.$transaction(async (tx) => {
        const creado = await tx.usuario.create({
          data: {
            nombres: datos.nombres,
            apellidos: datos.apellidos,
            email: datos.email,
            celular: datos.celular ?? null,
            fechaNacimiento: datos.fechaNacimiento ? new Date(`${datos.fechaNacimiento}T00:00:00Z`) : null,
            passwordHash: await hashPassword(datos.clave ?? claveTemporal!),
            // Quien recibe una contraseña de otro debe cambiarla en su primer ingreso.
            debeCambiarClave: true,
            creadoPor: actor.usuarioId,
            roles: { create: datos.rolIds.map((rolId) => ({ rolId })) },
          },
        });
        const { clave: _clave, ...sinClave } = datos;
        await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'crear', entidad: 'usuario', entidadId: creado.id, despues: sinClave, ip: actor.ip }, tx);
        return creado;
      });
      return { usuario: await this.detalle(u.id), claveTemporal };
    } catch (e) {
      if (esDuplicado(e)) throw new ConflictException({ message: 'Ya existe un usuario con ese correo', errores: [{ campo: 'email', mensaje: 'Ya existe un usuario con ese correo' }] });
      throw e;
    }
  }

  async editar(id: string, datos: EditarUsuarioDatos, actor: ActorAdmin): Promise<UsuarioDetalle> {
    const antes = await this.detalle(id);
    try {
      await this.prisma.usuario.update({
        where: { id },
        data: {
          nombres: datos.nombres,
          apellidos: datos.apellidos,
          email: datos.email,
          celular: datos.celular ?? null,
          fechaNacimiento: datos.fechaNacimiento ? new Date(`${datos.fechaNacimiento}T00:00:00Z`) : null,
          actualizadoPor: actor.usuarioId,
        },
      });
    } catch (e) {
      if (esDuplicado(e)) throw new ConflictException({ message: 'Ya existe un usuario con ese correo', errores: [{ campo: 'email', mensaje: 'Ya existe un usuario con ese correo' }] });
      throw e;
    }
    await this.auditoria.registrar({
      usuarioId: actor.usuarioId,
      accion: 'editar',
      entidad: 'usuario',
      entidadId: id,
      antes: { nombres: antes.nombres, apellidos: antes.apellidos, email: antes.email, celular: antes.celular, fechaNacimiento: antes.fechaNacimiento },
      despues: datos,
      ip: actor.ip,
    });
    this.avisarCambio(id);
    return this.detalle(id);
  }

  // ─── Acceso ──────────────────────────────────────────────

  /** Siempre debe quedar al menos un administrador activo. */
  private async verificarOtroAdmin(usuarioId: string) {
    const otros = await this.prisma.usuario.count({
      where: { id: { not: usuarioId }, activo: true, eliminadoEn: null, roles: { some: { rol: { codigo: ROLES_BASE.ADMIN, activo: true } } } },
    });
    if (otros === 0) throw new BadRequestException('Debe quedar al menos un administrador activo');
  }

  private async esAdmin(usuarioId: string) {
    return (await this.prisma.usuarioRol.count({ where: { usuarioId, rol: { codigo: ROLES_BASE.ADMIN } } })) > 0;
  }

  async cambiarActivo(id: string, activo: boolean, actor: ActorAdmin): Promise<UsuarioDetalle> {
    if (id === actor.usuarioId && !activo) throw new BadRequestException('No puedes desactivar tu propio usuario');
    const u = await this.detalle(id);
    if (!activo && (await this.esAdmin(id))) await this.verificarOtroAdmin(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id }, data: { activo, actualizadoPor: actor.usuarioId } });
      if (!activo) await tx.sesion.updateMany({ where: { usuarioId: id, revocadaEn: null }, data: { revocadaEn: new Date(), motivoRevocacion: 'logout' } });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: activo ? 'activar' : 'desactivar', entidad: 'usuario', entidadId: id, antes: { activo: u.activo }, ip: actor.ip }, tx);
    });
    this.permisos.invalidar(id);
    if (!activo) this.gateway.emitirEvento(id, EVENTO_SESION_CERRADA);
    return this.detalle(id);
  }

  async asignarRoles(id: string, rolIds: string[], actor: ActorAdmin): Promise<UsuarioDetalle> {
    const antes = await this.detalle(id);
    const roles = await this.validarRoles(rolIds);
    const quedaAdmin = roles.some((r) => r.codigo === ROLES_BASE.ADMIN);
    if (!quedaAdmin && antes.roles.some((r) => r.codigo === ROLES_BASE.ADMIN)) await this.verificarOtroAdmin(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.usuarioRol.deleteMany({ where: { usuarioId: id } });
      await tx.usuarioRol.createMany({ data: rolIds.map((rolId) => ({ usuarioId: id, rolId })) });
      await this.auditoria.registrar(
        { usuarioId: actor.usuarioId, accion: 'asignar_roles', entidad: 'usuario', entidadId: id, antes: antes.roles.map((r) => r.codigo), despues: roles.map((r) => r.codigo), ip: actor.ip },
        tx,
      );
    });
    this.avisarCambio(id);
    return this.detalle(id);
  }

  async guardarExcepcion(id: string, datos: ExcepcionPermisoDatos, actor: ActorAdmin): Promise<UsuarioDetalle> {
    await this.detalle(id);
    const [modulo, codigo] = datos.permiso.split('.');
    const accion = await this.prisma.accion.findFirst({ where: { codigo, vigente: true, modulo: { codigo: modulo } } });
    if (!accion) throw errorCampo('permiso', 'Ese permiso no existe');
    // Solo una concesión con alcance lo necesita; denegar quita el permiso completo.
    const alcance = datos.tipo === 'conceder' && accion.usaAlcance ? (datos.alcance ?? 'propios') : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.usuarioPermiso.upsert({
        where: { usuarioId_accionId: { usuarioId: id, accionId: accion.id } },
        create: { usuarioId: id, accionId: accion.id, tipo: datos.tipo, alcance, motivo: datos.motivo, otorgadoPor: actor.usuarioId },
        update: { tipo: datos.tipo, alcance, motivo: datos.motivo, otorgadoPor: actor.usuarioId, fecha: new Date() },
      });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'excepcion_permiso', entidad: 'usuario', entidadId: id, despues: datos, ip: actor.ip }, tx);
    });
    this.avisarCambio(id);
    return this.detalle(id);
  }

  async quitarExcepcion(id: string, excepcionId: string, actor: ActorAdmin): Promise<UsuarioDetalle> {
    const e = await this.prisma.usuarioPermiso.findFirst({ where: { id: excepcionId, usuarioId: id } });
    if (!e) throw new NotFoundException('Excepción no encontrada');
    await this.prisma.$transaction(async (tx) => {
      await tx.usuarioPermiso.delete({ where: { id: excepcionId } });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'quitar_excepcion', entidad: 'usuario', entidadId: id, antes: e, ip: actor.ip }, tx);
    });
    this.avisarCambio(id);
    return this.detalle(id);
  }

  /** Genera una contraseña temporal, desbloquea la cuenta y cierra sus sesiones. */
  async restablecerClave(id: string, actor: ActorAdmin): Promise<ClaveTemporal> {
    await this.detalle(id);
    const claveTemporal = generarClaveTemporal();
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id },
        data: { passwordHash: await hashPassword(claveTemporal), debeCambiarClave: true, intentosFallidos: 0, bloqueadoHasta: null },
      });
      await tx.sesion.updateMany({ where: { usuarioId: id, revocadaEn: null }, data: { revocadaEn: new Date(), motivoRevocacion: 'logout' } });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'restablecer_clave', entidad: 'usuario', entidadId: id, ip: actor.ip }, tx);
    });
    if (id !== actor.usuarioId) this.gateway.emitirEvento(id, EVENTO_SESION_CERRADA);
    return { usuario: await this.detalle(id), claveTemporal };
  }

  async desbloquear(id: string, actor: ActorAdmin): Promise<UsuarioDetalle> {
    await this.detalle(id);
    await this.prisma.usuario.update({ where: { id }, data: { intentosFallidos: 0, bloqueadoHasta: null } });
    await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'desbloquear', entidad: 'usuario', entidadId: id, ip: actor.ip });
    return this.detalle(id);
  }

  /** Excepción al tope global de horas extra (ambos vacíos = usa el global). */
  async guardarTopes(id: string, topes: TopesUsuario, actor: ActorAdmin): Promise<UsuarioDetalle> {
    await this.detalle(id);
    if (topes.semanal === null && topes.mensual === null) await this.prisma.topeHorasExtraUsuario.deleteMany({ where: { usuarioId: id } });
    else {
      await this.prisma.topeHorasExtraUsuario.upsert({
        where: { usuarioId: id },
        create: { usuarioId: id, semanal: topes.semanal, mensual: topes.mensual },
        update: { semanal: topes.semanal, mensual: topes.mensual },
      });
    }
    await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'topes_horas_extra', entidad: 'usuario', entidadId: id, despues: topes, ip: actor.ip });
    return this.detalle(id);
  }

  /** Sus permisos pudieron cambiar: se recalculan y, si está conectado, su menú se actualiza al instante. */
  private avisarCambio(usuarioId: string) {
    this.permisos.invalidar(usuarioId);
    this.gateway.emitirEvento(usuarioId, EVENTO_SESION_ACTUALIZADA);
  }
}
