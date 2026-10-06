import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Put, Query, Req } from '@nestjs/common';
import { consultaEntregasSchema, notaEntregaSchema, type ConsultaEntregas, type NotaEntregaDatos, type TableroEntregas } from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { EntregasService } from './entregas.service.js';

/** Tablero de entregas por día (la hoja de control del equipo). */
@Controller()
export class EntregasController {
  constructor(private readonly entregas: EntregasService) {}

  @RequierePermiso('entregas.ver')
  @Get('entregas')
  tablero(@Query(new ZodValidationPipe(consultaEntregasSchema)) consulta: ConsultaEntregas, @Req() req: SolicitudAutenticada): Promise<TableroEntregas> {
    return this.entregas.tablero(consulta, req.usuario!.id);
  }

  @RequierePermiso('trabajos.editar')
  @Put('trabajos/:id/nota-entrega')
  @HttpCode(204)
  nota(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(notaEntregaSchema)) datos: NotaEntregaDatos, @Req() req: SolicitudAutenticada): Promise<void> {
    return this.entregas.guardarNota(id, datos, { usuarioId: req.usuario!.id, ip: req.ip ?? null });
  }
}
