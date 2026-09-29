import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { LoginInput, LoginRespuesta, UsuarioSesion } from '@grupoes/shared';
import type { InfoCliente } from '../common/cliente.js';
import type { Env } from '../config/env.js';
import { ParametrosService } from '../parametros/parametros.service.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { obtenerHashRelleno, verificarPassword } from './password.js';
import type { PayloadAccessToken } from './tipos.js';

const CREDENCIALES_INVALIDAS = 'Correo o contraseña incorrectos';

export interface ResultadoSesion {
  respuesta: LoginRespuesta;
  refreshToken: string;
  refreshExpira: Date;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly permisos: PermisosService,
    private readonly parametros: ParametrosService,
  ) {}

  async login({ email, password }: LoginInput, cliente: InfoCliente): Promise<ResultadoSesion> {
    const usuario = await this.prisma.usuario.findFirst({ where: { email, eliminadoEn: null } });
    const registrar = (resultado: 'exito' | 'fallo' | 'bloqueado') =>
      this.prisma.accesoLog.create({ data: { usuarioId: usuario?.id ?? null, emailIntento: email, resultado, ...cliente } });

    if (!usuario) {
      await verificarPassword(await obtenerHashRelleno(), password);
      await registrar('fallo');
      throw new UnauthorizedException(CREDENCIALES_INVALIDAS);
    }

    if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
      await registrar('bloqueado');
      const minutos = Math.ceil((usuario.bloqueadoHasta.getTime() - Date.now()) / 60_000);
      throw new UnauthorizedException(`Cuenta bloqueada por intentos fallidos. Intenta de nuevo en ${minutos} min.`);
    }

    const valida = await verificarPassword(usuario.passwordHash, password);
    if (!valida || !usuario.activo) {
      await this.registrarFallo(usuario.id, usuario.intentosFallidos);
      await registrar('fallo');
      throw new UnauthorizedException(usuario.activo ? CREDENCIALES_INVALIDAS : 'Usuario desactivado');
    }

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoAcceso: new Date() },
    });
    await registrar('exito');

    return this.emitirSesion(usuario.id, cliente);
  }

  /** Rota el refresh token: revoca el actual y emite uno nuevo. */
  async refrescar(refreshToken: string | undefined, cliente: InfoCliente): Promise<ResultadoSesion> {
    if (!refreshToken) throw new UnauthorizedException('Sesión no iniciada');

    const sesion = await this.prisma.sesion.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { usuario: { select: { activo: true, eliminadoEn: true } } },
    });
    if (!sesion) throw new UnauthorizedException('Sesión no válida');

    // Un token ya revocado que vuelve a usarse indica robo: se cierran todas las sesiones del usuario.
    if (sesion.revocadaEn) {
      await this.prisma.sesion.updateMany({ where: { usuarioId: sesion.usuarioId, revocadaEn: null }, data: { revocadaEn: new Date() } });
      throw new UnauthorizedException('Sesión no válida');
    }
    if (sesion.expiraEn < new Date() || !sesion.usuario.activo || sesion.usuario.eliminadoEn) {
      throw new UnauthorizedException('Sesión expirada');
    }

    await this.prisma.sesion.update({ where: { id: sesion.id }, data: { revocadaEn: new Date() } });
    return this.emitirSesion(sesion.usuarioId, cliente);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.sesion.updateMany({
      where: { tokenHash: hashToken(refreshToken), revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
  }

  async usuarioSesion(usuarioId: string): Promise<UsuarioSesion> {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id: usuarioId, activo: true, eliminadoEn: null },
      include: { roles: { include: { rol: { select: { codigo: true, nombre: true, activo: true } } } } },
    });
    if (!usuario) throw new UnauthorizedException('Usuario no disponible');

    const permisos = await this.permisos.efectivos(usuario.id);
    return {
      id: usuario.id,
      nombres: usuario.nombres,
      apellidos: usuario.apellidos,
      email: usuario.email,
      roles: usuario.roles.filter((r) => r.rol.activo).map((r) => ({ codigo: r.rol.codigo, nombre: r.rol.nombre })),
      permisos,
      menu: await this.permisos.menu(permisos),
    };
  }

  private async registrarFallo(usuarioId: string, intentosPrevios: number) {
    const max = await this.parametros.numero('seguridad.intentos_login_max');
    const intentos = intentosPrevios + 1;

    if (intentos >= max) {
      const minutos = await this.parametros.numero('seguridad.bloqueo_minutos');
      await this.prisma.usuario.update({
        where: { id: usuarioId },
        data: { intentosFallidos: 0, bloqueadoHasta: new Date(Date.now() + minutos * 60_000) },
      });
    } else {
      await this.prisma.usuario.update({ where: { id: usuarioId }, data: { intentosFallidos: intentos } });
    }
  }

  private async emitirSesion(usuarioId: string, cliente: InfoCliente): Promise<ResultadoSesion> {
    const ttlAccess = this.config.get('JWT_ACCESS_TTL_SEGUNDOS', { infer: true });
    const ttlRefreshDias = this.config.get('REFRESH_TTL_DIAS', { infer: true });

    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpira = new Date(Date.now() + ttlRefreshDias * 86_400_000);
    await this.prisma.sesion.create({
      data: { usuarioId, tokenHash: hashToken(refreshToken), expiraEn: refreshExpira, ...cliente },
    });

    const payload: PayloadAccessToken = { sub: usuarioId };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: ttlAccess });

    return {
      respuesta: { accessToken, expiraEn: ttlAccess, usuario: await this.usuarioSesion(usuarioId) },
      refreshToken,
      refreshExpira,
    };
  }
}
