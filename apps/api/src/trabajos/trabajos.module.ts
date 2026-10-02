import { Module } from '@nestjs/common';
import { PersonasModule } from '../personas/personas.module.js';
import { ProduccionModule } from '../produccion/produccion.module.js';
import { AdicionalesController } from './adicionales.controller.js';
import { AdicionalesService } from './adicionales.service.js';
import { ContingenciasController } from './contingencias.controller.js';
import { EntregablesController } from './entregables.controller.js';
import { FechasFijasController } from './fechas-fijas.controller.js';
import { FechasFijasService } from './fechas-fijas.service.js';
import { PausasController } from './pausas.controller.js';
import { PausasService } from './pausas.service.js';
import { TrabajosController } from './trabajos.controller.js';
import { TrabajosService } from './trabajos.service.js';

@Module({
  imports: [PersonasModule, ProduccionModule],
  controllers: [TrabajosController, AdicionalesController, PausasController, FechasFijasController, EntregablesController, ContingenciasController],
  providers: [TrabajosService, AdicionalesService, PausasService, FechasFijasService],
  exports: [TrabajosService],
})
export class TrabajosModule {}
