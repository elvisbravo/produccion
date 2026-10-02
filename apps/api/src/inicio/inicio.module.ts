import { Module } from '@nestjs/common';
import { ReportesModule } from '../reportes/reportes.module.js';
import { TrabajosModule } from '../trabajos/trabajos.module.js';
import { InicioController } from './inicio.controller.js';
import { InicioService } from './inicio.service.js';

@Module({
  imports: [TrabajosModule, ReportesModule],
  controllers: [InicioController],
  providers: [InicioService],
})
export class InicioModule {}
