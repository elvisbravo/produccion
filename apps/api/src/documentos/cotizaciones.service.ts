import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  aCentimos,
  deCentimos,
  diaEnLima,
  formatearSoles,
  validaHasta,
  type CotizacionDatos,
  type CotizacionListadoItem,
  type CotizacionResumen,
  type ListarCotizacionesFiltros,
  type Paginado,
} from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import { siguienteCodigo } from '../common/correlativo.js';
import { Prisma } from '../generated/prisma/client.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { nombrePersona } from './formato.js';

const CAMPOS_USUARIO = { id: true, nombres: true, apellidos: true } as const;
const soloFecha = (d: Date) => d.toISOString().slice(0, 10);

export const INCLUIR_COTIZACION = {
  items: { orderBy: { orden: 'asc' } },
  creadoPor: { select: CAMPOS_USUARIO },
  anuladoPor: { select: CAMPOS_USUARIO },
} as const satisfies Prisma.CotizacionInclude;

type CotizacionConRelaciones = Prisma.CotizacionGetPayload<{ include: typeof INCLUIR_COTIZACION }>;

export function aResumen(c: CotizacionConRelaciones): CotizacionResumen {
  const fecha = soloFecha(c.fecha);
  return {
    id: c.id,
    numero: c.numero,
    fecha,
    validezDias: c.validezDias,
    validaHasta: validaHasta(fecha, c.validezDias),
    total: Number(c.total),
    formaPago: c.formaPago,
    observaciones: c.observaciones,
    estado: c.estado,
    items: c.items.map((i) => ({ descripcion: i.descripcion, cantidad: Number(i.cantidad), precio: Number(i.precio), subtotal: Number(i.subtotal) })),
    creadoPor: c.creadoPor,
    anulada: c.anuladoEn ? { fecha: c.anuladoEn.toISOString(), por: c.anuladoPor, motivo: c.motivoAnulacion } : null,
  };
}

export interface ActorCotizacion {
  usuarioId: string;
  ip: string | null;
}

@Injectable()
export class CotizacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Con alcance "propios" solo se ven las cotizaciones de los prospectos que la persona tiene a cargo. */
  async filtroVisibles(usuarioId: string): Promise<Prisma.ProspectoWhereInput> {
    const alcance = (await this.permisos.efectivos(usuarioId))['cotizaciones.ver'];
    if (alcance === undefined) throw new ForbiddenException('No tienes permiso para ver cotizaciones');
    return alcance === 'todos' ? {} : { responsableId: usuarioId };
  }

  private async prospectoVisible(prospectoId: string, usuarioId: string) {
    const prospecto = await this.prisma.prospecto.findFirst({
      where: { id: prospectoId, eliminadoEn: null, ...(await this.filtroVisibles(usuarioId)) },
      include: { etapa: true, trabajo: { select: { id: true } } },
    });
    if (!prospecto) throw new NotFoundException('Prospecto no encontrado');
    return prospecto;
  }

  async deProspecto(prospectoId: string, usuarioId: string): Promise<CotizacionResumen[]> {
    await this.prospectoVisible(prospectoId, usuarioId);
    const lista = await this.prisma.cotizacion.findMany({ where: { prospectoId }, include: INCLUIR_COTIZACION, orderBy: { creadoEn: 'desc' } });
    return lista.map(aResumen);
  }

  async listar(filtros: Required<Pick<ListarCotizacionesFiltros, 'pagina' | 'porPagina'>> & ListarCotizacionesFiltros, usuarioId: string): Promise<Paginado<CotizacionListadoItem>> {
    const { q, estado, pagina, porPagina } = filtros;
    const hoy = diaEnLima();
    // Vencida: emitida y fecha + validez < hoy. Se resuelve en SQL para paginar bien.
    const porEstado: Prisma.CotizacionWhereInput =
      estado === 'anulada'
        ? { estado: 'anulada' }
        : estado
          ? {
              estado: 'emitida',
              id: {
                in: (
                  await this.prisma.$queryRaw<{ id: string }[]>`
                    SELECT id FROM cotizacion
                    WHERE estado = 'emitida' AND (fecha + validez_dias) ${estado === 'vencida' ? Prisma.sql`<` : Prisma.sql`>=`} ${hoy}::date`
                ).map((r) => r.id),
              },
            }
          : {};
    const texto = q
      ? {
          OR: [
            { numero: { contains: q, mode: 'insensitive' as const } },
            { prospecto: { codigo: { contains: q, mode: 'insensitive' as const } } },
            { prospecto: { contactos: { some: { persona: { OR: [{ nombres: { contains: q, mode: 'insensitive' as const } }, { apellidos: { contains: q, mode: 'insensitive' as const } }] } } } } },
          ],
        }
      : {};
    const where: Prisma.CotizacionWhereInput = { ...porEstado, ...texto, prospecto: { eliminadoEn: null, ...(await this.filtroVisibles(usuarioId)) } };
    const [total, filas] = await Promise.all([
      this.prisma.cotizacion.count({ where }),
      this.prisma.cotizacion.findMany({
        where,
        include: {
          creadoPor: { select: CAMPOS_USUARIO },
          prospecto: {
            select: {
              id: true,
              codigo: true,
              tipoTrabajo: { select: { nombre: true } },
              trabajo: { select: { id: true } },
              contactos: { orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }], take: 1, include: { persona: true } },
            },
          },
        },
        orderBy: { creadoEn: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);
    return {
      total,
      pagina,
      porPagina,
      datos: filas.map((c) => {
        const fecha = soloFecha(c.fecha);
        return {
          id: c.id,
          numero: c.numero,
          fecha,
          validezDias: c.validezDias,
          validaHasta: validaHasta(fecha, c.validezDias),
          total: Number(c.total),
          formaPago: c.formaPago,
          estado: c.estado,
          creadoPor: c.creadoPor,
          prospecto: {
            id: c.prospecto.id,
            codigo: c.prospecto.codigo,
            cliente: c.prospecto.contactos[0] ? nombrePersona(c.prospecto.contactos[0].persona) : '—',
            tipoTrabajo: c.prospecto.tipoTrabajo.nombre,
            convertido: !!c.prospecto.trabajo,
          },
        };
      }),
    };
  }

  /**
   * Emite una cotización: guarda el monto cotizado en el prospecto y, si hay una etapa marcada "al cotizar"
   * más adelante que la actual, lo mueve a esa etapa.
   */
  async crear(prospectoId: string, datos: CotizacionDatos, actor: ActorCotizacion): Promise<CotizacionResumen> {
    const prospecto = await this.prospectoVisible(prospectoId, actor.usuarioId);
    if (prospecto.trabajo || prospecto.etapa.clase !== 'abierta') throw new BadRequestException('Solo se cotiza a prospectos abiertos');

    const items = datos.items.map((i, orden) => ({
      orden,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precio: i.precio,
      subtotal: deCentimos(Math.round(i.cantidad * aCentimos(i.precio))),
    }));
    const total = deCentimos(items.reduce((s, i) => s + aCentimos(i.subtotal), 0));
    const destino = await this.prisma.etapaProspecto.findFirst({ where: { alCotizar: true, activa: true, clase: 'abierta' } });
    const mover = destino && destino.orden > prospecto.etapa.orden;

    const id = await this.prisma.$transaction(async (tx) => {
      const numero = await siguienteCodigo(tx, 'C');
      const cotizacion = await tx.cotizacion.create({
        data: {
          numero,
          prospectoId,
          fecha: new Date(`${datos.fecha}T00:00:00Z`),
          validezDias: datos.validezDias,
          total,
          formaPago: datos.formaPago || null,
          observaciones: datos.observaciones || null,
          creadoPorId: actor.usuarioId,
          items: { create: items },
        },
      });
      await tx.prospecto.update({
        where: { id: prospectoId },
        data: {
          montoCotizado: total,
          fechaCotizacion: new Date(`${datos.fecha}T00:00:00Z`),
          actualizadoPor: actor.usuarioId,
          ...(mover && { etapaId: destino.id }),
          eventos: {
            create: [
              { tipo: 'cotizacion', detalle: `Cotización ${numero} por ${formatearSoles(total)}`, datos: { cotizacionId: cotizacion.id }, usuarioId: actor.usuarioId },
              ...(mover
                ? [
                    {
                      tipo: 'cambio_etapa' as const,
                      detalle: `Pasó de "${prospecto.etapa.nombre}" a "${destino.nombre}" automáticamente`,
                      datos: { desde: prospecto.etapaId, hacia: destino.id, automatico: true },
                      usuarioId: actor.usuarioId,
                    },
                  ]
                : []),
            ],
          },
        },
      });
      await this.auditoria.registrar(
        { usuarioId: actor.usuarioId, accion: 'crear', entidad: 'cotizacion', entidadId: cotizacion.id, despues: { numero, prospectoId, total, items: datos.items }, ip: actor.ip },
        tx,
      );
      return cotizacion.id;
    });
    return aResumen(await this.prisma.cotizacion.findUniqueOrThrow({ where: { id }, include: INCLUIR_COTIZACION }));
  }

  async anular(id: string, motivo: string, actor: ActorCotizacion): Promise<CotizacionResumen> {
    const cotizacion = await this.prisma.cotizacion.findFirst({ where: { id, prospecto: { eliminadoEn: null, ...(await this.filtroVisibles(actor.usuarioId)) } } });
    if (!cotizacion) throw new NotFoundException('Cotización no encontrada');
    if (cotizacion.estado === 'anulada') throw new ConflictException('La cotización ya está anulada');

    await this.prisma.$transaction(async (tx) => {
      await tx.cotizacion.update({ where: { id }, data: { estado: 'anulada', anuladoEn: new Date(), anuladoPorId: actor.usuarioId, motivoAnulacion: motivo } });
      // El monto cotizado del prospecto pasa a ser el de su última cotización vigente.
      const ultima = await tx.cotizacion.findFirst({ where: { prospectoId: cotizacion.prospectoId, estado: 'emitida' }, orderBy: { creadoEn: 'desc' } });
      await tx.prospecto.update({
        where: { id: cotizacion.prospectoId },
        data: {
          montoCotizado: ultima?.total ?? null,
          fechaCotizacion: ultima?.fecha ?? null,
          actualizadoPor: actor.usuarioId,
          eventos: { create: { tipo: 'cotizacion', detalle: `Cotización ${cotizacion.numero} anulada: ${motivo}`, datos: { cotizacionId: id }, usuarioId: actor.usuarioId } },
        },
      });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'anular', entidad: 'cotizacion', entidadId: id, despues: { motivo }, ip: actor.ip }, tx);
    });
    return aResumen(await this.prisma.cotizacion.findUniqueOrThrow({ where: { id }, include: INCLUIR_COTIZACION }));
  }
}
