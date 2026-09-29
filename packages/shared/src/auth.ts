import { z } from 'zod';
import type { Alcance, PermisoCodigo } from './permisos.js';

export const loginSchema = z.object({
  email: z.email('Correo no válido').trim().toLowerCase(),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Permiso efectivo de un usuario: código y alcance (null si la acción no usa alcance). */
export type PermisosEfectivos = Partial<Record<PermisoCodigo, Alcance | null>>;

export interface ItemMenu {
  codigo: string;
  nombre: string;
  ruta: string | null;
  icono: string | null;
  hijos: ItemMenu[];
}

export interface UsuarioSesion {
  id: string;
  nombres: string;
  apellidos: string;
  email: string;
  roles: { codigo: string; nombre: string }[];
  permisos: PermisosEfectivos;
  menu: ItemMenu[];
}

export interface LoginRespuesta {
  accessToken: string;
  /** Segundos hasta que vence el access token. */
  expiraEn: number;
  usuario: UsuarioSesion;
}
