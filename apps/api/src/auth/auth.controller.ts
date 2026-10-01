import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { cambiarClaveSchema, loginSchema, type LoginInput, type LoginRespuesta, type UsuarioSesion } from '@grupoes/shared';
import { infoCliente } from '../common/cliente.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Env } from '../config/env.js';
import { AuthService, type ResultadoSesion } from './auth.service.js';
import { Publico, UsuarioActual } from './decoradores.js';
import type { UsuarioToken } from './tipos.js';

const COOKIE_REFRESH = 'ges_rt';
const RUTA_COOKIE = '/api/auth';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Publico()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) datos: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginRespuesta> {
    return this.responder(await this.auth.login(datos, infoCliente(req)), res);
  }

  @Publico()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginRespuesta> {
    try {
      return this.responder(await this.auth.refrescar(req.cookies?.[COOKIE_REFRESH], infoCliente(req)), res);
    } catch (error) {
      res.clearCookie(COOKIE_REFRESH, { path: RUTA_COOKIE });
      throw error;
    }
  }

  @Publico()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[COOKIE_REFRESH]);
    res.clearCookie(COOKIE_REFRESH, { path: RUTA_COOKIE });
  }

  /** Cualquier usuario cambia su propia contraseña (obligatorio si debe cambiarla). */
  @Post('cambiar-clave')
  @HttpCode(204)
  cambiarClave(
    @Body(new ZodValidationPipe(cambiarClaveSchema)) datos: { actual: string; nueva: string },
    @UsuarioActual() usuario: UsuarioToken,
    @Req() req: Request,
  ): Promise<void> {
    return this.auth.cambiarClave(usuario.id, datos.actual, datos.nueva, req.cookies?.[COOKIE_REFRESH]);
  }

  @Get('me')
  me(@UsuarioActual() usuario: UsuarioToken): Promise<UsuarioSesion> {
    return this.auth.usuarioSesion(usuario.id);
  }

  /** El refresh token viaja solo en una cookie httpOnly, nunca en el cuerpo de la respuesta. */
  private responder({ respuesta, refreshToken, refreshExpira }: ResultadoSesion, res: Response): LoginRespuesta {
    res.cookie(COOKIE_REFRESH, refreshToken, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'strict',
      path: RUTA_COOKIE,
      expires: refreshExpira,
    });
    return respuesta;
  }
}
