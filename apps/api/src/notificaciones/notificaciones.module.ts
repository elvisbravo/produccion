import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificacionesController } from './notificaciones.controller.js';
import { NotificacionesGateway } from './notificaciones.gateway.js';
import { NotificacionesService } from './notificaciones.service.js';

/** Global: cualquier módulo puede notificar sin importarlo. */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [NotificacionesController],
  providers: [NotificacionesService, NotificacionesGateway],
  exports: [NotificacionesService, NotificacionesGateway],
})
export class NotificacionesModule {}
