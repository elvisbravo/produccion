import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module.js';
import { ColasController } from './colas.controller.js';
import { ProduccionService } from './produccion.service.js';

/** Colas de trabajo y lógica de entregables. Los endpoints de entregables viven en TrabajosModule (necesitan la visibilidad del trabajo). */
@Module({
  imports: [AgendaModule],
  controllers: [ColasController],
  providers: [ProduccionService],
  exports: [ProduccionService],
})
export class ProduccionModule {}
