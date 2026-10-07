import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import {
  asignarTareaSchema,
  cancelarTareaSchema,
  completarTareaSchema,
  enlaceReunionSchema,
  equipoReunionSchema,
  listarReunionesSchema,
  programarTareaSchema,
  reprogramarTareaSchema,
  type ActividadCatalogo,
  type AsignarTareaDatos,
  type CandidatosTarea,
  type CompletarTareaDatos,
  type EnlaceReunionDatos,
  type EquipoReunionDatos,
  type ImpactoReunion,
  type ListarReunionesConsulta,
  type ReunionFila,
  type ProgramarTareaDatos,
  type ReprogramarTareaDatos,
  type ResultadoCompletar,
  type TareaItem,
} from '@grupoes/shared';
import { z } from 'zod';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { TareasService, type ActorTarea } from './tareas.service.js';

const actor = (req: SolicitudAutenticada): ActorTarea => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });

@Controller()
export class TareasController {
  constructor(private readonly tareas: TareasService) {}

  @RequierePermiso('tareas.ver')
  @Get('actividades')
  actividades(
    @Query(new ZodValidationPipe(z.object({ aplicaA: z.enum(['prospecto', 'cliente']).optional() }))) { aplicaA }: { aplicaA?: 'prospecto' | 'cliente' },
  ): Promise<ActividadCatalogo[]> {
    return this.tareas.actividades(aplicaA);
  }

  @RequierePermiso('tareas.crear')
  @Post('prospectos/:id/tareas')
  async programar(
    @Param('id', ParseUUIDPipe) prospectoId: string,
    @Body(new ZodValidationPipe(programarTareaSchema)) datos: ProgramarTareaDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<TareaItem> {
    await this.tareas.verificarProspecto(prospectoId, req.usuario!.id);
    const id = await this.tareas.programarParaProspecto(prospectoId, datos, actor(req));
    return this.tareas.detalle(id, req.usuario!.id);
  }

  /** Programa una reunión a un cliente (un trabajo). */
  @RequierePermiso('tareas.crear')
  @Post('trabajos/:id/reuniones')
  async programarReunionDeTrabajo(
    @Param('id', ParseUUIDPipe) trabajoId: string,
    @Body(new ZodValidationPipe(programarTareaSchema)) datos: ProgramarTareaDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<TareaItem> {
    await this.tareas.verificarTrabajo(trabajoId, req.usuario!.id);
    const id = await this.tareas.programarReunionDeTrabajo(trabajoId, datos, actor(req));
    return this.tareas.detalle(id, req.usuario!.id);
  }

  @RequierePermiso('tareas.ver')
  @Get('tareas/mias')
  mias(@Req() req: SolicitudAutenticada): Promise<TareaItem[]> {
    return this.tareas.mias(req.usuario!.id);
  }

  @RequierePermiso('tareas.asignar')
  @Get('tareas/por-asignar')
  porAsignar(@Req() req: SolicitudAutenticada): Promise<TareaItem[]> {
    return this.tareas.porAsignar(req.usuario!.id);
  }

  @RequierePermiso('tareas.ver')
  @Get('tareas/:id')
  detalle(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<TareaItem> {
    return this.tareas.detalle(id, req.usuario!.id);
  }

  @RequierePermiso('tareas.asignar')
  @Get('tareas/:id/candidatos')
  candidatos(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<CandidatosTarea> {
    return this.tareas.candidatos(id, req.usuario!.id);
  }

  @RequierePermiso('tareas.asignar')
  @Post('tareas/:id/asignar')
  asignar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(asignarTareaSchema)) datos: AsignarTareaDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<TareaItem> {
    return this.tareas.asignar(id, datos, actor(req));
  }

  @RequierePermiso('tareas.editar')
  @Post('tareas/:id/completar')
  completar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(completarTareaSchema)) datos: CompletarTareaDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<ResultadoCompletar> {
    return this.tareas.completar(id, datos, actor(req));
  }

  @RequierePermiso('tareas.editar')
  @Post('tareas/:id/iniciar')
  iniciar(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<TareaItem> {
    return this.tareas.iniciar(id, actor(req));
  }

  @RequierePermiso('tareas.reprogramar')
  @Post('tareas/:id/reprogramar')
  reprogramar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reprogramarTareaSchema)) datos: ReprogramarTareaDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<TareaItem> {
    return this.tareas.reprogramar(id, datos, actor(req));
  }

  /** Tabla de reuniones por días (con alcance «propios», las del usuario). */
  @RequierePermiso('agenda_reuniones.ver')
  @Get('reuniones')
  reuniones(@Query(new ZodValidationPipe(listarReunionesSchema)) consulta: ListarReunionesConsulta, @Req() req: SolicitudAutenticada): Promise<ReunionFila[]> {
    return this.tareas.reuniones(consulta, req.usuario!.id);
  }

  /** Qué se corre en la cola de esas personas si se les asigna esta reunión (ids separados por coma). */
  @RequierePermiso('tareas.asignar')
  @Get('tareas/:id/impacto-cola')
  impactoCola(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('usuarioIds') usuarioIds: string | undefined,
    @Query('fecha') fecha: string | undefined,
    @Query('hora') hora: string | undefined,
    @Req() req: SolicitudAutenticada,
  ): Promise<ImpactoReunion[]> {
    const ids = (usuarioIds ?? '').split(',').filter((x) => z.uuid().safeParse(x).success);
    // Con día y hora nuevos: qué pasa si se reprograma una reunión ya asignada.
    const nuevo = fecha && hora && z.iso.date().safeParse(fecha).success && /^([01]\d|2[0-3]):[0-5]\d$/.test(hora) ? { fecha, hora } : undefined;
    return this.tareas.impactoDeAsignar(id, ids, req.usuario!.id, nuevo);
  }

  /** El jefe de producción y el auxiliar de apoyo (opcional) de una reunión. */
  @RequierePermiso('tareas.asignar')
  @Put('tareas/:id/equipo-reunion')
  equipoReunion(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(equipoReunionSchema)) datos: EquipoReunionDatos, @Req() req: SolicitudAutenticada): Promise<TareaItem> {
    return this.tareas.cambiarEquipoReunion(id, datos, actor(req));
  }

  @RequierePermiso('tareas.editar')
  @Put('tareas/:id/enlace-reunion')
  enlaceReunion(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(enlaceReunionSchema)) datos: EnlaceReunionDatos, @Req() req: SolicitudAutenticada): Promise<TareaItem> {
    return this.tareas.guardarEnlaceReunion(id, datos, actor(req));
  }

  @RequierePermiso('tareas.editar')
  @Post('tareas/:id/cancelar')
  cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelarTareaSchema)) { motivo }: { motivo: string },
    @Req() req: SolicitudAutenticada,
  ): Promise<TareaItem> {
    return this.tareas.cancelar(id, motivo, actor(req));
  }
}
