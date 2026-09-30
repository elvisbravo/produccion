import { Module } from '@nestjs/common';
import { PersonasModule } from '../personas/personas.module.js';
import { TrabajosController } from './trabajos.controller.js';
import { TrabajosService } from './trabajos.service.js';

@Module({
  imports: [PersonasModule],
  controllers: [TrabajosController],
  providers: [TrabajosService],
})
export class TrabajosModule {}
