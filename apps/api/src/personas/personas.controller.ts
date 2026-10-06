import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { normalizarCelular, type CoincidenciaPersona, type PersonaResumen } from '@grupoes/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequierePermiso } from '../permisos/requiere-permiso.decorator.js';
import { PersonasService } from './personas.service.js';

const busquedaSchema = z.object({
  q: z.string().trim().min(2, 'Escribe al menos 2 caracteres').max(100),
  /** Solo quienes ya son clientes (tienen algún trabajo). */
  clientes: z.enum(['1']).optional(),
});

@Controller('personas')
export class PersonasController {
  constructor(private readonly personas: PersonasService) {}

  /** Coincidencia por celular (null si no existe). Se usa para avisar de duplicados. */
  @RequierePermiso('prospectos.ver')
  @Get('por-celular/:celular')
  async porCelular(@Param('celular') celular: string): Promise<{ coincidencia: CoincidenciaPersona | null }> {
    const normalizado = normalizarCelular(celular);
    if (!normalizado) throw new BadRequestException('Celular no válido');
    return { coincidencia: await this.personas.porCelular(normalizado) };
  }

  @RequierePermiso('prospectos.ver')
  @Get()
  buscar(@Query(new ZodValidationPipe(busquedaSchema)) { q, clientes }: z.output<typeof busquedaSchema>): Promise<PersonaResumen[]> {
    return this.personas.buscar(q, 10, clientes === '1');
  }

  /** Ficha de un cliente (persona con trabajos). */
  @RequierePermiso('trabajos.ver')
  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string): Promise<PersonaResumen> {
    return this.personas.obtener(id);
  }
}
