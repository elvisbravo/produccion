import { Injectable } from '@nestjs/common';
import { diaEnLima, ESTADOS_ACTIVOS, type Alcance, type TableroSeguimiento } from '@grupoes/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { CAMPOS_PERSONA } from '../personas/personas.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { estaVencida } from '../tareas/mapeo.js';

@Injectable()
export class SeguimientoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Prospectos abiertos con su próximo paso (la tarea activa más cercana).
   * Con alcance "propios", solo los que tiene a cargo.
   */
  async tablero(usuarioId: string, alcance: Alcance | null): Promise<TableroSeguimiento> {
    const where: Prisma.ProspectoWhereInput = {
      eliminadoEn: null,
      etapa: { clase: 'abierta' },
      ...(alcance !== 'todos' && { responsableId: usuarioId }),
    };
    const [etapas, prospectos] = await Promise.all([
      this.prisma.etapaProspecto.findMany({
        where: { activa: true },
        orderBy: { orden: 'asc' },
        select: { id: true, nombre: true, color: true, clase: true, orden: true },
      }),
      this.prisma.prospecto.findMany({
        where,
        orderBy: { creadoEn: 'desc' },
        take: 1000,
        include: {
          tipoTrabajo: { select: { nombre: true } },
          nivelAcademico: { select: { nombre: true } },
          universidad: { select: { nombre: true, siglas: true } },
          carrera: { select: { nombre: true } },
          responsable: { select: { id: true, nombres: true, apellidos: true } },
          contactos: { orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }], select: { persona: { select: CAMPOS_PERSONA } } },
          tareas: {
            where: { estado: { in: [...ESTADOS_ACTIVOS] } },
            orderBy: [{ fecha: 'asc' }, { inicio: 'asc' }],
            take: 1,
            include: {
              actividad: { include: { tipo: { select: { comportamiento: true } } } },
              responsables: { select: { usuario: { select: { nombres: true, apellidos: true } } } },
            },
          },
        },
      }),
    ]);

    const ahora = new Date();
    return {
      etapas,
      hoy: diaEnLima(ahora),
      prospectos: prospectos.map((p) => {
        const t = p.tareas[0];
        return {
          id: p.id,
          codigo: p.codigo,
          tipoTrabajo: p.tipoTrabajo.nombre,
          nivelAcademico: p.nivelAcademico?.nombre ?? null,
          universidad: p.universidad ? (p.universidad.siglas ?? p.universidad.nombre) : null,
          carrera: p.carrera?.nombre ?? null,
          titulo: p.titulo,
          temperatura: p.temperatura,
          contactoPrincipal: p.contactos[0]?.persona ?? null,
          totalContactos: p.contactos.length,
          intentosSinRespuesta: p.intentosSinRespuesta,
          responsable: p.responsable,
          etapaId: p.etapaId,
          proxima: t
            ? {
                tareaId: t.id,
                actividad: t.actividad.nombre,
                comportamiento: t.actividad.tipo.comportamiento,
                fecha: t.fecha.toISOString().slice(0, 10),
                inicio: t.inicio?.toISOString() ?? null,
                estado: t.estado,
                vencida: estaVencida(t, ahora),
                responsables: t.responsables.map((r) => `${r.usuario.nombres} ${r.usuario.apellidos}`),
              }
            : null,
        };
      }),
    };
  }
}
