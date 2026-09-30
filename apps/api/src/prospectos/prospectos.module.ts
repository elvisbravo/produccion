import { Module } from '@nestjs/common';
import { PersonasModule } from '../personas/personas.module.js';
import { ProspectosController } from './prospectos.controller.js';
import { ProspectosService } from './prospectos.service.js';

@Module({
  imports: [PersonasModule],
  controllers: [ProspectosController],
  providers: [ProspectosService],
})
export class ProspectosModule {}
