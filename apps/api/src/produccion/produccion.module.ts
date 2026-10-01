import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module.js';
import { ColasController } from './colas.controller.js';
import { ContingenciasService } from './contingencias.service.js';
import { ExtrasController } from './extras.controller.js';
import { ExtrasService } from './extras.service.js';
import { ProduccionService } from './produccion.service.js';

/** Colas de trabajo y lógica de entregables. Los endpoints de entregables viven en TrabajosModule (necesitan la visibilidad del trabajo). */
@Module({
  imports: [AgendaModule],
  controllers: [ColasController, ExtrasController],
  providers: [ProduccionService, ContingenciasService, ExtrasService],
  exports: [ProduccionService, ContingenciasService],
})
export class ProduccionModule {}
