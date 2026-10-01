import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import {
  costoHoraSchema,
  periodoSchema,
  type CostoHoraDatos,
  type CostoHoraItem,
  type ReporteCobranza,
  type ReporteOcupacion,
  type ReportePuntualidad,
  type ReporteRentabilidad,
  type ReporteRetrabajo,
  type Tablero,
} from '@grupoes/shared';
import type { z } from 'zod';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { ReportesService, resolverPeriodo } from './reportes.service.js';

type Consulta = z.output<typeof periodoSchema>;
const actor = (req: SolicitudAutenticada) => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

@Controller()
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @RequierePermiso('reportes.ver')
  @Get('reportes/tablero')
  tablero(@Query(new ZodValidationPipe(periodoSchema)) q: Consulta, @Req() req: SolicitudAutenticada): Promise<Tablero> {
    return this.reportes.tablero(resolverPeriodo(q.desde, q.hasta), req.usuario!.id);
  }

  @RequierePermiso('reportes.ver')
  @Get('reportes/puntualidad')
  puntualidad(@Query(new ZodValidationPipe(periodoSchema)) q: Consulta): Promise<ReportePuntualidad> {
    return this.reportes.puntualidad(resolverPeriodo(q.desde, q.hasta));
  }

  @RequierePermiso('reportes.ver')
  @Get('reportes/retrabajo')
  retrabajo(@Query(new ZodValidationPipe(periodoSchema)) q: Consulta): Promise<ReporteRetrabajo> {
    return this.reportes.retrabajo(resolverPeriodo(q.desde, q.hasta));
  }

  @RequierePermiso('reportes.ver')
  @Get('reportes/ocupacion')
  ocupacion(@Query(new ZodValidationPipe(periodoSchema)) q: Consulta): Promise<ReporteOcupacion> {
    return this.reportes.ocupacion(resolverPeriodo(q.desde, q.hasta));
  }

  @RequierePermiso('reportes.ver')
  @Get('reportes/cobranza')
  cobranza(@Query(new ZodValidationPipe(periodoSchema)) q: Consulta): Promise<ReporteCobranza> {
    return this.reportes.cobranza(resolverPeriodo(q.desde, q.hasta));
  }

  /** Confidencial: usa el costo por hora de cada persona. */
  @RequierePermiso('usuarios.ver_costo_hora')
  @Get('reportes/rentabilidad')
  rentabilidad(@Query(new ZodValidationPipe(periodoSchema)) q: Consulta): Promise<ReporteRentabilidad> {
    return this.reportes.rentabilidad(resolverPeriodo(q.desde, q.hasta));
  }

  @RequierePermiso('usuarios.ver_costo_hora')
  @Get('usuarios/:id/costos-hora')
  costos(@Param('id', ParseUUIDPipe) id: string): Promise<CostoHoraItem[]> {
    return this.reportes.costos(id);
  }

  /** Además de ver costos, exige poder editar usuarios (lo valida el servicio). */
  @RequierePermiso('usuarios.ver_costo_hora')
  @Post('usuarios/:id/costos-hora')
  guardarCosto(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(costoHoraSchema)) datos: CostoHoraDatos, @Req() req: SolicitudAutenticada): Promise<CostoHoraItem[]> {
    return this.reportes.guardarCosto(id, datos, actor(req));
  }

  @RequierePermiso('usuarios.ver_costo_hora')
  @Delete('usuarios/:id/costos-hora/:costoId')
  quitarCosto(@Param('id', ParseUUIDPipe) id: string, @Param('costoId', ParseUUIDPipe) costoId: string, @Req() req: SolicitudAutenticada): Promise<CostoHoraItem[]> {
    return this.reportes.quitarCosto(id, costoId, actor(req));
  }
}
