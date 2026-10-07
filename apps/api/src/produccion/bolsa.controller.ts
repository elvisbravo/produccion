import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { canjearHorasSchema, type CanjearHorasDatos, type ResumenBolsa } from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { BolsaService } from './bolsa.service.js';

const actor = (req: SolicitudAutenticada) => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

/** Bolsa de horas extra acumuladas y su canje por días libres o dinero. */
@Controller('horas-extra/bolsa')
export class BolsaController {
  constructor(private readonly bolsa: BolsaService) {}

  @RequierePermiso('horas_extra.ver')
  @Get()
  resumen(@Req() req: SolicitudAutenticada): Promise<ResumenBolsa> {
    return this.bolsa.resumen(actor(req));
  }

  @RequierePermiso('horas_extra.aprobar')
  @Post('canjes/:id/anular')
  @HttpCode(204)
  anular(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<void> {
    return this.bolsa.anularCanje(id, actor(req));
  }

  @RequierePermiso('horas_extra.aprobar')
  @Post(':usuarioId/canjear')
  @HttpCode(204)
  canjear(@Param('usuarioId', ParseUUIDPipe) usuarioId: string, @Body(new ZodValidationPipe(canjearHorasSchema)) datos: CanjearHorasDatos, @Req() req: SolicitudAutenticada): Promise<void> {
    return this.bolsa.canjear(usuarioId, datos, actor(req));
  }
}
