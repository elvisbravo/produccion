import { Module } from '@nestjs/common';
import { AgendaController, AusenciasController, CalendarioController } from './agenda.controller.js';
import { AgendaService } from './agenda.service.js';
import { AusenciasService } from './ausencias.service.js';
import { CalendarioService } from './calendario.service.js';

@Module({
  controllers: [AgendaController, CalendarioController, AusenciasController],
  providers: [AgendaService, CalendarioService, AusenciasService],
  exports: [AgendaService],
})
export class AgendaModule {}
