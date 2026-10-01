import { ForbiddenException, Controller, Get, Param, Req } from '@nestjs/common';
import { dniSchema, type PermisoCodigo, type ResultadoConsultaDni } from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { ConsultaDniService } from './consulta-dni.service.js';

/** Quienes registran personas con documento: usuarios, prospectos y clientes. */
const PERMISOS_CONSULTA: PermisoCodigo[] = ['usuarios.crear', 'usuarios.editar', 'prospectos.crear', 'prospectos.editar', 'prospectos.convertir'];

@Controller('consultas')
export class ConsultasController {
  constructor(
    private readonly dni: ConsultaDniService,
    private readonly permisos: PermisosService,
  ) {}

  /** Siempre responde 200 con un estado: que el servicio externo falle no debe frenar el formulario. */
  @Get('dni/:dni')
  async consultarDni(@Param('dni', new ZodValidationPipe(dniSchema)) dni: string, @Req() req: SolicitudAutenticada): Promise<ResultadoConsultaDni> {
    const efectivos = await this.permisos.efectivos(req.usuario!.id);
    if (!PERMISOS_CONSULTA.some((p) => p in efectivos)) throw new ForbiddenException('No tienes permiso para consultar DNI');
    return this.dni.consultar(dni, { usuarioId: req.usuario!.id, ip: req.ip ?? null });
  }
}
