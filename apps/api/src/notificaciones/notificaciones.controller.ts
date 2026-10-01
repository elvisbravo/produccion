import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { BandejaNotificaciones } from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { NotificacionesService } from './notificaciones.service.js';

/** La campanita: cada usuario ve y marca solo las suyas (no requiere un permiso especial). */
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  @Get()
  bandeja(@Req() req: SolicitudAutenticada): Promise<BandejaNotificaciones> {
    return this.notificaciones.bandeja(req.usuario!.id);
  }

  @Post('leer-todas')
  @HttpCode(204)
  leerTodas(@Req() req: SolicitudAutenticada): Promise<void> {
    return this.notificaciones.marcarTodas(req.usuario!.id);
  }

  @Post(':id/leer')
  @HttpCode(204)
  leer(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<void> {
    return this.notificaciones.marcarLeida(id, req.usuario!.id);
  }
}
