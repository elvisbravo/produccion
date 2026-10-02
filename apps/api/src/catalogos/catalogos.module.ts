import { Module } from '@nestjs/common';
import { ActividadesService } from './actividades.service.js';
import { CatalogosController } from './catalogos.controller.js';
import { CatalogosService } from './catalogos.service.js';

@Module({
  controllers: [CatalogosController],
  providers: [CatalogosService, ActividadesService],
})
export class CatalogosModule {}
