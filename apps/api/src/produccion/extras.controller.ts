import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import {
  listarExtrasSchema,
  proponerExtraSchema,
  realizarExtraSchema,
  responderExtraSchema,
  topesExtraSchema,
  type HoraExtraItem,
  type ProponerExtraDatos,
  type ResumenExtras,
  type TopesExtra,
} from '@grupoes/shared';
import type { z } from 'zod';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { ExtrasService } from './extras.service.js';

const actor = (req: SolicitudAutenticada) => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

@Controller('horas-extra')
export class ExtrasController {
  constructor(private readonly extras: ExtrasService) {}

  @RequierePermiso('horas_extra.ver')
  @Get()
  listar(@Query(new ZodValidationPipe(listarExtrasSchema)) f: z.output<typeof listarExtrasSchema>, @Req() req: SolicitudAutenticada): Promise<ResumenExtras> {
    return this.extras.listar(f.vista, f.desde, f.hasta, actor(req));
  }

  @RequierePermiso('programacion.proponer_extra')
  @Post()
  proponer(@Body(new ZodValidationPipe(proponerExtraSchema)) datos: ProponerExtraDatos, @Req() req: SolicitudAutenticada): Promise<HoraExtraItem> {
    return this.extras.proponer(datos, actor(req));
  }

  @RequierePermiso('horas_extra.ver')
  @Post(':id/responder')
  responder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(responderExtraSchema)) { acepta, motivo }: { acepta: boolean; motivo?: string },
    @Req() req: SolicitudAutenticada,
  ): Promise<HoraExtraItem> {
    return this.extras.responder(id, acepta, motivo, actor(req));
  }

  @RequierePermiso('horas_extra.aprobar')
  @Post(':id/aprobar')
  aprobar(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<HoraExtraItem> {
    return this.extras.aprobar(id, actor(req));
  }

  @RequierePermiso('horas_extra.aprobar')
  @Post(':id/realizar')
  realizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(realizarExtraSchema)) { minutosReales }: { minutosReales?: number },
    @Req() req: SolicitudAutenticada,
  ): Promise<HoraExtraItem> {
    return this.extras.realizar(id, minutosReales, actor(req));
  }

  @RequierePermiso('horas_extra.ver')
  @Post(':id/anular')
  anular(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<HoraExtraItem> {
    return this.extras.anular(id, actor(req));
  }

  @RequierePermiso('parametros.editar')
  @Put('topes')
  topes(@Body(new ZodValidationPipe(topesExtraSchema)) datos: TopesExtra, @Req() req: SolicitudAutenticada): Promise<TopesExtra> {
    return this.extras.guardarTopes(datos, actor(req));
  }
}
