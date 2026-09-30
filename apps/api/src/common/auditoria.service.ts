import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface RegistroAuditoria {
  usuarioId: string | null;
  /** crear, editar, eliminar, cambiar_etapa... */
  accion: string;
  entidad: string;
  entidadId?: string | null;
  antes?: unknown;
  despues?: unknown;
  ip?: string | null;
}

type ClienteTx = Pick<Prisma.TransactionClient, 'auditoria'>;

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra un cambio. Acepta un cliente de transacción para que quede en la misma transacción. */
  registrar(registro: RegistroAuditoria, tx: ClienteTx = this.prisma) {
    return tx.auditoria.create({
      data: {
        usuarioId: registro.usuarioId,
        accion: registro.accion,
        entidad: registro.entidad,
        entidadId: registro.entidadId ?? null,
        antes: registro.antes === undefined ? undefined : (JSON.parse(JSON.stringify(registro.antes)) as Prisma.InputJsonValue),
        despues: registro.despues === undefined ? undefined : (JSON.parse(JSON.stringify(registro.despues)) as Prisma.InputJsonValue),
        ip: registro.ip ?? null,
      },
    });
  }
}
