import { Body, Controller, Delete, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { fijarFechasSchema, type TrabajoDetalle } from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { FechasFijasService } from './fechas-fijas.service.js';
import type { ActorTrabajo } from './trabajos.service.js';

const actor = (req: SolicitudAutenticada): ActorTrabajo => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

/** Fechas inamovibles de un trabajo: fijarlas (con su motivo) y liberarlas. */
@Controller('trabajos/:id/fechas-fijas')
export class FechasFijasController {
  constructor(private readonly fechas: FechasFijasService) {}

  @RequierePermiso('trabajos.fijar_fechas')
  @Post()
  @HttpCode(200)
  fijar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(fijarFechasSchema)) { motivo }: { motivo: string }, @Req() req: SolicitudAutenticada): Promise<TrabajoDetalle> {
    return this.fechas.fijar(id, motivo, actor(req));
  }

  @RequierePermiso('trabajos.fijar_fechas')
  @Delete()
  liberar(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<TrabajoDetalle> {
    return this.fechas.liberar(id, actor(req));
  }
}
