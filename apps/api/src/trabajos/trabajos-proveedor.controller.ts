import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { clienteDirectoSchema, cobroSchema, trabajoProveedorSchema, type ClienteDirectoDatos, type CobroDatos, type TrabajoDetalle, type TrabajoProveedorDatos, type UsuarioResumen } from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { ClientesDirectosService } from './clientes-directos.service.js';
import { TrabajosProveedorService } from './trabajos-proveedor.service.js';
import type { ActorTrabajo } from './trabajos.service.js';

const actor = (req: SolicitudAutenticada): ActorTrabajo => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

/** Trabajos que entrega un proveedor y su cobro. */
@Controller('trabajos')
export class TrabajosProveedorController {
  constructor(
    private readonly servicio: TrabajosProveedorService,
    private readonly directos: ClientesDirectosService,
  ) {}

  @RequierePermiso('trabajos.registrar_cliente_directo')
  @Post('cliente-directo')
  registrarClienteDirecto(@Body(new ZodValidationPipe(clienteDirectoSchema)) datos: ClienteDirectoDatos, @Req() req: SolicitudAutenticada): Promise<TrabajoDetalle> {
    return this.directos.registrar(datos, actor(req));
  }

  /** Personas que pueden figurar como responsables del cliente (para el formulario). */
  @RequierePermiso('trabajos.registrar_cliente_directo')
  @Get('cliente-directo/responsables')
  responsables(@Req() req: SolicitudAutenticada): Promise<UsuarioResumen[]> {
    return this.directos.posiblesResponsables(req.usuario!.id);
  }

  @RequierePermiso('trabajos.registrar_de_proveedor')
  @Post('de-proveedor')
  registrar(@Body(new ZodValidationPipe(trabajoProveedorSchema)) datos: TrabajoProveedorDatos, @Req() req: SolicitudAutenticada): Promise<TrabajoDetalle> {
    return this.servicio.registrar(datos, actor(req));
  }

  @RequierePermiso('contratos.crear')
  @Post(':id/cobro')
  @HttpCode(200)
  cobro(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(cobroSchema)) datos: CobroDatos, @Req() req: SolicitudAutenticada): Promise<TrabajoDetalle> {
    return this.servicio.registrarCobro(id, datos, actor(req));
  }
}
