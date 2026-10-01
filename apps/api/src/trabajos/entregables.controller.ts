import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import {
  bandejaEntregablesSchema,
  entregableSchema,
  entregarSchema,
  respuestaClienteSchema,
  revisarEntregableSchema,
  tareaEntregableSchema,
  type BandejaEntregable,
  type EntregableDatos,
  type EntregarDatos,
  type RespuestaClienteDatos,
  type RevisarEntregableDatos,
  type TareaEntregableDatos,
  type TrabajoDetalle,
  type VistaBandeja,
} from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { ProduccionService } from '../produccion/produccion.service.js';
import { TrabajosService } from './trabajos.service.js';

const actor = (req: SolicitudAutenticada) => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

/**
 * Entregables de un trabajo: cada acción verifica que el trabajo sea visible para el usuario
 * (el auxiliar solo actúa en los trabajos de su equipo) y devuelve el trabajo actualizado.
 */
@Controller()
export class EntregablesController {
  constructor(
    private readonly trabajos: TrabajosService,
    private readonly produccion: ProduccionService,
    private readonly permisos: PermisosService,
  ) {}

  private async enEntregable(id: string, req: SolicitudAutenticada, accion: () => Promise<void>): Promise<TrabajoDetalle> {
    const trabajoId = await this.produccion.trabajoDeEntregable(id);
    await this.trabajos.verificarVisible(trabajoId, req.usuario!.id);
    await accion();
    return this.trabajos.obtener(trabajoId, req.usuario!.id);
  }

  @RequierePermiso('entregables.ver')
  @Get('entregables')
  async bandeja(@Query(new ZodValidationPipe(bandejaEntregablesSchema)) { vista }: { vista: VistaBandeja }, @Req() req: SolicitudAutenticada): Promise<BandejaEntregable[]> {
    return this.produccion.bandeja(vista, await this.trabajos.filtroVisibles(req.usuario!.id));
  }

  @RequierePermiso('entregables.crear')
  @Post('trabajos/:id/plan')
  async generarPlan(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<TrabajoDetalle> {
    await this.trabajos.verificarVisible(id, req.usuario!.id);
    await this.produccion.generarPlan(id, actor(req));
    return this.trabajos.obtener(id, req.usuario!.id);
  }

  @RequierePermiso('entregables.crear')
  @Post('trabajos/:id/entregables')
  async crear(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(entregableSchema)) datos: EntregableDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<TrabajoDetalle> {
    await this.trabajos.verificarVisible(id, req.usuario!.id);
    await this.produccion.crearEntregable(id, datos, actor(req));
    return this.trabajos.obtener(id, req.usuario!.id);
  }

  @RequierePermiso('entregables.editar')
  @Put('entregables/:id')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(entregableSchema)) datos: EntregableDatos, @Req() req: SolicitudAutenticada) {
    return this.enEntregable(id, req, () => this.produccion.editarEntregable(id, datos, actor(req)));
  }

  @RequierePermiso('entregables.crear')
  @Delete('entregables/:id')
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<TrabajoDetalle> {
    const trabajoId = await this.produccion.trabajoDeEntregable(id);
    await this.trabajos.verificarVisible(trabajoId, req.usuario!.id);
    await this.produccion.eliminarEntregable(id, actor(req));
    return this.trabajos.obtener(trabajoId, req.usuario!.id);
  }

  @RequierePermiso('programacion.programar')
  @Post('entregables/:id/tareas')
  agregarTarea(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(tareaEntregableSchema)) datos: TareaEntregableDatos,
    @Req() req: SolicitudAutenticada,
  ) {
    return this.enEntregable(id, req, () => this.produccion.agregarTarea(id, datos, actor(req)));
  }

  @RequierePermiso('entregables.enviar_revision')
  @Post('entregables/:id/enviar-revision')
  enviarRevision(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada) {
    return this.enEntregable(id, req, () => this.produccion.enviarRevision(id, actor(req)));
  }

  /** Aprobar exige "entregables.aprobar"; observar, "entregables.observar". */
  @Post('entregables/:id/revisar')
  async revisar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(revisarEntregableSchema)) datos: RevisarEntregableDatos,
    @Req() req: SolicitudAutenticada,
  ) {
    const permiso = datos.resultado === 'aprobado' ? 'entregables.aprobar' : 'entregables.observar';
    if (!(permiso in (await this.permisos.efectivos(req.usuario!.id)))) throw new ForbiddenException('No tienes permiso para esta acción');
    return this.enEntregable(id, req, () => this.produccion.revisar(id, datos, actor(req)));
  }

  @RequierePermiso('entregables.registrar_entrega')
  @Post('entregables/:id/entregar')
  entregar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(entregarSchema)) datos: EntregarDatos, @Req() req: SolicitudAutenticada) {
    return this.enEntregable(id, req, () => this.produccion.entregar(id, datos, actor(req)));
  }

  @RequierePermiso('entregables.registrar_entrega')
  @Post('entregables/:id/respuesta-cliente')
  respuesta(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(respuestaClienteSchema)) datos: RespuestaClienteDatos,
    @Req() req: SolicitudAutenticada,
  ) {
    return this.enEntregable(id, req, () => this.produccion.respuestaCliente(id, datos, actor(req)));
  }
}
