import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { valorarTrabajoSchema, type TrabajoDetalle, type ValorarTrabajoDatos } from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import type { ActorTrabajo } from './trabajos.service.js';
import { ValoracionesService } from './valoraciones.service.js';

const actor = (req: SolicitudAutenticada): ActorTrabajo => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

/** Valoración de un trabajo en una reunión: cuántos días hábiles se estima que tardará. */
@Controller('trabajos/:id/valoracion')
export class ValoracionesController {
  constructor(private readonly valoraciones: ValoracionesService) {}

  @RequierePermiso('trabajos.valorar')
  @Post()
  @HttpCode(200)
  valorar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(valorarTrabajoSchema)) datos: ValorarTrabajoDatos, @Req() req: SolicitudAutenticada): Promise<TrabajoDetalle> {
    return this.valoraciones.valorar(id, datos, actor(req));
  }
}
