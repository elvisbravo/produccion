import { Module } from '@nestjs/common';
import { TrabajosModule } from '../trabajos/trabajos.module.js';
import { CotizacionesController } from './cotizaciones.controller.js';
import { CotizacionesService } from './cotizaciones.service.js';
import { DocumentosController } from './documentos.controller.js';
import { DocumentosService } from './documentos.service.js';

/** Cotizaciones y documentos imprimibles (cotización, contrato y recibo) con el membrete y las plantillas de la empresa. */
@Module({
  imports: [TrabajosModule],
  controllers: [CotizacionesController, DocumentosController],
  providers: [CotizacionesService, DocumentosService],
})
export class DocumentosModule {}
