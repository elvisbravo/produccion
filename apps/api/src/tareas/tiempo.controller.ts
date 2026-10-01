import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { reporteTiemposSchema, tiempoManualSchema, type ReporteTiempos, type TiempoActivo, type TiempoManualDatos, type TiemposDeTarea } from '@grupoes/shared';
import type { z } from 'zod';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { TiempoService } from './tiempo.service.js';

const actor = (req: SolicitudAutenticada) => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

/** Cronómetro por tarea, registro manual y reporte de estimado frente a real. */
@Controller()
export class TiempoController {
  constructor(private readonly tiempo: TiempoService) {}

  @RequierePermiso('tareas.ver')
  @Get('tiempo/activo')
  async activo(@Req() req: SolicitudAutenticada): Promise<{ activo: TiempoActivo | null }> {
    // Envuelto: un null suelto llegaría como cuerpo vacío.
    return { activo: await this.tiempo.activo(req.usuario!.id) };
  }

  @RequierePermiso('tareas.editar')
  @Post('tareas/:id/cronometro/iniciar')
  iniciar(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<TiempoActivo> {
    return this.tiempo.iniciar(id, actor(req));
  }

  @RequierePermiso('tareas.editar')
  @Post('tareas/:id/cronometro/pausar')
  @HttpCode(204)
  pausar(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<void> {
    return this.tiempo.pausar(id, actor(req));
  }

  @RequierePermiso('tareas.ver')
  @Get('tareas/:id/tiempo')
  deTarea(@Param('id', ParseUUIDPipe) id: string): Promise<TiemposDeTarea> {
    return this.tiempo.deTarea(id);
  }

  @RequierePermiso('tareas.tiempo_manual')
  @Post('tareas/:id/tiempo')
  manual(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(tiempoManualSchema)) datos: TiempoManualDatos, @Req() req: SolicitudAutenticada): Promise<TiemposDeTarea> {
    return this.tiempo.manual(id, datos, actor(req));
  }

  @RequierePermiso('tareas.editar')
  @Delete('tareas/:id/tiempo/:registroId')
  eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('registroId', ParseUUIDPipe) registroId: string,
    @Req() req: SolicitudAutenticada,
  ): Promise<TiemposDeTarea> {
    return this.tiempo.eliminar(id, registroId, actor(req));
  }

  @RequierePermiso('reportes.ver')
  @Get('reportes/tiempos')
  reporte(@Query(new ZodValidationPipe(reporteTiemposSchema)) f: z.output<typeof reporteTiemposSchema>): Promise<ReporteTiempos> {
    return this.tiempo.reporte(f.desde, f.hasta);
  }
}
