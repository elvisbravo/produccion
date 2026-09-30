import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { nuevoCatalogoSchema, type CatalogosProspecto, type Opcion } from '@grupoes/shared';
import { z } from 'zod';
import { UsuarioActual } from '../auth/decoradores.js';
import type { UsuarioToken } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { CatalogosService } from './catalogos.service.js';

const busquedaSchema = z.object({
  q: z.string().trim().max(100).optional(),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});

@Controller('catalogos')
export class CatalogosController {
  constructor(private readonly catalogos: CatalogosService) {}

  /** Todas las listas cortas que usa el formulario del prospecto. */
  @RequierePermiso('prospectos.ver')
  @Get('prospecto')
  prospecto(): Promise<CatalogosProspecto> {
    return this.catalogos.paraProspecto();
  }

  @RequierePermiso('prospectos.ver')
  @Get('universidades')
  universidades(@Query(new ZodValidationPipe(busquedaSchema)) { q, limite }: z.output<typeof busquedaSchema>): Promise<Opcion[]> {
    return this.catalogos.buscar('universidad', q, limite);
  }

  @RequierePermiso('prospectos.crear')
  @Post('universidades')
  crearUniversidad(@Body(new ZodValidationPipe(nuevoCatalogoSchema)) { nombre }: { nombre: string }, @UsuarioActual() u: UsuarioToken) {
    return this.catalogos.crearSiNoExiste('universidad', nombre, u.id);
  }

  @RequierePermiso('prospectos.ver')
  @Get('carreras')
  carreras(@Query(new ZodValidationPipe(busquedaSchema)) { q, limite }: z.output<typeof busquedaSchema>): Promise<Opcion[]> {
    return this.catalogos.buscar('carrera', q, limite);
  }

  @RequierePermiso('prospectos.crear')
  @Post('carreras')
  crearCarrera(@Body(new ZodValidationPipe(nuevoCatalogoSchema)) { nombre }: { nombre: string }, @UsuarioActual() u: UsuarioToken) {
    return this.catalogos.crearSiNoExiste('carrera', nombre, u.id);
  }
}
