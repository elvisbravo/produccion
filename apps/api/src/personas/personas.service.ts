import { ConflictException, Injectable } from '@nestjs/common';
import {
  NOMBRE_TIPO_DOCUMENTO,
  formatearCelular,
  type CoincidenciaPersona,
  type ContactoDatos,
  type PersonaResumen,
} from '@grupoes/shared';
import { contieneDigitos, contieneTodas, digitosDe, palabrasDe } from '../common/busqueda.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const CAMPOS_PERSONA = {
  id: true,
  celular: true,
  nombres: true,
  apellidos: true,
  email: true,
  tipoDocumento: true,
  numeroDocumento: true,
} as const satisfies Prisma.PersonaSelect;

@Injectable()
export class PersonasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Busca por celular para avisar de duplicados al registrar un contacto. */
  async porCelular(celular: string): Promise<CoincidenciaPersona | null> {
    const persona = await this.prisma.persona.findFirst({
      where: { celular, eliminadoEn: null },
      select: {
        ...CAMPOS_PERSONA,
        prospectos: {
          where: { prospecto: { eliminadoEn: null } },
          orderBy: { prospecto: { creadoEn: 'desc' } },
          take: 5,
          select: {
            prospecto: {
              select: { id: true, codigo: true, etapa: { select: { nombre: true, clase: true } }, tipoTrabajo: { select: { nombre: true } } },
            },
          },
        },
      },
    });
    if (!persona) return null;

    const { prospectos, ...datos } = persona;
    return {
      persona: datos,
      prospectos: prospectos.map(({ prospecto: p }) => ({
        id: p.id,
        codigo: p.codigo,
        etapa: p.etapa.nombre,
        abierto: p.etapa.clase === 'abierta',
        tipoTrabajo: p.tipoTrabajo.nombre,
      })),
    };
  }

  /** Búsqueda por nombre (sin distinguir tildes), celular o documento, para el campo "referido por". */
  async buscar(q: string, limite = 10): Promise<PersonaResumen[]> {
    const digitos = digitosDe(q);
    const ids = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM persona
      WHERE eliminado_en IS NULL AND (
        ${contieneTodas([Prisma.sql`nombres`, Prisma.sql`apellidos`], palabrasDe(q))}
        OR ${contieneDigitos(Prisma.sql`celular`, digitos)}
        OR ${contieneDigitos(Prisma.sql`numero_documento`, digitos)}
      )
      LIMIT ${limite}`;
    return this.prisma.persona.findMany({
      where: { id: { in: ids.map((f) => f.id) } },
      orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
      select: CAMPOS_PERSONA,
    });
  }

  /**
   * Crea la persona o reutiliza la existente con ese celular. Los datos nuevos
   * completan o corrigen los existentes; un campo vacío no borra lo que ya había.
   */
  async resolver(tx: Prisma.TransactionClient, contacto: ContactoDatos, usuarioId: string): Promise<{ id: string }> {
    const { celular, nombres, apellidos, email, tipoDocumento, numeroDocumento } = contacto;

    if (tipoDocumento && numeroDocumento) {
      const duenio = await tx.persona.findFirst({
        where: { tipoDocumento, numeroDocumento, celular: { not: celular } },
        select: { celular: true },
      });
      if (duenio) {
        throw new ConflictException(
          `El ${NOMBRE_TIPO_DOCUMENTO[tipoDocumento]} ${numeroDocumento} ya pertenece a otra persona (celular ${formatearCelular(duenio.celular)})`,
        );
      }
    }

    const cambios = {
      ...(nombres && { nombres }),
      ...(apellidos && { apellidos }),
      ...(email && { email }),
      ...(tipoDocumento && numeroDocumento && { tipoDocumento, numeroDocumento }),
    };

    return tx.persona.upsert({
      where: { celular },
      create: { celular, ...cambios, creadoPor: usuarioId },
      update: { ...cambios, eliminadoEn: null, actualizadoPor: usuarioId },
      select: { id: true },
    });
  }
}
