import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import {
  crearUsuarioSchema,
  editarUsuarioSchema,
  excepcionPermisoSchema,
  guardarParametrosSchema,
  listarAuditoriaSchema,
  listarUsuariosSchema,
  matrizRolSchema,
  rolesUsuarioSchema,
  rolSchema,
  topesUsuarioSchema,
  type AuditoriaItem,
  type ClaveTemporal,
  type CrearUsuarioDatos,
  type EditarUsuarioDatos,
  type ExcepcionPermisoDatos,
  type MatrizRolDatos,
  type ModuloPermisos,
  type Paginado,
  type ParametroItem,
  type RolDatos,
  type RolDetalle,
  type RolItem,
  type TopesUsuario,
  type PendientesUsuario,
  type UsuarioDetalle,
  type UsuarioListadoItem,
} from '@grupoes/shared';
import type { z } from 'zod';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ParametrosService } from '../parametros/parametros.service.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ModulosService } from './modulos.service.js';
import { RolesService } from './roles.service.js';
import { UsuariosService } from './usuarios.service.js';

const actor = (req: SolicitudAutenticada) => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });
const POR_PAGINA = 50;

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @RequierePermiso('usuarios.ver')
  @Get()
  listar(@Query(new ZodValidationPipe(listarUsuariosSchema)) f: z.output<typeof listarUsuariosSchema>, @Req() req: SolicitudAutenticada): Promise<UsuarioListadoItem[]> {
    return this.usuarios.listar(f, req.usuario!.id);
  }

  @RequierePermiso('usuarios.ver')
  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<UsuarioDetalle> {
    return this.usuarios.verDetalle(id, req.usuario!.id);
  }

  @RequierePermiso('usuarios.crear')
  @Post()
  crear(@Body(new ZodValidationPipe(crearUsuarioSchema)) datos: CrearUsuarioDatos, @Req() req: SolicitudAutenticada): Promise<ClaveTemporal> {
    return this.usuarios.crear(datos, actor(req));
  }

  @RequierePermiso('usuarios.editar')
  @Put(':id')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(editarUsuarioSchema)) datos: EditarUsuarioDatos, @Req() req: SolicitudAutenticada) {
    return this.usuarios.editar(id, datos, actor(req));
  }

  /** Lo que la persona deja a su nombre, para avisar antes de desactivarla. */
  @RequierePermiso('usuarios.desactivar')
  @Get(':id/pendientes')
  pendientes(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<PendientesUsuario> {
    return this.usuarios.pendientes(id, req.usuario!.id);
  }

  @RequierePermiso('usuarios.desactivar')
  @Post(':id/desactivar')
  desactivar(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<UsuarioDetalle> {
    return this.usuarios.cambiarActivo(id, false, actor(req));
  }

  @RequierePermiso('usuarios.desactivar')
  @Post(':id/activar')
  activar(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<UsuarioDetalle> {
    return this.usuarios.cambiarActivo(id, true, actor(req));
  }

  @RequierePermiso('usuarios.asignar_roles')
  @Put(':id/roles')
  roles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rolesUsuarioSchema)) { rolIds }: { rolIds: string[] },
    @Req() req: SolicitudAutenticada,
  ): Promise<UsuarioDetalle> {
    return this.usuarios.asignarRoles(id, rolIds, actor(req));
  }

  @RequierePermiso('usuarios.asignar_permisos')
  @Post(':id/excepciones')
  excepcion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(excepcionPermisoSchema)) datos: ExcepcionPermisoDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<UsuarioDetalle> {
    return this.usuarios.guardarExcepcion(id, datos, actor(req));
  }

  @RequierePermiso('usuarios.asignar_permisos')
  @Delete(':id/excepciones/:excepcionId')
  quitarExcepcion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('excepcionId', ParseUUIDPipe) excepcionId: string,
    @Req() req: SolicitudAutenticada,
  ): Promise<UsuarioDetalle> {
    return this.usuarios.quitarExcepcion(id, excepcionId, actor(req));
  }

  @RequierePermiso('usuarios.restablecer_clave')
  @Post(':id/restablecer-clave')
  restablecer(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<ClaveTemporal> {
    return this.usuarios.restablecerClave(id, actor(req));
  }

  @RequierePermiso('usuarios.editar')
  @Post(':id/desbloquear')
  desbloquear(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<UsuarioDetalle> {
    return this.usuarios.desbloquear(id, actor(req));
  }

  @RequierePermiso('usuarios.editar')
  @Put(':id/topes-horas-extra')
  topes(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(topesUsuarioSchema)) datos: TopesUsuario, @Req() req: SolicitudAutenticada) {
    return this.usuarios.guardarTopes(id, datos, actor(req));
  }
}

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** Para elegir roles al crear usuarios basta con poder crearlos o asignar roles; la gestión exige roles.ver. */
  @RequierePermiso('roles.ver')
  @Get()
  listar(@Req() req: SolicitudAutenticada): Promise<RolItem[]> {
    return this.roles.listar(actor(req).usuarioId);
  }

  @RequierePermiso('roles.ver')
  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<RolDetalle> {
    return this.roles.detalle(id, actor(req).usuarioId);
  }

  @RequierePermiso('roles.crear')
  @Post()
  crear(@Body(new ZodValidationPipe(rolSchema)) datos: RolDatos, @Req() req: SolicitudAutenticada): Promise<RolDetalle> {
    return this.roles.crear(datos, actor(req));
  }

  @RequierePermiso('roles.editar')
  @Put(':id')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(rolSchema)) datos: RolDatos, @Req() req: SolicitudAutenticada): Promise<RolDetalle> {
    return this.roles.editar(id, datos, actor(req));
  }

  @RequierePermiso('roles.editar')
  @Put(':id/permisos')
  matriz(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(matrizRolSchema)) datos: MatrizRolDatos, @Req() req: SolicitudAutenticada): Promise<RolDetalle> {
    return this.roles.guardarMatriz(id, datos, actor(req));
  }

  @RequierePermiso('roles.eliminar')
  @Delete(':id')
  @HttpCode(204)
  eliminar(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<void> {
    return this.roles.eliminar(id, actor(req));
  }
}

@Controller('parametros')
export class ParametrosController {
  constructor(private readonly parametros: ParametrosService) {}

  @RequierePermiso('parametros.ver')
  @Get()
  listar(): Promise<ParametroItem[]> {
    return this.parametros.todos();
  }

  @RequierePermiso('parametros.editar')
  @Put()
  guardar(@Body(new ZodValidationPipe(guardarParametrosSchema)) { valores }: { valores: Record<string, number | null> }, @Req() req: SolicitudAutenticada): Promise<ParametroItem[]> {
    return this.parametros.guardar(valores, actor(req));
  }
}

@Controller('auditoria')
export class AuditoriaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
  ) {}

  @RequierePermiso('auditoria.ver')
  @Get()
  async listar(
    @Query(new ZodValidationPipe(listarAuditoriaSchema)) f: z.output<typeof listarAuditoriaSchema>,
    @Req() req: SolicitudAutenticada,
  ): Promise<Paginado<AuditoriaItem> & { entidades: string[] }> {
    // Sin el permiso de gestionar administradores no se ven los cambios hechos a sus cuentas.
    const admins = (await this.permisos.veAdministradores(req.usuario!.id)) ? [] : await this.permisos.idsAdministradores();
    const where = {
      ...(admins.length > 0 && { NOT: { entidad: 'usuario', entidadId: { in: admins } } }),
      entidad: f.entidad,
      usuarioId: f.usuarioId,
      fecha: {
        ...(f.desde && { gte: new Date(`${f.desde}T00:00:00-05:00`) }),
        ...(f.hasta && { lt: new Date(new Date(`${f.hasta}T00:00:00-05:00`).getTime() + 86_400_000) }),
      },
    };
    const [filas, total, entidades] = await Promise.all([
      this.prisma.auditoria.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip: (f.pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        include: { usuario: { select: { id: true, nombres: true, apellidos: true } } },
      }),
      this.prisma.auditoria.count({ where }),
      this.prisma.auditoria.findMany({ distinct: ['entidad'], select: { entidad: true }, orderBy: { entidad: 'asc' } }),
    ]);
    return {
      datos: filas.map((a) => ({
        id: a.id,
        fecha: a.fecha.toISOString(),
        usuario: a.usuario,
        accion: a.accion,
        entidad: a.entidad,
        entidadId: a.entidadId,
        antes: a.antes,
        despues: a.despues,
        ip: a.ip,
      })),
      total,
      pagina: f.pagina,
      porPagina: POR_PAGINA,
      entidades: entidades.map((e) => e.entidad),
    };
  }
}

/** Módulos del sistema y quién tiene cada acción (solo consulta). */
@Controller('modulos')
export class ModulosController {
  constructor(private readonly modulos: ModulosService) {}

  @RequierePermiso('modulos.ver')
  @Get()
  listar(): Promise<ModuloPermisos[]> {
    return this.modulos.listar();
  }
}
