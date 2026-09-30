import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import {
  asignarTareaSchema,
  cancelarTareaSchema,
  completarTareaSchema,
  programarTareaSchema,
  reprogramarTareaSchema,
  type ActividadCatalogo,
  type AsignarTareaDatos,
  type CandidatosTarea,
  type CompletarTareaDatos,
  type ProgramarTareaDatos,
  type ReprogramarTareaDatos,
  type ResultadoCompletar,
  type TareaItem,
} from '@grupoes/shared';
import { z } from 'zod';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { TareasService, type ActorTarea } from './tareas.service.js';

const actor = (req: SolicitudAutenticada): ActorTarea => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

@Controller()
export class TareasController {
  constructor(private readonly tareas: TareasService) {}

  @RequierePermiso('tareas.ver')
  @Get('actividades')
  actividades(
    @Query(new ZodValidationPipe(z.object({ aplicaA: z.enum(['prospecto', 'cliente']).optional() }))) { aplicaA }: { aplicaA?: 'prospecto' | 'cliente' },
  ): Promise<ActividadCatalogo[]> {
    return this.tareas.actividades(aplicaA);
  }

  @RequierePermiso('tareas.crear')
  @Post('prospectos/:id/tareas')
  async programar(
    @Param('id', ParseUUIDPipe) prospectoId: string,
    @Body(new ZodValidationPipe(programarTareaSchema)) datos: ProgramarTareaDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<TareaItem> {
    await this.tareas.verificarProspecto(prospectoId, req.usuario!.id);
    const id = await this.tareas.programarParaProspecto(prospectoId, datos, actor(req));
    return this.tareas.detalle(id, req.usuario!.id);
  }

  @RequierePermiso('tareas.ver')
  @Get('tareas/mias')
  mias(@Req() req: SolicitudAutenticada): Promise<TareaItem[]> {
    return this.tareas.mias(req.usuario!.id);
  }

  @RequierePermiso('tareas.asignar')
  @Get('tareas/por-asignar')
  porAsignar(@Req() req: SolicitudAutenticada): Promise<TareaItem[]> {
    return this.tareas.porAsignar(req.usuario!.id);
  }

  @RequierePermiso('tareas.ver')
  @Get('tareas/:id')
  detalle(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<TareaItem> {
    return this.tareas.detalle(id, req.usuario!.id);
  }

  @RequierePermiso('tareas.asignar')
  @Get('tareas/:id/candidatos')
  candidatos(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<CandidatosTarea> {
    return this.tareas.candidatos(id, req.usuario!.id);
  }

  @RequierePermiso('tareas.asignar')
  @Post('tareas/:id/asignar')
  asignar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(asignarTareaSchema)) datos: AsignarTareaDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<TareaItem> {
    return this.tareas.asignar(id, datos, actor(req));
  }

  @RequierePermiso('tareas.editar')
  @Post('tareas/:id/completar')
  completar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(completarTareaSchema)) datos: CompletarTareaDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<ResultadoCompletar> {
    return this.tareas.completar(id, datos, actor(req));
  }

  @RequierePermiso('tareas.reprogramar')
  @Post('tareas/:id/reprogramar')
  reprogramar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reprogramarTareaSchema)) datos: ReprogramarTareaDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<TareaItem> {
    return this.tareas.reprogramar(id, datos, actor(req));
  }

  @RequierePermiso('tareas.editar')
  @Post('tareas/:id/cancelar')
  cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelarTareaSchema)) { motivo }: { motivo: string },
    @Req() req: SolicitudAutenticada,
  ): Promise<TareaItem> {
    return this.tareas.cancelar(id, motivo, actor(req));
  }
}
