import { Controller, Get, Req } from '@nestjs/common';
import type { TableroSeguimiento } from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { SeguimientoService } from './seguimiento.service.js';

@Controller('seguimiento')
export class SeguimientoController {
  constructor(private readonly seguimiento: SeguimientoService) {}

  @RequierePermiso('seguimiento.ver')
  @Get('tablero')
  tablero(@Req() req: SolicitudAutenticada): Promise<TableroSeguimiento> {
    return this.seguimiento.tablero(req.usuario!.id, req.alcance ?? null);
  }
}
