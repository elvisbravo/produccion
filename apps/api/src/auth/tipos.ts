import type { Request } from 'express';
import type { Alcance } from '@grupoes/shared';

export interface UsuarioToken {
  id: string;
}

export interface SolicitudAutenticada extends Request {
  usuario?: UsuarioToken;
  /** Alcance del permiso exigido por el endpoint (lo coloca PermisosGuard). */
  alcance?: Alcance | null;
}

export interface PayloadAccessToken {
  sub: string;
}
