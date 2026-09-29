import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Valores por defecto si el parámetro aún no está en la base de datos. */
export const PARAMETROS_POR_DEFECTO = {
  'seguridad.intentos_login_max': { valor: 5, descripcion: 'Intentos fallidos antes de bloquear la cuenta' },
  'seguridad.bloqueo_minutos': { valor: 15, descripcion: 'Minutos que dura el bloqueo por intentos fallidos' },
  'seguridad.inactividad_minutos': { valor: 30, descripcion: 'Minutos sin actividad antes de cerrar la sesión' },
  'prospectos.intentos_sin_respuesta': { valor: 3, descripcion: 'Intentos sin respuesta antes de sugerir marcar como perdido' },
} as const;

export type ClaveParametro = keyof typeof PARAMETROS_POR_DEFECTO;

@Injectable()
export class ParametrosService {
  constructor(private readonly prisma: PrismaService) {}

  async numero(clave: ClaveParametro): Promise<number> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave } });
    const valor = fila?.valor;
    return typeof valor === 'number' ? valor : PARAMETROS_POR_DEFECTO[clave].valor;
  }
}
