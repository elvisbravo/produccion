import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import {
  anularCotizacionSchema,
  cotizacionSchema,
  listarCotizacionesSchema,
  type CotizacionDatos,
  type CotizacionListadoItem,
  type CotizacionResumen,
  type Paginado,
} from '@grupoes/shared';
import type { z } from 'zod';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { CotizacionesService } from './cotizaciones.service.js';

const actor = (req: SolicitudAutenticada) => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

@Controller()
export class CotizacionesController {
  constructor(private readonly cotizaciones: CotizacionesService) {}

  @RequierePermiso('cotizaciones.ver')
  @Get('cotizaciones')
  listar(@Query(new ZodValidationPipe(listarCotizacionesSchema)) filtros: z.output<typeof listarCotizacionesSchema>, @Req() req: SolicitudAutenticada): Promise<Paginado<CotizacionListadoItem>> {
    return this.cotizaciones.listar(filtros, req.usuario!.id);
  }

  @RequierePermiso('cotizaciones.ver')
  @Get('prospectos/:id/cotizaciones')
  deProspecto(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<CotizacionResumen[]> {
    return this.cotizaciones.deProspecto(id, req.usuario!.id);
  }

  @RequierePermiso('cotizaciones.crear')
  @Post('prospectos/:id/cotizaciones')
  crear(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(cotizacionSchema)) datos: CotizacionDatos, @Req() req: SolicitudAutenticada): Promise<CotizacionResumen> {
    return this.cotizaciones.crear(id, datos, actor(req));
  }

  @RequierePermiso('cotizaciones.anular')
  @Post('cotizaciones/:id/anular')
  anular(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(anularCotizacionSchema)) datos: { motivo: string }, @Req() req: SolicitudAutenticada): Promise<CotizacionResumen> {
    return this.cotizaciones.anular(id, datos.motivo, actor(req));
  }
}
