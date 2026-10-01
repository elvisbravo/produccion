import { Module } from '@nestjs/common';
import { ConsultasController } from './consultas.controller.js';
import { ConsultaDniService } from './consulta-dni.service.js';

/** Consultas a servicios externos para rellenar formularios. */
@Module({
  controllers: [ConsultasController],
  providers: [ConsultaDniService],
})
export class ConsultasModule {}
