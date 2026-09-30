import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  diaEnLima,
  horaAMinutos,
  horaEnLima,
  minutosAHora,
  NOMBRE_TIPO_AUSENCIA,
  sumarDias,
  TIPOS_AUSENCIA_SOLICITABLES,
  type AusenciaItem,
  type RegistrarAusenciaDatos,
  type SolicitarAusenciaDatos,
  type TareaAfectada,
  type TipoAusencia,
} from '@grupoes/shared';
import type { z } from 'zod';
import type { listarAusenciasSchema } from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ActorAusencia {
  usuarioId: string;
  ip: string | null;
}

const soloFecha = (d: Date) => d.toISOString().slice(0, 10);
const aFecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const CAMPOS_USUARIO = { id: true, nombres: true, apellidos: true } as const;
const INCLUIR = {
  usuario: { select: CAMPOS_USUARIO },
  solicitadaPor: { select: CAMPOS_USUARIO },
  resueltaPor: { select: CAMPOS_USUARIO },
} as const satisfies Prisma.AusenciaInclude;
type AusenciaCompleta = Prisma.AusenciaGetPayload<{ include: typeof INCLUIR }>;

const errorCampo = (campo: string, mensaje: string) => new BadRequestException({ message: 'Datos inválidos', errores: [{ campo, mensaje }] });

@Injectable()
export class AusenciasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(filtros: z.output<typeof listarAusenciasSchema>, usuarioId: string): Promise<AusenciaItem[]> {
    const efectivos = await this.permisos.efectivos(usuarioId);
    const soloPropias = efectivos['ausencias.ver'] === 'propios' || efectivos['ausencias.ver'] === 'equipo';
    const filas = await this.prisma.ausencia.findMany({
      where: {
        usuarioId: soloPropias ? usuarioId : filtros.usuarioId,
        estado: filtros.estado,
        fechaHasta: { gte: aFecha(filtros.desde ?? sumarDias(diaEnLima(), -30)) },
      },
      include: INCLUIR,
      orderBy: [{ fechaDesde: 'asc' }, { solicitadaEn: 'asc' }],
      take: 300,
    });
    return this.aItems(filas);
  }

  private async obtener(id: string): Promise<AusenciaCompleta> {
    const a = await this.prisma.ausencia.findUnique({ where: { id }, include: INCLUIR });
    if (!a) throw new NotFoundException('Ausencia no encontrada');
    return a;
  }

  private async item(id: string): Promise<AusenciaItem> {
    return (await this.aItems([await this.obtener(id)]))[0];
  }

  /** La persona pide vacaciones, un permiso u otra ausencia; la aprueba el administrador. */
  async solicitar(datos: SolicitarAusenciaDatos, actor: ActorAusencia): Promise<AusenciaItem> {
    if (!(TIPOS_AUSENCIA_SOLICITABLES as readonly string[]).includes(datos.tipo)) {
      throw errorCampo('tipo', 'El descanso médico lo registra producción o el administrador');
    }
    if (datos.fechaDesde < diaEnLima()) throw errorCampo('fechaDesde', 'No se puede solicitar para días pasados');
    return this.crear(actor.usuarioId, datos, 'solicitada', actor);
  }

  /**
   * Registro directo (ya aprobado). El descanso médico lo registra quien tenga "ausencias.crear";
   * los demás tipos, solo quien puede aprobar.
   */
  async registrar(datos: RegistrarAusenciaDatos, actor: ActorAusencia): Promise<AusenciaItem> {
    const efectivos = await this.permisos.efectivos(actor.usuarioId);
    if (datos.tipo !== 'descanso_medico' && !('ausencias.aprobar' in efectivos)) {
      throw new ForbiddenException('Solo quien aprueba ausencias puede registrar vacaciones o permisos; la persona debe solicitarlos');
    }
    const usuario = await this.prisma.usuario.findFirst({ where: { id: datos.usuarioId, activo: true, eliminadoEn: null } });
    if (!usuario) throw errorCampo('usuarioId', 'Usuario no disponible');
    return this.crear(datos.usuarioId, datos, 'aprobada', actor);
  }

  private async crear(usuarioId: string, datos: SolicitarAusenciaDatos, estado: 'solicitada' | 'aprobada', actor: ActorAusencia) {
    const minutoDesde = datos.horaDesde ? horaAMinutos(datos.horaDesde) : null;
    const minutoHasta = datos.horaHasta ? horaAMinutos(datos.horaHasta) : null;
    await this.verificarCruce(usuarioId, { fechaDesde: datos.fechaDesde, fechaHasta: datos.fechaHasta, minutoDesde, minutoHasta });
    const creada = await this.prisma.$transaction(async (tx) => {
      const a = await tx.ausencia.create({
        data: {
          usuarioId,
          tipo: datos.tipo,
          fechaDesde: aFecha(datos.fechaDesde),
          fechaHasta: aFecha(datos.fechaHasta),
          minutoDesde,
          minutoHasta,
          motivo: datos.motivo ?? null,
          estado,
          solicitadaPorId: actor.usuarioId,
          ...(estado === 'aprobada' && { resueltaPorId: actor.usuarioId, resueltaEn: new Date() }),
        },
      });
      await this.auditoria.registrar(
        { usuarioId: actor.usuarioId, accion: estado === 'aprobada' ? 'registrar' : 'solicitar', entidad: 'ausencia', entidadId: a.id, despues: datos, ip: actor.ip },
        tx,
      );
      return a;
    });
    return this.item(creada.id);
  }

  /** No se permiten dos ausencias vigentes que se crucen (dos permisos por horas del mismo día sí, si no se tocan). */
  private async verificarCruce(
    usuarioId: string,
    a: { fechaDesde: string; fechaHasta: string; minutoDesde: number | null; minutoHasta: number | null },
    excluirId?: string,
  ) {
    const otras = await this.prisma.ausencia.findMany({
      where: {
        usuarioId,
        estado: { in: ['solicitada', 'aprobada'] },
        fechaDesde: { lte: aFecha(a.fechaHasta) },
        fechaHasta: { gte: aFecha(a.fechaDesde) },
        ...(excluirId && { id: { not: excluirId } }),
      },
    });
    const cruce = otras.find(
      (o) =>
        a.minutoDesde === null ||
        o.minutoDesde === null ||
        (a.minutoDesde < o.minutoHasta! && o.minutoDesde < a.minutoHasta!),
    );
    if (cruce) {
      throw new ConflictException(
        `Se cruza con ${NOMBRE_TIPO_AUSENCIA[cruce.tipo].toLowerCase()} ${cruce.estado === 'solicitada' ? 'por aprobar ' : ''}del ${soloFecha(cruce.fechaDesde)} al ${soloFecha(cruce.fechaHasta)}`,
      );
    }
  }

  async aprobar(id: string, observacion: string | undefined, actor: ActorAusencia): Promise<AusenciaItem> {
    const a = await this.obtener(id);
    if (a.estado !== 'solicitada') throw new BadRequestException('Solo se aprueban solicitudes pendientes');
    await this.verificarCruce(
      a.usuarioId,
      { fechaDesde: soloFecha(a.fechaDesde), fechaHasta: soloFecha(a.fechaHasta), minutoDesde: a.minutoDesde, minutoHasta: a.minutoHasta },
      a.id,
    );
    return this.resolver(a, 'aprobada', observacion, actor);
  }

  async rechazar(id: string, observacion: string, actor: ActorAusencia): Promise<AusenciaItem> {
    const a = await this.obtener(id);
    if (a.estado !== 'solicitada') throw new BadRequestException('Solo se rechazan solicitudes pendientes');
    return this.resolver(a, 'rechazada', observacion, actor);
  }

  /**
   * Anula una ausencia: el solicitante, mientras está por aprobar; quien aprueba, siempre;
   * y quien registra descansos médicos, los descansos médicos.
   */
  async anular(id: string, observacion: string | undefined, actor: ActorAusencia): Promise<AusenciaItem> {
    const a = await this.obtener(id);
    if (a.estado !== 'solicitada' && a.estado !== 'aprobada') throw new BadRequestException('La ausencia ya está cerrada');
    const efectivos = await this.permisos.efectivos(actor.usuarioId);
    const puede =
      'ausencias.aprobar' in efectivos ||
      (a.estado === 'solicitada' && a.solicitadaPorId === actor.usuarioId) ||
      (a.tipo === 'descanso_medico' && 'ausencias.crear' in efectivos);
    if (!puede) throw new ForbiddenException('No puedes anular esta ausencia');
    return this.resolver(a, 'anulada', observacion, actor);
  }

  private async resolver(a: AusenciaCompleta, estado: 'aprobada' | 'rechazada' | 'anulada', observacion: string | undefined, actor: ActorAusencia) {
    await this.prisma.$transaction(async (tx) => {
      await tx.ausencia.update({
        where: { id: a.id },
        data: { estado, resueltaPorId: actor.usuarioId, resueltaEn: new Date(), observacion: observacion ?? a.observacion },
      });
      await this.auditoria.registrar(
        { usuarioId: actor.usuarioId, accion: estado, entidad: 'ausencia', entidadId: a.id, antes: { estado: a.estado }, despues: { estado, observacion }, ip: actor.ip },
        tx,
      );
    });
    return this.item(a.id);
  }

  // ─── Mapeo ───────────────────────────────────────────────

  private async aItems(filas: AusenciaCompleta[]): Promise<AusenciaItem[]> {
    const vigentes = filas.filter((a) => a.estado === 'solicitada' || a.estado === 'aprobada');
    const tareas = vigentes.length
      ? await this.prisma.tareaResponsable.findMany({
          where: {
            OR: vigentes.map((a) => ({ usuarioId: a.usuarioId, tarea: { fecha: { gte: a.fechaDesde, lte: a.fechaHasta } } })),
            tarea: { estado: { in: ['pendiente', 'en_proceso'] } },
          },
          select: { usuarioId: true, tarea: { select: { id: true, fecha: true, inicio: true, minutosEstimados: true, actividad: { select: { nombre: true } } } } },
          orderBy: [{ tarea: { fecha: 'asc' } }, { tarea: { inicio: 'asc' } }],
        })
      : [];

    const afectadas = (a: AusenciaCompleta): TareaAfectada[] => {
      if (a.estado !== 'solicitada' && a.estado !== 'aprobada') return [];
      return tareas
        .filter(({ usuarioId, tarea: t }) => {
          if (usuarioId !== a.usuarioId || t.fecha < a.fechaDesde || t.fecha > a.fechaHasta) return false;
          if (a.minutoDesde === null) return true;
          // Permiso por horas: solo las tareas con hora que caen dentro.
          if (!t.inicio) return false;
          const inicio = horaAMinutos(horaEnLima(t.inicio));
          return inicio < a.minutoHasta! && a.minutoDesde < inicio + t.minutosEstimados;
        })
        .map(({ tarea: t }) => ({ id: t.id, actividad: t.actividad.nombre, fecha: soloFecha(t.fecha), hora: t.inicio ? horaEnLima(t.inicio) : null }));
    };

    return filas.map((a) => ({
      id: a.id,
      usuario: a.usuario,
      tipo: a.tipo as TipoAusencia,
      fechaDesde: soloFecha(a.fechaDesde),
      fechaHasta: soloFecha(a.fechaHasta),
      horaDesde: a.minutoDesde === null ? null : minutosAHora(a.minutoDesde),
      horaHasta: a.minutoHasta === null ? null : minutosAHora(a.minutoHasta),
      motivo: a.motivo,
      estado: a.estado,
      solicitadaPor: a.solicitadaPor,
      solicitadaEn: a.solicitadaEn.toISOString(),
      resueltaPor: a.resueltaPor,
      resueltaEn: a.resueltaEn?.toISOString() ?? null,
      observacion: a.observacion,
      tareasAfectadas: afectadas(a),
    }));
  }
}
