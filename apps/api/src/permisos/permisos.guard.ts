import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermisoCodigo } from '@grupoes/shared';
import type { SolicitudAutenticada } from '../auth/tipos.js';
import { PermisosService } from './permisos.service.js';
import { PERMISO_KEY } from './requiere-permiso.decorator.js';

@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permisos: PermisosService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requerido = this.reflector.getAllAndOverride<PermisoCodigo | undefined>(PERMISO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requerido) return true;

    const req = context.switchToHttp().getRequest<SolicitudAutenticada>();
    if (!req.usuario) throw new ForbiddenException('No tienes permiso para esta acción');

    const efectivos = await this.permisos.efectivos(req.usuario.id);
    if (!(requerido in efectivos)) throw new ForbiddenException('No tienes permiso para esta acción');

    req.alcance = efectivos[requerido] ?? null;
    return true;
  }
}
