import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import {
  listarProspectosSchema,
  prospectoSchema,
  type Paginado,
  type ProspectoDatos,
  type ProspectoDetalle,
  type ProspectoListadoItem,
} from '@grupoes/shared';
import type { z } from 'zod';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { ProspectosService, type Actor } from './prospectos.service.js';

const actor = (req: SolicitudAutenticada): Actor => ({ usuarioId: req.usuario!.id, alcance: req.alcance ?? null, ip: req.ip ?? null });

@Controller('prospectos')
export class ProspectosController {
  constructor(private readonly prospectos: ProspectosService) {}

  @RequierePermiso('prospectos.ver')
  @Get()
  listar(
    @Query(new ZodValidationPipe(listarProspectosSchema)) filtros: z.output<typeof listarProspectosSchema>,
    @Req() req: SolicitudAutenticada,
  ): Promise<Paginado<ProspectoListadoItem>> {
    return this.prospectos.listar(filtros, actor(req));
  }

  @RequierePermiso('prospectos.ver')
  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<ProspectoDetalle> {
    return this.prospectos.obtener(id, actor(req));
  }

  @RequierePermiso('prospectos.crear')
  @Post()
  crear(@Body(new ZodValidationPipe(prospectoSchema)) datos: ProspectoDatos, @Req() req: SolicitudAutenticada): Promise<ProspectoDetalle> {
    return this.prospectos.crear(datos, actor(req));
  }

  @RequierePermiso('prospectos.editar')
  @Patch(':id')
  editar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(prospectoSchema)) datos: ProspectoDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<ProspectoDetalle> {
    return this.prospectos.editar(id, datos, actor(req));
  }
}
