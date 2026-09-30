import { Module } from '@nestjs/common';
import { PersonasModule } from '../personas/personas.module.js';
import { TareasModule } from '../tareas/tareas.module.js';
import { ProspectosController } from './prospectos.controller.js';
import { ProspectosService } from './prospectos.service.js';
import { SeguimientoController } from './seguimiento.controller.js';
import { SeguimientoService } from './seguimiento.service.js';

@Module({
  imports: [PersonasModule, TareasModule],
  controllers: [ProspectosController, SeguimientoController],
  providers: [ProspectosService, SeguimientoService],
})
export class ProspectosModule {}
