import { Module } from '@nestjs/common';
import { TrabajosModule } from '../trabajos/trabajos.module.js';
import { ComentariosController } from './comentarios.controller.js';
import { ComentariosService } from './comentarios.service.js';

/** Comentarios internos con @menciones en prospectos, trabajos, entregables y tareas. */
@Module({
  imports: [TrabajosModule],
  controllers: [ComentariosController],
  providers: [ComentariosService],
})
export class ComentariosModule {}
