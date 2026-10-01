import { Module } from '@nestjs/common';
import { PersonasModule } from '../personas/personas.module.js';
import { ProduccionModule } from '../produccion/produccion.module.js';
import { ContingenciasController } from './contingencias.controller.js';
import { EntregablesController } from './entregables.controller.js';
import { TrabajosController } from './trabajos.controller.js';
import { TrabajosService } from './trabajos.service.js';

@Module({
  imports: [PersonasModule, ProduccionModule],
  controllers: [TrabajosController, EntregablesController, ContingenciasController],
  providers: [TrabajosService],
  exports: [TrabajosService],
})
export class TrabajosModule {}
