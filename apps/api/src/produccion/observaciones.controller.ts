import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import {
  confirmarObservacionSchema,
  consultaObservacionesSchema,
  consultaPlazoSchema,
  programarObservacionSchema,
  valorarObservacionSchema,
  type ConfirmarObservacionDatos,
  type ConsultaObservaciones,
  type ConsultaPlazo,
  type ObservacionDetalle,
  type ObservacionItem,
  type PlazoEvaluado,
  type ProgramarObservacionDatos,
  type ValorarObservacionDatos,
} from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { ObservacionesService } from './observaciones.service.js';

const actor = (req: SolicitudAutenticada) => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

/** Observaciones del cliente: valoración, confirmación del plazo y programación de la corrección. */
@Controller('observaciones')
export class ObservacionesController {
  constructor(private readonly observaciones: ObservacionesService) {}

  @RequierePermiso('observaciones.ver')
  @Get()
  listar(@Query(new ZodValidationPipe(consultaObservacionesSchema)) consulta: ConsultaObservaciones): Promise<ObservacionItem[]> {
    return this.observaciones.listar(consulta);
  }

  @RequierePermiso('observaciones.ver')
  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string): Promise<ObservacionDetalle> {
    return this.observaciones.detalle(id);
  }

  @RequierePermiso('observaciones.ver')
  @Get(':id/plazo')
  plazo(@Param('id', ParseUUIDPipe) id: string, @Query(new ZodValidationPipe(consultaPlazoSchema)) consulta: ConsultaPlazo): Promise<PlazoEvaluado> {
    return this.observaciones.plazo(id, consulta);
  }

  @RequierePermiso('observaciones.valorar')
  @Post(':id/tomar')
  @HttpCode(200)
  tomar(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<ObservacionDetalle> {
    return this.observaciones.tomar(id, actor(req));
  }

  @RequierePermiso('observaciones.valorar')
  @Post(':id/soltar')
  @HttpCode(200)
  soltar(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<ObservacionDetalle> {
    return this.observaciones.soltar(id, actor(req));
  }

  @RequierePermiso('observaciones.valorar')
  @Post(':id/valorar')
  @HttpCode(200)
  valorar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(valorarObservacionSchema)) datos: ValorarObservacionDatos, @Req() req: SolicitudAutenticada): Promise<ObservacionDetalle> {
    return this.observaciones.valorar(id, datos, actor(req));
  }

  @RequierePermiso('observaciones.confirmar')
  @Post(':id/confirmar')
  @HttpCode(200)
  confirmar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(confirmarObservacionSchema)) datos: ConfirmarObservacionDatos, @Req() req: SolicitudAutenticada): Promise<ObservacionDetalle> {
    return this.observaciones.confirmar(id, datos, actor(req));
  }

  @RequierePermiso('observaciones.programar')
  @Post(':id/programar')
  @HttpCode(200)
  programar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(programarObservacionSchema)) datos: ProgramarObservacionDatos, @Req() req: SolicitudAutenticada): Promise<ObservacionDetalle> {
    return this.observaciones.programar(id, datos, actor(req));
  }
}
