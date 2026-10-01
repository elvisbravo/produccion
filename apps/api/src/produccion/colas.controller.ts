import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { ordenColaSchema, type ColaPersona } from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { ProduccionService } from './produccion.service.js';

const actor = (req: SolicitudAutenticada) => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

@Controller('produccion/colas')
export class ColasController {
  constructor(private readonly produccion: ProduccionService) {}

  @RequierePermiso('programacion.ver')
  @Get()
  todas(): Promise<ColaPersona[]> {
    return this.produccion.colasDePersonal();
  }

  @RequierePermiso('tareas.ver')
  @Get('mia')
  async mia(@Req() req: SolicitudAutenticada): Promise<ColaPersona> {
    const [cola] = await this.produccion.colasDePersonal(req.usuario!.id);
    return cola;
  }

  @RequierePermiso('programacion.programar')
  @Put(':usuarioId/orden')
  @HttpCode(204)
  reordenar(
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Body(new ZodValidationPipe(ordenColaSchema)) { tareaIds }: { tareaIds: string[] },
    @Req() req: SolicitudAutenticada,
  ): Promise<void> {
    return this.produccion.reordenar(usuarioId, tareaIds, actor(req));
  }

  @RequierePermiso('programacion.programar')
  @Post(':usuarioId/orden-sugerido')
  @HttpCode(204)
  ordenSugerido(@Param('usuarioId', ParseUUIDPipe) usuarioId: string, @Req() req: SolicitudAutenticada): Promise<void> {
    return this.produccion.ordenSugerido(usuarioId, actor(req));
  }
}
