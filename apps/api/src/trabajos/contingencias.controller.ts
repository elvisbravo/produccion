import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import {
  aplicarReasignacionSchema,
  ejecutarUrgenteSchema,
  ESTADOS_URGENTE,
  rechazarUrgenteSchema,
  simularRepartoSchema,
  solicitarUrgenteSchema,
  type AplicarReasignacionDatos,
  type EjecutarUrgenteDatos,
  type ImpactoReparto,
  type ImpactoUrgente,
  type PlanReasignacion,
  type PropuestaUrgente,
  type RepartoUrgente,
  type SolicitudUrgenteItem,
} from '@grupoes/shared';
import { z } from 'zod';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { ContingenciasService } from '../produccion/contingencias.service.js';
import { TrabajosService } from './trabajos.service.js';

const actor = (req: SolicitudAutenticada) => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });
const estadoSchema = z.object({ estado: z.enum(ESTADOS_URGENTE).optional() });
const impactoSchema = z.object({ usuarioId: z.uuid() });

/** Inserción urgente y reasignación por ausencia. */
@Controller()
export class ContingenciasController {
  constructor(
    private readonly contingencias: ContingenciasService,
    private readonly trabajos: TrabajosService,
  ) {}

  @RequierePermiso('programacion.ver')
  @Get('urgentes')
  urgentes(@Query(new ZodValidationPipe(estadoSchema)) { estado }: z.output<typeof estadoSchema>): Promise<SolicitudUrgenteItem[]> {
    return this.contingencias.urgentes(estado);
  }

  @RequierePermiso('trabajos.ver')
  @Get('trabajos/:id/urgentes')
  async deTrabajo(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<SolicitudUrgenteItem[]> {
    await this.trabajos.verificarVisible(id, req.usuario!.id);
    return this.contingencias.urgentes(undefined, id);
  }

  @RequierePermiso('programacion.solicitar_urgente')
  @Post('trabajos/:id/urgente')
  async solicitar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(solicitarUrgenteSchema)) { motivo }: { motivo: string },
    @Req() req: SolicitudAutenticada,
  ): Promise<SolicitudUrgenteItem> {
    await this.trabajos.verificarVisible(id, req.usuario!.id);
    return this.contingencias.solicitarUrgente(id, motivo, actor(req));
  }

  @RequierePermiso('programacion.insertar_urgente')
  @Get('urgentes/:id/impacto')
  impacto(@Param('id', ParseUUIDPipe) id: string, @Query(new ZodValidationPipe(impactoSchema)) { usuarioId }: { usuarioId: string }): Promise<ImpactoUrgente> {
    return this.contingencias.simularUrgente(id, usuarioId);
  }

  /** Los entregables de la urgencia, quién puede tomar cada uno y el reparto que sugiere el sistema. */
  @RequierePermiso('programacion.insertar_urgente')
  @Get('urgentes/:id/propuesta')
  propuesta(@Param('id', ParseUUIDPipe) id: string): Promise<PropuestaUrgente> {
    return this.contingencias.propuestaUrgente(id);
  }

  /** Cómo queda la cola de cada persona con un reparto (es una consulta: no cambia nada). */
  @RequierePermiso('programacion.insertar_urgente')
  @Post('urgentes/:id/simular')
  @HttpCode(200)
  simular(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(simularRepartoSchema)) { reparto }: { reparto: RepartoUrgente }): Promise<ImpactoReparto> {
    return this.contingencias.simularReparto(id, reparto);
  }

  @RequierePermiso('programacion.insertar_urgente')
  @Post('urgentes/:id/ejecutar')
  ejecutar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ejecutarUrgenteSchema)) datos: EjecutarUrgenteDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<SolicitudUrgenteItem> {
    return this.contingencias.ejecutarUrgente(id, datos, actor(req));
  }

  @RequierePermiso('programacion.insertar_urgente')
  @Post('urgentes/:id/rechazar')
  rechazar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rechazarUrgenteSchema)) { observacion }: { observacion: string },
    @Req() req: SolicitudAutenticada,
  ): Promise<SolicitudUrgenteItem> {
    return this.contingencias.rechazarUrgente(id, observacion, actor(req));
  }

  @RequierePermiso('programacion.reasignar')
  @Get('ausencias/:id/reasignacion')
  plan(@Param('id', ParseUUIDPipe) id: string): Promise<PlanReasignacion> {
    return this.contingencias.planReasignacion(id);
  }

  @RequierePermiso('programacion.reasignar')
  @Post('ausencias/:id/reasignacion')
  async aplicar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(aplicarReasignacionSchema)) datos: AplicarReasignacionDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<{ reasignadas: number }> {
    return { reasignadas: await this.contingencias.aplicarReasignacion(id, datos, actor(req)) };
  }
}
