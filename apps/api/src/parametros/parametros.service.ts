import { BadRequestException, Injectable } from '@nestjs/common';
import { PARAMETROS, type ClaveParametro, type DefinicionParametro, type ParametroItem } from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const definicion = (clave: ClaveParametro): DefinicionParametro => PARAMETROS[clave];

/** Valores configurables del sistema (la lista y sus límites están en @grupoes/shared). */
@Injectable()
export class ParametrosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Valor actual o, si no está guardado, el de por defecto (null = vacío). */
  async valor(clave: ClaveParametro): Promise<number | null> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave } });
    if (fila && (typeof fila.valor === 'number' || fila.valor === null)) return fila.valor;
    return definicion(clave).porDefecto;
  }

  /** Para parámetros que siempre tienen valor. */
  async numero(clave: ClaveParametro): Promise<number> {
    return (await this.valor(clave)) ?? definicion(clave).porDefecto ?? 0;
  }

  async todos(): Promise<ParametroItem[]> {
    const claves = Object.keys(PARAMETROS) as ClaveParametro[];
    const filas = await this.prisma.parametro.findMany({ where: { clave: { in: claves } } });
    return claves.map((clave) => {
      const fila = filas.find((f) => f.clave === clave);
      const guardado = fila && (typeof fila.valor === 'number' || fila.valor === null);
      return { clave, ...definicion(clave), valor: guardado ? (fila.valor as number | null) : definicion(clave).porDefecto };
    });
  }

  /** Guarda varios valores validando cada uno contra su definición. */
  async guardar(valores: Record<string, number | null>, actor: { usuarioId: string; ip: string | null }): Promise<ParametroItem[]> {
    const errores: { campo: string; mensaje: string }[] = [];
    for (const [clave, valor] of Object.entries(valores)) {
      if (!(clave in PARAMETROS)) {
        errores.push({ campo: clave, mensaje: 'Parámetro desconocido' });
        continue;
      }
      const d = definicion(clave as ClaveParametro);
      if (valor === null && !d.opcional) errores.push({ campo: clave, mensaje: 'Este valor es obligatorio' });
      if (valor !== null && (valor < d.min || valor > d.max)) errores.push({ campo: clave, mensaje: `Entre ${d.min} y ${d.max}` });
    }
    if (errores.length) throw new BadRequestException({ message: 'Datos inválidos', errores });

    const antes = await this.todos();
    await this.prisma.$transaction(async (tx) => {
      for (const [clave, valor] of Object.entries(valores)) {
        const d = definicion(clave as ClaveParametro);
        await tx.parametro.upsert({
          where: { clave },
          create: { clave, valor: valor as number, descripcion: d.descripcion },
          update: { valor: valor as number, descripcion: d.descripcion },
        });
      }
      await this.auditoria.registrar(
        { usuarioId: actor.usuarioId, accion: 'editar', entidad: 'parametro', antes: Object.fromEntries(antes.map((p) => [p.clave, p.valor])), despues: valores, ip: actor.ip },
        tx,
      );
    });
    return this.todos();
  }
}
