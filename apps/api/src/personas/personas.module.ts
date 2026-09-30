import { Module } from '@nestjs/common';
import { PersonasController } from './personas.controller.js';
import { PersonasService } from './personas.service.js';

@Module({
  controllers: [PersonasController],
  providers: [PersonasService],
  exports: [PersonasService],
})
export class PersonasModule {}
