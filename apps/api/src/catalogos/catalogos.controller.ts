import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { actividadSchema, nuevoCatalogoSchema, type ActividadAdmin, type ActividadDatos, type CatalogoActividades, type CatalogosProspecto, type Opcion } from '@grupoes/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { UsuarioActual } from '../auth/decoradores.js';
import type { UsuarioToken } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { ActividadesService } from './actividades.service.js';
import { CatalogosService } from './catalogos.service.js';

const busquedaSchema = z.object({
  q: z.string().trim().max(100).optional(),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});

@Controller('catalogos')
export class CatalogosController {
  constructor(
    private readonly catalogos: CatalogosService,
    private readonly actividades: ActividadesService,
  ) {}

  /** Todas las listas cortas que usa el formulario del prospecto. */
  @RequierePermiso('prospectos.ver')
  @Get('prospecto')
  prospecto(): Promise<CatalogosProspecto> {
    return this.catalogos.paraProspecto();
  }

  @RequierePermiso('prospectos.ver')
  @Get('universidades')
  universidades(@Query(new ZodValidationPipe(busquedaSchema)) { q, limite }: z.output<typeof busquedaSchema>): Promise<Opcion[]> {
    return this.catalogos.buscar('universidad', q, limite);
  }

  @RequierePermiso('prospectos.crear')
  @Post('universidades')
  crearUniversidad(@Body(new ZodValidationPipe(nuevoCatalogoSchema)) { nombre }: { nombre: string }, @UsuarioActual() u: UsuarioToken) {
    return this.catalogos.crearSiNoExiste('universidad', nombre, u.id);
  }

  @RequierePermiso('prospectos.ver')
  @Get('carreras')
  carreras(@Query(new ZodValidationPipe(busquedaSchema)) { q, limite }: z.output<typeof busquedaSchema>): Promise<Opcion[]> {
    return this.catalogos.buscar('carrera', q, limite);
  }

  @RequierePermiso('prospectos.crear')
  @Post('carreras')
  crearCarrera(@Body(new ZodValidationPipe(nuevoCatalogoSchema)) { nombre }: { nombre: string }, @UsuarioActual() u: UsuarioToken) {
    return this.catalogos.crearSiNoExiste('carrera', nombre, u.id);
  }

  // ─── Catálogo de actividades (tiempo estimado, roles y prioridades) ───

  @RequierePermiso('catalogos.ver')
  @Get('actividades')
  listarActividades(): Promise<CatalogoActividades> {
    return this.actividades.listar();
  }

  @RequierePermiso('catalogos.crear')
  @Post('actividades')
  crearActividad(@Body(new ZodValidationPipe(actividadSchema)) datos: ActividadDatos, @UsuarioActual() u: UsuarioToken, @Req() req: Request): Promise<ActividadAdmin> {
    return this.actividades.crear(datos, { usuarioId: u.id, ip: req.ip ?? null });
  }

  @RequierePermiso('catalogos.editar')
  @Put('actividades/:id')
  editarActividad(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(actividadSchema)) datos: ActividadDatos, @UsuarioActual() u: UsuarioToken, @Req() req: Request): Promise<ActividadAdmin> {
    return this.actividades.editar(id, datos, { usuarioId: u.id, ip: req.ip ?? null });
  }

  @RequierePermiso('catalogos.desactivar')
  @Post('actividades/:id/desactivar')
  desactivarActividad(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() u: UsuarioToken, @Req() req: Request): Promise<ActividadAdmin> {
    return this.actividades.cambiarActiva(id, false, { usuarioId: u.id, ip: req.ip ?? null });
  }

  @RequierePermiso('catalogos.desactivar')
  @Post('actividades/:id/activar')
  activarActividad(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() u: UsuarioToken, @Req() req: Request): Promise<ActividadAdmin> {
    return this.actividades.cambiarActiva(id, true, { usuarioId: u.id, ip: req.ip ?? null });
  }
}
