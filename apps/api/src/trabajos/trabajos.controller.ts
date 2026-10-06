import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import {
  anularPagoSchema,
  armarEquipoSchema,
  convertirProspectoSchema,
  listarTrabajosSchema,
  pagoSchema,
  type ArmarEquipoDatos,
  type ConvertirProspectoDatos,
  type ListarTrabajosConsulta,
  type Paginado,
  type PagoDatos,
  type ResumenCobranza,
  type TrabajoDetalle,
  type TrabajoListadoItem,
  type UsuarioResumen,
} from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { TrabajosService, type ActorTrabajo } from './trabajos.service.js';

const actor = (req: SolicitudAutenticada): ActorTrabajo => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

@Controller()
export class TrabajosController {
  constructor(private readonly trabajos: TrabajosService) {}

  @RequierePermiso('prospectos.convertir')
  @Post('prospectos/:id/convertir')
  convertir(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(convertirProspectoSchema)) datos: ConvertirProspectoDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<TrabajoDetalle> {
    return this.trabajos.convertir(id, datos, actor(req));
  }

  @RequierePermiso('trabajos.ver')
  @Get('trabajos')
  listar(
    @Query(new ZodValidationPipe(listarTrabajosSchema)) filtros: ListarTrabajosConsulta,
    @Req() req: SolicitudAutenticada,
  ): Promise<Paginado<TrabajoListadoItem>> {
    return this.trabajos.listar(filtros, req.usuario!.id);
  }

  @RequierePermiso('trabajos.ver')
  @Get('trabajos/asistentes-administrativas')
  asistentesAdministrativas(): Promise<UsuarioResumen[]> {
    return this.trabajos.asistentesAdministrativas();
  }

  @RequierePermiso('trabajos.armar_equipo')
  @Get('trabajos/candidatos-equipo')
  candidatosEquipo(): Promise<{ auxiliares: UsuarioResumen[]; jefes: UsuarioResumen[] }> {
    return this.trabajos.candidatosEquipo();
  }

  @RequierePermiso('trabajos.ver')
  @Get('trabajos/:id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<TrabajoDetalle> {
    return this.trabajos.obtener(id, req.usuario!.id);
  }

  @RequierePermiso('trabajos.armar_equipo')
  @Put('trabajos/:id/equipo')
  armarEquipo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(armarEquipoSchema)) datos: ArmarEquipoDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<TrabajoDetalle> {
    return this.trabajos.armarEquipo(id, datos, actor(req));
  }

  @RequierePermiso('contratos.registrar_pago')
  @Post('contratos/:id/pagos')
  registrarPago(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(pagoSchema)) datos: PagoDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<TrabajoDetalle> {
    return this.trabajos.registrarPago(id, datos, actor(req));
  }

  @RequierePermiso('contratos.anular')
  @Post('pagos/:id/anular')
  anularPago(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(anularPagoSchema)) { motivo }: { motivo: string },
    @Req() req: SolicitudAutenticada,
  ): Promise<TrabajoDetalle> {
    return this.trabajos.anularPago(id, motivo, actor(req));
  }

  @RequierePermiso('contratos.ver_montos')
  @Get('contratos/cobranza')
  cobranza(): Promise<ResumenCobranza> {
    return this.trabajos.cobranza();
  }
}
