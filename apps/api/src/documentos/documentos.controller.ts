import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Req } from '@nestjs/common';
import {
  configuracionDocumentosSchema,
  type ConfiguracionDocumentos,
  type ConfiguracionDocumentosDatos,
  type DocumentoContrato,
  type DocumentoCotizacion,
  type DocumentoRecibo,
} from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { DocumentosService } from './documentos.service.js';

@Controller('documentos')
export class DocumentosController {
  constructor(private readonly documentos: DocumentosService) {}

  @RequierePermiso('documentos.ver')
  @Get('configuracion')
  configuracion(): Promise<ConfiguracionDocumentos> {
    return this.documentos.configuracion();
  }

  @RequierePermiso('documentos.editar')
  @Put('configuracion')
  guardar(@Body(new ZodValidationPipe(configuracionDocumentosSchema)) datos: ConfiguracionDocumentosDatos, @Req() req: SolicitudAutenticada): Promise<ConfiguracionDocumentos> {
    return this.documentos.guardar(datos, { usuarioId: req.usuario!.id, ip: req.ip ?? null });
  }

  @RequierePermiso('cotizaciones.imprimir')
  @Get('cotizacion/:id')
  cotizacion(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<DocumentoCotizacion> {
    return this.documentos.cotizacion(id, req.usuario!.id);
  }

  /** Por id del trabajo. */
  @RequierePermiso('contratos.imprimir')
  @Get('contrato/:trabajoId')
  contrato(@Param('trabajoId', ParseUUIDPipe) trabajoId: string, @Req() req: SolicitudAutenticada): Promise<DocumentoContrato> {
    return this.documentos.contrato(trabajoId, req.usuario!.id);
  }

  @RequierePermiso('contratos.imprimir')
  @Get('recibo/:pagoId')
  recibo(@Param('pagoId', ParseUUIDPipe) pagoId: string, @Req() req: SolicitudAutenticada): Promise<DocumentoRecibo> {
    return this.documentos.recibo(pagoId, req.usuario!.id);
  }
}
