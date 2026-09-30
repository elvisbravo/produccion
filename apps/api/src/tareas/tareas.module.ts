import { Module } from '@nestjs/common';
import { EmbudoService } from './embudo.service.js';
import { TareasController } from './tareas.controller.js';
import { TareasService } from './tareas.service.js';

@Module({
  controllers: [TareasController],
  providers: [TareasService, EmbudoService],
  exports: [TareasService, EmbudoService],
})
export class TareasModule {}
