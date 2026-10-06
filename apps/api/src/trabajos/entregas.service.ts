import { BadRequestException, Injectable } from '@nestjs/common';
import { diaEnLima, sumarDias, type ConsultaEntregas, type DiaEntregas, type EntregaFila, type NotaEntregaDatos, type TableroEntregas } from '@grupoes/shared';
import { esCumpleanos } from '../agenda/disponibilidad.js';
import { AuditoriaService } from '../common/auditoria.service.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProduccionService } from '../produccion/produccion.service.js';
import { minutosReales } from '../tareas/mapeo.js';
import { aListado, INCLUIR_LISTADO } from './mapeo.js';
import { TrabajosService } from './trabajos.service.js';

const CAMPOS_USUARIO = { id: true, nombres: true, apellidos: true } as const;
const soloFecha = (d: Date) => d.toISOString().slice(0, 10);
const nombreCorto = (u: { nombres: string }) => u.nombres.split(' ')[0];

/** Lunes de la semana de un día (YYYY-MM-DD). */
const lunesDe = (dia: string) => sumarDias(dia, -((new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7));

/**
 * Tablero de entregas: una fila por trabajo con la actividad que toca ahora, quién la hace, cuándo se entrega y la nota del equipo,
 * agrupado por día de entrega (como la hoja de control del equipo).
 */
@Injectable()
export class EntregasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trabajos: TrabajosService,
    private readonly produccion: ProduccionService,
    private readonly permisos: PermisosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async tablero(consulta: ConsultaEntregas, usuarioId: string): Promise<TableroEntregas> {
    const desde = consulta.desde ?? lunesDe(diaEnLima());
    const hasta = consulta.hasta ?? sumarDias(desde, 6);
    if (hasta < desde) throw new BadRequestException('El último día debe ser igual o posterior al primero');
    if (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`) > 31 * 86_400_000) throw new BadRequestException('Máximo 31 días a la vez');

    const verMontos = 'contratos.ver_montos' in (await this.permisos.efectivos(usuarioId));
    const hoy = diaEnLima();
    const [trabajos, colas, feriados, cumpleaneros] = await Promise.all([
      this.prisma.trabajo.findMany({
        where: { eliminadoEn: null, estado: { notIn: ['finalizado', 'cancelado'] }, ...(await this.trabajos.filtroVisibles(usuarioId)) },
        include: {
          ...INCLUIR_LISTADO,
          prospecto: { select: { responsable: { select: CAMPOS_USUARIO } } },
          tareas: {
            where: { estado: { in: ['pendiente', 'en_proceso'] } },
            include: {
              actividad: { include: { tipo: { select: { color: true } } } },
              entregable: { select: { orden: true, fechaLimite: true } },
              responsables: { include: { usuario: { select: CAMPOS_USUARIO } } },
              tiempos: { select: { inicio: true, fin: true, minutos: true } },
            },
          },
        },
      }),
      this.produccion.colasDePersonal(),
      this.prisma.feriado.findMany({ where: { fecha: { gte: new Date(`${desde}T00:00:00Z`), lte: new Date(`${hasta}T00:00:00Z`) } }, select: { fecha: true, nombre: true, medioDia: true } }),
      this.prisma.usuario.findMany({ where: { activo: true, eliminadoEn: null, fechaNacimiento: { not: null } }, select: { nombres: true, fechaNacimiento: true } }),
    ]);
    const planes = new Map(colas.flatMap((c) => c.items.map((i) => [i.tareaId, i] as const)));
    const ahora = new Date();

    const filas: EntregaFila[] = trabajos.map((t) => {
      // La actividad de ahora: la que se está haciendo; si no, la que empieza antes según la cola, y si no, la primera del plan.
      const actual = [...t.tareas].sort(
        (a, b) =>
          Number(b.estado === 'en_proceso') - Number(a.estado === 'en_proceso') ||
          (planes.get(a.id)?.plan?.inicio ?? '9').localeCompare(planes.get(b.id)?.plan?.inicio ?? '9') ||
          (a.entregable?.orden ?? 0) - (b.entregable?.orden ?? 0) ||
          a.creadoEn.getTime() - b.creadoEn.getTime(),
      )[0];
      const item = aListado(t, verMontos, hoy);
      const plan = actual ? planes.get(actual.id) : undefined;
      const hechos = actual ? minutosReales(actual.tiempos, ahora) : 0;
      return {
        trabajo: item,
        actividad: actual
          ? { tareaId: actual.id, nombre: actual.actividad.nombre, titulo: actual.titulo, color: actual.actividad.tipo.color, estado: actual.estado as 'pendiente' | 'en_proceso', minutosEstimados: actual.minutosEstimados, minutosHechos: hechos }
          : null,
        auxiliares: actual ? actual.responsables.map((r) => r.usuario) : item.auxiliarPrincipal ? [item.auxiliarPrincipal] : [],
        asistente: t.prospecto?.responsable ?? null,
        enlace: t.linkDrive,
        entregaCliente: soloFecha(t.fechaLimite),
        entregaInterna: soloFecha(actual?.entregable?.fechaLimite ?? t.fechaLimite),
        inicio: plan?.plan?.inicio ?? null,
        fin: plan?.plan?.fin ?? null,
        semaforo: plan?.semaforo ?? null,
        revisarTiempos: actual ? hechos > actual.minutosEstimados : false,
        nota: t.notaEntrega,
      };
    });

    const visibles = filas.filter(
      (f) =>
        f.entregaInterna >= desde &&
        f.entregaInterna <= hasta &&
        (!consulta.auxiliarId || f.auxiliares.some((a) => a.id === consulta.auxiliarId) || f.trabajo.auxiliarPrincipal?.id === consulta.auxiliarId) &&
        (!consulta.jefeId || f.trabajo.jefeResponsable?.id === consulta.jefeId) &&
        (!consulta.asistenteId || f.asistente?.id === consulta.asistenteId) &&
        (!consulta.seguimiento || f.trabajo.seguimiento.principal === consulta.seguimiento || f.trabajo.seguimiento.etiquetas.includes(consulta.seguimiento)),
    );

    const dias: DiaEntregas[] = [];
    for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
      const feriado = feriados.find((f) => soloFecha(f.fecha) === fecha);
      const cumpleanos = cumpleaneros.filter((u) => esCumpleanos(soloFecha(u.fechaNacimiento!), fecha)).map(nombreCorto);
      const delDia = visibles
        .filter((f) => f.entregaInterna === fecha)
        .sort((a, b) => (a.inicio ?? '9').localeCompare(b.inicio ?? '9') || a.trabajo.codigo.localeCompare(b.trabajo.codigo));
      if (delDia.length > 0 || feriado || cumpleanos.length > 0) dias.push({ fecha, feriado: feriado ? { nombre: feriado.nombre, medioDia: feriado.medioDia } : null, cumpleanos, filas: delDia });
    }
    return { desde, hasta, dias };
  }

  /** La nota corta del tablero (vacía = quitarla). */
  async guardarNota(trabajoId: string, datos: NotaEntregaDatos, actor: { usuarioId: string; ip: string | null }): Promise<void> {
    await this.trabajos.verificarVisible(trabajoId, actor.usuarioId);
    const antes = await this.prisma.trabajo.findUniqueOrThrow({ where: { id: trabajoId }, select: { notaEntrega: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.trabajo.update({ where: { id: trabajoId }, data: { notaEntrega: datos.nota ?? null } });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'nota_entrega', entidad: 'trabajo', entidadId: trabajoId, antes: { nota: antes.notaEntrega }, despues: { nota: datos.nota ?? null }, ip: actor.ip }, tx);
    });
  }
}


