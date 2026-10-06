import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { proponerApoyoSchema, reasignarTareaSchema, type ApoyoTarea, type HoraExtraItem, type ProponerApoyoDatos, type ReasignarTareaDatos } from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { ApoyoService } from './apoyo.service.js';
import { ContingenciasService } from './contingencias.service.js';

const actor = (req: SolicitudAutenticada) => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

/** Cuando una tarea no llega: quién puede tomarla y con qué (horario normal, horas extra o bono). */
@Controller('produccion/tareas/:id')
export class ApoyoController {
  constructor(
    private readonly apoyo: ApoyoService,
    private readonly contingencias: ContingenciasService,
  ) {}

  @RequierePermiso('programacion.reasignar')
  @Get('apoyo')
  ver(@Param('id', ParseUUIDPipe) id: string): Promise<ApoyoTarea> {
    return this.apoyo.apoyo(id);
  }

  /** En horario normal: la tarea pasa de inmediato a esa persona. */
  @RequierePermiso('programacion.reasignar')
  @Post('reasignar')
  @HttpCode(204)
  async reasignar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(reasignarTareaSchema)) { usuarioId, motivo }: ReasignarTareaDatos, @Req() req: SolicitudAutenticada): Promise<void> {
    await this.contingencias.reasignarTarea(id, usuarioId, motivo, actor(req));
  }

  /** Con horas extra o bono: la persona acepta, se aprueba y entonces la tarea pasa a su cola. */
  @RequierePermiso('programacion.proponer_extra')
  @Post('apoyo')
  proponer(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(proponerApoyoSchema)) datos: ProponerApoyoDatos, @Req() req: SolicitudAutenticada): Promise<HoraExtraItem> {
    return this.apoyo.proponer(id, datos, actor(req));
  }
}
