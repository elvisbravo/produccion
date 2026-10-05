import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { listarProveedoresSchema, proveedorSchema, type ListarProveedoresConsulta, type Paginado, type ProveedorDatos, type ProveedorItem } from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { ProveedoresService } from './proveedores.service.js';

const actor = (req: SolicitudAutenticada) => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

@Controller('proveedores')
export class ProveedoresController {
  constructor(private readonly proveedores: ProveedoresService) {}

  @RequierePermiso('proveedores.ver')
  @Get()
  listar(@Query(new ZodValidationPipe(listarProveedoresSchema)) q: ListarProveedoresConsulta): Promise<Paginado<ProveedorItem>> {
    return this.proveedores.listar(q);
  }

  @RequierePermiso('proveedores.ver')
  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string): Promise<ProveedorItem> {
    return this.proveedores.obtener(id);
  }

  @RequierePermiso('proveedores.crear')
  @Post()
  crear(@Body(new ZodValidationPipe(proveedorSchema)) datos: ProveedorDatos, @Req() req: SolicitudAutenticada): Promise<ProveedorItem> {
    return this.proveedores.crear(datos, actor(req));
  }

  @RequierePermiso('proveedores.editar')
  @Put(':id')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(proveedorSchema)) datos: ProveedorDatos, @Req() req: SolicitudAutenticada): Promise<ProveedorItem> {
    return this.proveedores.editar(id, datos, actor(req));
  }

  @RequierePermiso('proveedores.desactivar')
  @Post(':id/desactivar')
  @HttpCode(200)
  desactivar(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<ProveedorItem> {
    return this.proveedores.cambiarActivo(id, false, actor(req));
  }

  @RequierePermiso('proveedores.desactivar')
  @Post(':id/activar')
  @HttpCode(200)
  activar(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<ProveedorItem> {
    return this.proveedores.cambiarActivo(id, true, actor(req));
  }
}
