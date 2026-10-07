import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module.js';
import { ApoyoController } from './apoyo.controller.js';
import { CargaController } from './carga.controller.js';
import { ApoyoService } from './apoyo.service.js';
import { BolsaController } from './bolsa.controller.js';
import { BolsaService } from './bolsa.service.js';
import { ColasController } from './colas.controller.js';
import { ContingenciasService } from './contingencias.service.js';
import { ExtrasController } from './extras.controller.js';
import { ExtrasService } from './extras.service.js';
import { ProduccionService } from './produccion.service.js';

/** Colas de trabajo y lógica de entregables. Los endpoints de entregables viven en TrabajosModule (necesitan la visibilidad del trabajo). */
@Module({
  imports: [AgendaModule],
  controllers: [ColasController, ExtrasController, ApoyoController, CargaController, BolsaController],
  providers: [ProduccionService, ContingenciasService, ExtrasService, ApoyoService, BolsaService],
  exports: [ProduccionService, ContingenciasService, ExtrasService],
})
export class ProduccionModule {}
