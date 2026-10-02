import { Controller, Get, Req } from '@nestjs/common';
import type { PanelInicio } from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { InicioService } from './inicio.service.js';

/** Panel de inicio de quien entra: sin permiso propio, cada bloque se calcula solo con lo que sus permisos le dejan ver. */
@Controller('inicio')
export class InicioController {
  constructor(private readonly inicio: InicioService) {}

  @Get()
  panel(@Req() req: SolicitudAutenticada): Promise<PanelInicio> {
    return this.inicio.panel(req.usuario!.id);
  }
}
