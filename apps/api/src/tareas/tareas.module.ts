import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module.js';
import { ProduccionModule } from '../produccion/produccion.module.js';
import { EmbudoService } from './embudo.service.js';
import { TareasController } from './tareas.controller.js';
import { TareasService } from './tareas.service.js';
import { TiempoController } from './tiempo.controller.js';
import { TiempoService } from './tiempo.service.js';

@Module({
  imports: [AgendaModule, ProduccionModule],
  controllers: [TareasController, TiempoController],
  providers: [TareasService, EmbudoService, TiempoService],
  exports: [TareasService, EmbudoService],
})
export class TareasModule {}
