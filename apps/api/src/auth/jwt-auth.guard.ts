import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PUBLICO_KEY } from './decoradores.js';
import type { PayloadAccessToken, SolicitudAutenticada } from './tipos.js';

/** Guard global: exige un access token válido salvo en endpoints marcados con @Publico(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(PUBLICO_KEY, [context.getHandler(), context.getClass()]);
    if (esPublico) return true;

    const req = context.switchToHttp().getRequest<SolicitudAutenticada>();
    const [tipo, token] = req.headers.authorization?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException('Sesión no iniciada');

    try {
      const payload = await this.jwt.verifyAsync<PayloadAccessToken>(token);
      req.usuario = { id: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException('Sesión expirada');
    }
  }
}
