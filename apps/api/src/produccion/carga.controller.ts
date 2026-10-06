import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { repartoCargaSchema, type CargaPersona, type ImpactoCarga, type RepartoCargaDatos } from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { ContingenciasService } from './contingencias.service.js';

const actor = (req: SolicitudAutenticada) => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

/** Cuando un auxiliar pasa a otras actividades: repartir lo que tiene en cola entre otras personas, por trabajo. */
@Controller('produccion/carga/:usuarioId')
export class CargaController {
  constructor(private readonly contingencias: ContingenciasService) {}

  @RequierePermiso('programacion.reasignar')
  @Get()
  ver(@Param('usuarioId', ParseUUIDPipe) usuarioId: string): Promise<CargaPersona> {
    return this.contingencias.cargaDe(usuarioId);
  }

  @RequierePermiso('programacion.reasignar')
  @Post('simular')
  simular(@Param('usuarioId', ParseUUIDPipe) usuarioId: string, @Body(new ZodValidationPipe(repartoCargaSchema)) { reparto }: RepartoCargaDatos): Promise<ImpactoCarga> {
    return this.contingencias.simularCarga(usuarioId, reparto);
  }

  @RequierePermiso('programacion.reasignar')
  @Post('aplicar')
  async aplicar(@Param('usuarioId', ParseUUIDPipe) usuarioId: string, @Body(new ZodValidationPipe(repartoCargaSchema)) datos: RepartoCargaDatos, @Req() req: SolicitudAutenticada): Promise<{ tareas: number }> {
    return { tareas: await this.contingencias.aplicarCarga(usuarioId, datos, actor(req)) };
  }
}
