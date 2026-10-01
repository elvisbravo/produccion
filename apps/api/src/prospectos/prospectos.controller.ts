import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import {
  cambiarEtapaSchema,
  crearProspectoSchema,
  listarProspectosSchema,
  prospectoSchema,
  reasignarLoteSchema,
  reasignarProspectoSchema,
  type CambiarEtapaDatos,
  type CrearProspectoDatos,
  type Paginado,
  type ProspectoDatos,
  type ProspectoDetalle,
  type ProspectoListadoItem,
  type ReasignarLoteDatos,
  type ReasignarProspectoDatos,
  type ResultadoReasignarLote,
  type UsuarioResumen,
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

  /** Quiénes pueden recibir un prospecto. Va antes de ":id" para que no se tome como un id. */
  @RequierePermiso('prospectos.reasignar')
  @Get('posibles-responsables')
  posiblesResponsables(): Promise<UsuarioResumen[]> {
    return this.prospectos.posiblesResponsables();
  }

  @RequierePermiso('prospectos.reasignar')
  @Post('reasignar-lote')
  @HttpCode(200)
  reasignarLote(@Body(new ZodValidationPipe(reasignarLoteSchema)) datos: ReasignarLoteDatos, @Req() req: SolicitudAutenticada): Promise<ResultadoReasignarLote> {
    return this.prospectos.reasignarLote(datos, actor(req));
  }

  @RequierePermiso('prospectos.ver')
  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<ProspectoDetalle> {
    return this.prospectos.obtener(id, actor(req));
  }

  @RequierePermiso('prospectos.crear')
  @Post()
  crear(@Body(new ZodValidationPipe(crearProspectoSchema)) datos: CrearProspectoDatos, @Req() req: SolicitudAutenticada): Promise<ProspectoDetalle> {
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

  @RequierePermiso('prospectos.reasignar')
  @Post(':id/reasignar')
  @HttpCode(200)
  reasignar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reasignarProspectoSchema)) datos: ReasignarProspectoDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<ProspectoDetalle> {
    return this.prospectos.reasignar(id, datos, actor(req));
  }

  @RequierePermiso('prospectos.editar')
  @Patch(':id/etapa')
  cambiarEtapa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cambiarEtapaSchema)) datos: CambiarEtapaDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<ProspectoDetalle> {
    return this.prospectos.cambiarEtapa(id, datos, actor(req));
  }
}
