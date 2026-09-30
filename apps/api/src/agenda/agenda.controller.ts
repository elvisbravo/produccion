import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import {
  datosPersonalSchema,
  feriadoSchema,
  horarioUsuarioSchema,
  listarAusenciasSchema,
  plantillaHorarioSchema,
  rangoAgendaSchema,
  rechazarAusenciaSchema,
  registrarAusenciaSchema,
  resolverAusenciaSchema,
  ROLES_BASE,
  solicitarAusenciaSchema,
  type AgendaEquipo,
  type AgendaPersona,
  type AusenciaItem,
  type DatosPersonalDatos,
  type FeriadoDatos,
  type FeriadoItem,
  type HorarioUsuarioDatos,
  type PersonalItem,
  type PlantillaHorarioDatos,
  type PlantillaHorarioItem,
  type RegistrarAusenciaDatos,
  type SolicitarAusenciaDatos,
  type UsuarioResumen,
} from '@grupoes/shared';
import { z } from 'zod';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AgendaService } from './agenda.service.js';
import { AusenciasService } from './ausencias.service.js';
import { CalendarioService } from './calendario.service.js';

type Rango = z.output<typeof rangoAgendaSchema>;
const actor = (req: SolicitudAutenticada) => ({ usuarioId: req.usuario!.id, ip: req.ip ?? null });
const anioSchema = z.object({ anio: z.coerce.number().int().min(2000).max(2100) });

@Controller('agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @RequierePermiso('agenda.ver')
  @Get('mia')
  mia(@Query(new ZodValidationPipe(rangoAgendaSchema)) r: Rango, @Req() req: SolicitudAutenticada): Promise<AgendaPersona> {
    return this.agenda.deUsuario(req.usuario!.id, r.desde, r.hasta);
  }

  @RequierePermiso('programacion.ver')
  @Get('equipo')
  equipo(@Query(new ZodValidationPipe(rangoAgendaSchema)) r: Rango): Promise<AgendaEquipo> {
    return this.agenda.equipo(r.desde, r.hasta, r.rol);
  }

  @RequierePermiso('programacion.ver')
  @Get('usuarios/:id')
  deUsuario(@Param('id', ParseUUIDPipe) id: string, @Query(new ZodValidationPipe(rangoAgendaSchema)) r: Rango): Promise<AgendaPersona> {
    return this.agenda.deUsuario(id, r.desde, r.hasta);
  }
}

@Controller('calendario')
export class CalendarioController {
  constructor(private readonly calendario: CalendarioService) {}

  @RequierePermiso('calendario.ver')
  @Get('feriados')
  feriados(@Query(new ZodValidationPipe(anioSchema)) { anio }: { anio: number }): Promise<FeriadoItem[]> {
    return this.calendario.feriados(anio);
  }

  @RequierePermiso('calendario.editar')
  @Post('feriados')
  crearFeriado(@Body(new ZodValidationPipe(feriadoSchema)) datos: FeriadoDatos, @Req() req: SolicitudAutenticada): Promise<FeriadoItem> {
    return this.calendario.guardarFeriado(null, datos, actor(req));
  }

  @RequierePermiso('calendario.editar')
  @Put('feriados/:id')
  editarFeriado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(feriadoSchema)) datos: FeriadoDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<FeriadoItem> {
    return this.calendario.guardarFeriado(id, datos, actor(req));
  }

  @RequierePermiso('calendario.editar')
  @Delete('feriados/:id')
  @HttpCode(204)
  eliminarFeriado(@Param('id', ParseUUIDPipe) id: string, @Req() req: SolicitudAutenticada): Promise<void> {
    return this.calendario.eliminarFeriado(id, actor(req));
  }

  @RequierePermiso('calendario.ver')
  @Get('plantillas')
  plantillas(): Promise<PlantillaHorarioItem[]> {
    return this.calendario.plantillas();
  }

  @RequierePermiso('calendario.editar')
  @Post('plantillas')
  crearPlantilla(@Body(new ZodValidationPipe(plantillaHorarioSchema)) datos: PlantillaHorarioDatos, @Req() req: SolicitudAutenticada): Promise<PlantillaHorarioItem> {
    return this.calendario.guardarPlantilla(null, datos, actor(req));
  }

  @RequierePermiso('calendario.editar')
  @Put('plantillas/:id')
  editarPlantilla(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(plantillaHorarioSchema)) datos: PlantillaHorarioDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<PlantillaHorarioItem> {
    return this.calendario.guardarPlantilla(id, datos, actor(req));
  }

  @RequierePermiso('calendario.ver')
  @Get('personal')
  personal(): Promise<PersonalItem[]> {
    return this.calendario.personal();
  }

  @RequierePermiso('calendario.editar')
  @Put('personal/:id/horario')
  guardarHorario(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(horarioUsuarioSchema)) datos: HorarioUsuarioDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<PersonalItem> {
    return this.calendario.guardarHorario(id, datos, actor(req));
  }

  @RequierePermiso('calendario.editar')
  @Delete('personal/:id/horario/:horarioId')
  anularHorario(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('horarioId', ParseUUIDPipe) horarioId: string,
    @Req() req: SolicitudAutenticada,
  ): Promise<PersonalItem> {
    return this.calendario.anularHorarioFuturo(id, horarioId, actor(req));
  }

  @RequierePermiso('calendario.editar')
  @Patch('personal/:id')
  guardarDatos(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(datosPersonalSchema)) datos: DatosPersonalDatos,
    @Req() req: SolicitudAutenticada,
  ): Promise<PersonalItem> {
    return this.calendario.guardarDatos(id, datos, actor(req));
  }
}

@Controller('ausencias')
export class AusenciasController {
  constructor(
    private readonly ausencias: AusenciasService,
    private readonly prisma: PrismaService,
  ) {}

  @RequierePermiso('ausencias.ver')
  @Get()
  listar(@Query(new ZodValidationPipe(listarAusenciasSchema)) filtros: z.output<typeof listarAusenciasSchema>, @Req() req: SolicitudAutenticada): Promise<AusenciaItem[]> {
    return this.ausencias.listar(filtros, req.usuario!.id);
  }

  /** Personas a las que se puede registrar una ausencia. */
  @RequierePermiso('ausencias.crear')
  @Get('personas')
  async personas(): Promise<UsuarioResumen[]> {
    return this.prisma.usuario.findMany({
      where: { activo: true, eliminadoEn: null, roles: { some: { rol: { activo: true, codigo: { not: ROLES_BASE.ADMIN } } } } },
      orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }],
      select: { id: true, nombres: true, apellidos: true },
    });
  }

  @RequierePermiso('ausencias.solicitar')
  @Post('solicitar')
  solicitar(@Body(new ZodValidationPipe(solicitarAusenciaSchema)) datos: SolicitarAusenciaDatos, @Req() req: SolicitudAutenticada): Promise<AusenciaItem> {
    return this.ausencias.solicitar(datos, actor(req));
  }

  @RequierePermiso('ausencias.crear')
  @Post()
  registrar(@Body(new ZodValidationPipe(registrarAusenciaSchema)) datos: RegistrarAusenciaDatos, @Req() req: SolicitudAutenticada): Promise<AusenciaItem> {
    return this.ausencias.registrar(datos, actor(req));
  }

  @RequierePermiso('ausencias.aprobar')
  @Post(':id/aprobar')
  aprobar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resolverAusenciaSchema)) { observacion }: { observacion?: string },
    @Req() req: SolicitudAutenticada,
  ): Promise<AusenciaItem> {
    return this.ausencias.aprobar(id, observacion, actor(req));
  }

  @RequierePermiso('ausencias.aprobar')
  @Post(':id/rechazar')
  rechazar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rechazarAusenciaSchema)) { observacion }: { observacion: string },
    @Req() req: SolicitudAutenticada,
  ): Promise<AusenciaItem> {
    return this.ausencias.rechazar(id, observacion, actor(req));
  }

  @RequierePermiso('ausencias.ver')
  @Post(':id/anular')
  anular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resolverAusenciaSchema)) { observacion }: { observacion?: string },
    @Req() req: SolicitudAutenticada,
  ): Promise<AusenciaItem> {
    return this.ausencias.anular(id, observacion, actor(req));
  }
}
