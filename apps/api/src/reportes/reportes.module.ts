import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module.js';
import { ReportesController } from './reportes.controller.js';
import { ReportesService } from './reportes.service.js';

/** Tableros e indicadores: puntualidad, retrabajo, ocupación, cobranza y rentabilidad (con el costo por hora). */
@Module({
  imports: [AgendaModule],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
