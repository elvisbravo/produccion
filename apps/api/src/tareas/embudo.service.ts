import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

type MomentoEvento = 'al_programar' | 'al_completar';

export interface CambioEtapa {
  prospectoId: string;
  etapaId: string;
  motivoPerdidaId?: string;
  usuarioId: string;
  /** Permisos del usuario para cerrar como perdido y reactivar. */
  puedeMarcarPerdido: boolean;
  puedeReactivar: boolean;
}

/**
 * Reglas automáticas del embudo: una etapa puede estar ligada a una actividad y a un
 * momento (al programarla o al completarla). El prospecto solo avanza, nunca retrocede,
 * y no se mueve si ya está convertido o perdido.
 */
@Injectable()
export class EmbudoService {
  async alOcurrir(
    tx: Prisma.TransactionClient,
    prospectoId: string,
    actividadId: string,
    momento: MomentoEvento,
    usuarioId: string,
  ): Promise<void> {
    const destino = await tx.etapaProspecto.findFirst({
      where: { actividadEventoId: actividadId, momentoEvento: momento, activa: true },
    });
    if (!destino) return;

    const prospecto = await tx.prospecto.findUniqueOrThrow({ where: { id: prospectoId }, include: { etapa: true } });
    if (prospecto.etapa.clase !== 'abierta' || prospecto.etapa.orden >= destino.orden) return;

    await tx.prospecto.update({
      where: { id: prospectoId },
      data: {
        etapaId: destino.id,
        eventos: {
          create: {
            tipo: 'cambio_etapa',
            detalle: `Pasó de "${prospecto.etapa.nombre}" a "${destino.nombre}" automáticamente`,
            datos: { desde: prospecto.etapaId, hacia: destino.id, automatico: true },
            usuarioId,
          },
        },
      },
    });
  }

  /** Cambio manual de etapa (arrastrar en el kanban, marcar perdido, reactivar). */
  async cambiar(tx: Prisma.TransactionClient, c: CambioEtapa): Promise<void> {
    const prospecto = await tx.prospecto.findFirst({ where: { id: c.prospectoId, eliminadoEn: null }, include: { etapa: true } });
    if (!prospecto) throw new NotFoundException('Prospecto no encontrado');
    if (prospecto.etapaId === c.etapaId) return;

    const destino = await tx.etapaProspecto.findFirst({ where: { id: c.etapaId, activa: true } });
    if (!destino) throw new BadRequestException('Etapa no disponible');
    if (destino.clase === 'ganada') {
      throw new BadRequestException('Un prospecto pasa a "Convertido" cuando firma el contrato (desde el módulo de trabajos).');
    }
    if (prospecto.etapa.clase === 'ganada') throw new BadRequestException('El prospecto ya se convirtió en cliente');

    const reactivando = prospecto.etapa.clase === 'perdida';
    if (reactivando && !c.puedeReactivar) throw new ForbiddenException('No tienes permiso para reactivar prospectos');

    let detalle = `Pasó de "${prospecto.etapa.nombre}" a "${destino.nombre}"`;
    const datos: Prisma.ProspectoUpdateInput = { etapa: { connect: { id: destino.id } }, actualizadoPor: c.usuarioId };

    if (destino.clase === 'perdida') {
      if (!c.puedeMarcarPerdido) throw new ForbiddenException('No tienes permiso para marcar prospectos como perdidos');
      if (!c.motivoPerdidaId) throw new BadRequestException({ message: 'Datos inválidos', errores: [{ campo: 'motivoPerdidaId', mensaje: 'Elige el motivo' }] });
      const motivo = await tx.motivoPerdida.findFirst({ where: { id: c.motivoPerdidaId, activo: true } });
      if (!motivo) throw new BadRequestException('Motivo de pérdida no disponible');
      datos.motivoPerdida = { connect: { id: motivo.id } };
      detalle += ` · Motivo: ${motivo.nombre}`;
      // Sus actividades pendientes ya no aplican.
      await tx.tarea.updateMany({
        where: { prospectoId: prospecto.id, estado: { in: ['por_asignar', 'pendiente', 'en_proceso'] } },
        data: { estado: 'cancelada', motivoCancelacion: 'El prospecto se marcó como perdido' },
      });
    } else if (reactivando) {
      datos.motivoPerdida = { disconnect: true };
      datos.intentosSinRespuesta = 0;
      detalle = `Reactivado: pasó de "${prospecto.etapa.nombre}" a "${destino.nombre}"`;
    }

    await tx.prospecto.update({
      where: { id: prospecto.id },
      data: {
        ...datos,
        eventos: {
          create: { tipo: 'cambio_etapa', detalle, datos: { desde: prospecto.etapaId, hacia: destino.id }, usuarioId: c.usuarioId },
        },
      },
    });
  }
}
