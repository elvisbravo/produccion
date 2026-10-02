import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { pausarTrabajoSchema, reanudarTrabajoSchema, type TrabajoDetalle } from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { PausasService } from './pausas.service.js';
import type { ActorTrabajo } from './trabajos.service.js';

const actor = (req: SolicitudAutenticada): ActorTrabajo => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

/** Trabajo en espera del cliente: pausar (indicando qué falta) y reanudar. */
@Controller('trabajos/:id')
export class PausasController {
  constructor(private readonly pausas: PausasService) {}

  @RequierePermiso('trabajos.pausar')
  @Post('pausar')
  @HttpCode(200)
  pausar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(pausarTrabajoSchema)) { motivo }: { motivo: string }, @Req() req: SolicitudAutenticada): Promise<TrabajoDetalle> {
    return this.pausas.pausar(id, motivo, actor(req));
  }

  @RequierePermiso('trabajos.pausar')
  @Post('reanudar')
  @HttpCode(200)
  reanudar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(reanudarTrabajoSchema)) { nota }: { nota?: string }, @Req() req: SolicitudAutenticada): Promise<TrabajoDetalle> {
    return this.pausas.reanudar(id, nota, actor(req));
  }
}
