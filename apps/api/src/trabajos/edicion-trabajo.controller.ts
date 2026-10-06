import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { editarTrabajoSchema, reprogramarTrabajoSchema, type EditarTrabajoDatos, type ReprogramarTrabajoDatos, type TrabajoDetalle } from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { EdicionTrabajoService } from './edicion-trabajo.service.js';
import type { ActorTrabajo } from './trabajos.service.js';

const actor = (req: SolicitudAutenticada): ActorTrabajo => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

/** Reprogramar la entrega de un trabajo y editar sus datos. */
@Controller('trabajos/:id')
export class EdicionTrabajoController {
  constructor(private readonly edicion: EdicionTrabajoService) {}

  @RequierePermiso('trabajos.reprogramar')
  @Post('reprogramar')
  @HttpCode(200)
  reprogramar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(reprogramarTrabajoSchema)) datos: ReprogramarTrabajoDatos, @Req() req: SolicitudAutenticada): Promise<TrabajoDetalle> {
    return this.edicion.reprogramar(id, datos, actor(req));
  }

  @RequierePermiso('trabajos.editar')
  @Put('datos')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(editarTrabajoSchema)) datos: EditarTrabajoDatos, @Req() req: SolicitudAutenticada): Promise<TrabajoDetalle> {
    return this.edicion.editar(id, datos, actor(req));
  }
}
