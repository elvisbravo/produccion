import { Body, Controller, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { adicionalSchema, motivoAdicionalSchema, type AdicionalDatos, type TrabajoDetalle } from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { AdicionalesService } from './adicionales.service.js';
import type { ActorTrabajo } from './trabajos.service.js';

const actor = (req: SolicitudAutenticada): ActorTrabajo => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

/** Adicionales del contrato; cada acción devuelve el trabajo actualizado. */
@Controller()
export class AdicionalesController {
  constructor(private readonly adicionales: AdicionalesService) {}

  @RequierePermiso('contratos.editar')
  @Post('contratos/:id/adicionales')
  proponer(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(adicionalSchema)) datos: AdicionalDatos, @Req() req: SolicitudAutenticada): Promise<TrabajoDetalle> {
    return this.adicionales.proponer(id, datos, actor(req));
  }

  @RequierePermiso('contratos.editar')
  @Post('adicionales/:id/aceptar')
  aceptar(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<TrabajoDetalle> {
    return this.adicionales.aceptar(id, actor(req));
  }

  @RequierePermiso('contratos.editar')
  @Post('adicionales/:id/rechazar')
  rechazar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(motivoAdicionalSchema)) datos: { motivo: string }, @Req() req: SolicitudAutenticada): Promise<TrabajoDetalle> {
    return this.adicionales.rechazar(id, datos.motivo, actor(req));
  }

  @RequierePermiso('contratos.anular')
  @Post('adicionales/:id/anular')
  anular(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(motivoAdicionalSchema)) datos: { motivo: string }, @Req() req: SolicitudAutenticada): Promise<TrabajoDetalle> {
    return this.adicionales.anular(id, datos.motivo, actor(req));
  }
}
