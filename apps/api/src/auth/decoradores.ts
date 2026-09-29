import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { SolicitudAutenticada, UsuarioToken } from './tipos.js';

export const PUBLICO_KEY = 'publico';

/** Marca un endpoint como accesible sin iniciar sesión. */
export const Publico = () => SetMetadata(PUBLICO_KEY, true);

/** Inyecta el usuario autenticado. */
export const UsuarioActual = createParamDecorator((_: unknown, ctx: ExecutionContext): UsuarioToken => {
  const req = ctx.switchToHttp().getRequest<SolicitudAutenticada>();
  return req.usuario!;
});
