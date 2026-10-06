import { Module } from '@nestjs/common';
import { PersonasModule } from '../personas/personas.module.js';
import { ProduccionModule } from '../produccion/produccion.module.js';
import { AdicionalesController } from './adicionales.controller.js';
import { AdicionalesService } from './adicionales.service.js';
import { ContingenciasController } from './contingencias.controller.js';
import { EdicionTrabajoController } from './edicion-trabajo.controller.js';
import { EdicionTrabajoService } from './edicion-trabajo.service.js';
import { EntregablesController } from './entregables.controller.js';
import { FechasFijasController } from './fechas-fijas.controller.js';
import { FechasFijasService } from './fechas-fijas.service.js';
import { PausasController } from './pausas.controller.js';
import { PausasService } from './pausas.service.js';
import { ClientesDirectosService } from './clientes-directos.service.js';
import { TrabajosProveedorController } from './trabajos-proveedor.controller.js';
import { TrabajosProveedorService } from './trabajos-proveedor.service.js';
import { TrabajosController } from './trabajos.controller.js';
import { TrabajosService } from './trabajos.service.js';
import { ValoracionesController } from './valoraciones.controller.js';
import { ValoracionesService } from './valoraciones.service.js';

@Module({
  imports: [PersonasModule, ProduccionModule],
  controllers: [EdicionTrabajoController, TrabajosProveedorController, TrabajosController, AdicionalesController, PausasController, FechasFijasController, ValoracionesController, EntregablesController, ContingenciasController],
  providers: [TrabajosService, AdicionalesService, PausasService, FechasFijasService, ValoracionesService, TrabajosProveedorService, ClientesDirectosService, EdicionTrabajoService],
  exports: [TrabajosService],
})
export class TrabajosModule {}
