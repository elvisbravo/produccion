import { Module } from '@nestjs/common';
import { ProduccionModule } from '../produccion/produccion.module.js';
import { RecordatoriosService } from './recordatorios.service.js';

/** Avisos automáticos (cron). Aparte de NotificacionesModule para no depender de producción en un módulo global. */
@Module({
  imports: [ProduccionModule],
  providers: [RecordatoriosService],
  exports: [RecordatoriosService],
})
export class RecordatoriosModule {}
