import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import {
  comentarioSchema,
  consultaComentariosSchema,
  editarComentarioSchema,
  type ComentarioDatos,
  type ComentarioItem,
  type ConsultaComentarios,
  type UsuarioResumen,
} from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ComentariosService } from './comentarios.service.js';

/** Hilos de comentarios: no piden un permiso propio; los ve y escribe quien ve el registro. */
@Controller('comentarios')
export class ComentariosController {
  constructor(private readonly comentarios: ComentariosService) {}

  @Get()
  listar(@Query(new ZodValidationPipe(consultaComentariosSchema)) q: ConsultaComentarios, @Req() req: SolicitudAutenticada): Promise<ComentarioItem[]> {
    return this.comentarios.listar(q, req.usuario!.id);
  }

  @Get('mencionables')
  mencionables(@Query(new ZodValidationPipe(consultaComentariosSchema)) q: ConsultaComentarios, @Req() req: SolicitudAutenticada): Promise<UsuarioResumen[]> {
    return this.comentarios.mencionables(q, req.usuario!.id);
  }

  @Post()
  crear(@Body(new ZodValidationPipe(comentarioSchema)) datos: ComentarioDatos, @Req() req: SolicitudAutenticada): Promise<ComentarioItem> {
    return this.comentarios.crear(datos, req.usuario!.id);
  }

  @Patch(':id')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(editarComentarioSchema)) datos: { texto: string }, @Req() req: SolicitudAutenticada): Promise<ComentarioItem> {
    return this.comentarios.editar(id, datos.texto, req.usuario!.id);
  }

  @Delete(':id')
  @HttpCode(204)
  eliminar(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<void> {
    return this.comentarios.eliminar(id, req.usuario!.id);
  }
}
