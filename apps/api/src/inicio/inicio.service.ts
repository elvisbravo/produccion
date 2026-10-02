import { Injectable } from '@nestjs/common';
import { diaEnLima, formatearSoles, NOMBRE_TIPO_AUSENCIA, sumarDias, type IndicadorInicio, type PanelInicio, type PendienteInicio, type PermisoCodigo } from '@grupoes/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReportesService } from '../reportes/reportes.service.js';
import { TrabajosService } from '../trabajos/trabajos.service.js';

const aFecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const soloFecha = (f: Date) => f.toISOString().slice(0, 10);
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
const redondear = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

type Seccion = PanelInicio['secciones'][number];

/**
 * Panel de inicio: un solo endpoint que calcula, según los permisos de quien entra, lo que está en riesgo,
 * lo que espera su acción y los gráficos principales. Cada bloque respeta el alcance del permiso correspondiente.
 */
@Injectable()
export class InicioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
    private readonly trabajos: TrabajosService,
    private readonly reportes: ReportesService,
  ) {}

  async panel(usuarioId: string): Promise<PanelInicio> {
    const efectivos = await this.permisos.efectivos(usuarioId);
    const puede = (p: PermisoCodigo) => p in efectivos;
    const hoy = diaEnLima();
    const panel: PanelInicio = {
      secciones: [],
      indicadores: [],
      pendientes: [],
      miCola: null,
      ausenciasHoy: null,
      graficos: { ocupacion: null, embudo: null, cobranza: null, puntualidad: null },
      actividad: null,
    };
    const ind = (i: IndicadorInicio) => panel.indicadores.push(i);
    const pend = (p: Omit<PendienteInicio, 'cantidad'> & { cantidad: number }) => p.cantidad > 0 && panel.pendientes.push(p);
    const abre = (s: Seccion) => panel.secciones.push(s);

    const visibles = puede('trabajos.ver') ? await this.trabajos.filtroVisibles(usuarioId) : null;
    const trabajoAbierto: Prisma.TrabajoWhereInput = { eliminadoEn: null, estado: { notIn: ['finalizado', 'cancelado'] }, ...visibles };

    const tareas: Promise<void>[] = [];

    // ─── Trabajos ───
    if (visibles) {
      abre('trabajos');
      tareas.push(
        (async () => {
          const en3 = sumarDias(hoy, 3);
          const [abiertos, fuera, porVencer, urgentes, enEspera, sinEquipo, fijas] = await Promise.all([
            this.prisma.trabajo.count({ where: trabajoAbierto }),
            this.prisma.trabajo.count({ where: { ...trabajoAbierto, fechaLimite: { lt: aFecha(hoy) } } }),
            this.prisma.trabajo.count({ where: { ...trabajoAbierto, fechaLimite: { gte: aFecha(hoy), lte: aFecha(en3) } } }),
            this.prisma.trabajo.count({ where: { ...trabajoAbierto, prioridad: { permiteInsercionUrgente: true } } }),
            this.prisma.trabajo.count({ where: { ...trabajoAbierto, estado: 'suspendido' } }),
            this.prisma.trabajo.count({ where: { ...trabajoAbierto, estado: 'sin_asignar' } }),
            this.prisma.trabajo.count({ where: { ...trabajoAbierto, fechasFijas: true } }),
          ]);
          ind({ clave: 'trabajos_abiertos', titulo: 'Trabajos abiertos', valor: String(abiertos), tono: 'normal', enlace: '/trabajos' });
          ind({ clave: 'fuera_de_plazo', titulo: 'Fuera de plazo', valor: String(fuera), detalle: 'pasó su fecha límite', tono: fuera > 0 ? 'alerta' : 'ok', enlace: '/trabajos' });
          ind({ clave: 'por_vencer', titulo: 'Vencen en 3 días', valor: String(porVencer), tono: porVencer > 0 ? 'alerta' : 'ok', enlace: '/trabajos' });
          ind({ clave: 'urgentes', titulo: 'Urgentes', valor: String(urgentes), tono: 'normal', enlace: '/trabajos?seguimiento=urgente' });
          if (fijas > 0) ind({ clave: 'fechas_fijas', titulo: 'Con fechas inamovibles', valor: String(fijas), tono: 'normal', enlace: '/trabajos' });
          if (enEspera > 0) ind({ clave: 'en_espera', titulo: 'En espera del cliente', valor: String(enEspera), tono: 'alerta', enlace: '/trabajos?seguimiento=suspendido' });
          if (puede('trabajos.armar_equipo')) pend({ clave: 'sin_equipo', titulo: 'Trabajos sin equipo de producción', cantidad: sinEquipo, enlace: '/trabajos?seguimiento=sin_asignar' });
        })(),
      );
    }

    // ─── Entregables ───
    if (visibles && puede('entregables.ver')) {
      abre('entregables');
      tareas.push(
        (async () => {
          const donde = (estado: 'en_revision' | 'en_turnitin' | 'aprobado') => this.prisma.entregable.count({ where: { estado, trabajo: trabajoAbierto } });
          const [revision, turnitin, porEntregar] = await Promise.all([donde('en_revision'), donde('en_turnitin'), donde('aprobado')]);
          if (puede('entregables.aprobar') || puede('entregables.observar')) pend({ clave: 'revision', titulo: 'Entregables por revisar', cantidad: revision, enlace: '/entregables?vista=revision' });
          if (puede('entregables.turnitin')) pend({ clave: 'turnitin', titulo: 'Entregables en Turnitin', cantidad: turnitin, enlace: '/entregables?vista=activos' });
          if (puede('entregables.registrar_entrega')) pend({ clave: 'por_entregar', titulo: 'Entregables por entregar al cliente', cantidad: porEntregar, enlace: '/entregables?vista=por_entregar' });
        })(),
      );
    }

    // ─── Mi cola ───
    if (puede('tareas.ver')) {
      abre('mi_cola');
      tareas.push(
        (async () => {
          const mias: Prisma.TareaWhereInput = { estado: { in: ['pendiente', 'en_proceso'] }, responsables: { some: { usuarioId } } };
          const [total, deHoy, minutos, siguiente] = await Promise.all([
            this.prisma.tarea.count({ where: mias }),
            this.prisma.tarea.count({ where: { ...mias, fecha: { lte: aFecha(hoy) } } }),
            this.prisma.tarea.aggregate({ where: mias, _sum: { minutosEstimados: true } }),
            this.prisma.tarea.findFirst({
              where: mias,
              orderBy: [{ estado: 'asc' }, { fecha: 'asc' }, { inicio: 'asc' }, { creadoEn: 'asc' }],
              select: { titulo: true, actividad: { select: { nombre: true } }, trabajo: { select: { codigo: true } } },
            }),
          ]);
          panel.miCola = {
            total,
            deHoy,
            minutos: minutos._sum.minutosEstimados ?? 0,
            siguiente: siguiente ? { titulo: siguiente.titulo ?? siguiente.actividad.nombre, actividad: siguiente.actividad.nombre, trabajo: siguiente.trabajo?.codigo ?? null, enlace: '/tareas' } : null,
          };
          if (puede('tareas.asignar')) {
            pend({ clave: 'por_asignar', titulo: 'Tareas por asignar', cantidad: await this.prisma.tarea.count({ where: { estado: 'por_asignar' } }), enlace: '/tareas' });
          }
          const seguimientos = await this.prisma.tarea.count({ where: { ...mias, fecha: { lte: aFecha(hoy) }, actividad: { esSeguimiento: true } } });
          pend({ clave: 'seguimientos', titulo: 'Seguimientos de prospectos para hoy', cantidad: seguimientos, enlace: '/tareas' });
        })(),
      );
    }

    // ─── Comercial ───
    if (puede('prospectos.ver')) {
      abre('comercial');
      tareas.push(
        (async () => {
          const alcance = efectivos['prospectos.ver'];
          const mios: Prisma.ProspectoWhereInput = alcance === 'propios' ? { responsableId: usuarioId } : {};
          const abiertos: Prisma.ProspectoWhereInput = { eliminadoEn: null, trabajo: null, etapa: { clase: 'abierta' }, ...mios };
          const hace7 = new Date(Date.now() - 7 * 86_400_000);
          const [etapas, porEtapa, enfriados] = await Promise.all([
            this.prisma.etapaProspecto.findMany({ where: { activa: true, clase: 'abierta' }, orderBy: { orden: 'asc' }, select: { id: true, nombre: true, color: true } }),
            this.prisma.prospecto.groupBy({ by: ['etapaId'], where: abiertos, _count: { _all: true } }),
            this.prisma.prospecto.count({ where: { ...abiertos, actualizadoEn: { lt: hace7 }, tareas: { none: { estado: { in: ['pendiente', 'en_proceso', 'por_asignar'] } } } } }),
          ]);
          panel.graficos.embudo = etapas.map((e) => ({ nombre: e.nombre, color: e.color, cantidad: porEtapa.find((p) => p.etapaId === e.id)?._count._all ?? 0 }));
          const total = panel.graficos.embudo.reduce((s, e) => s + e.cantidad, 0);
          ind({ clave: 'prospectos_abiertos', titulo: 'Prospectos abiertos', valor: String(total), tono: 'normal', enlace: '/prospectos' });
          pend({ clave: 'enfriados', titulo: 'Prospectos sin seguimiento programado hace más de 7 días', cantidad: enfriados, enlace: '/prospectos' });
          if (puede('cotizaciones.ver')) {
            const cotizaciones = await this.prisma.cotizacion.findMany({
              where: { estado: 'emitida', fecha: { gte: aFecha(sumarDias(hoy, -400)) }, prospecto: { eliminadoEn: null, trabajo: null, ...mios } },
              select: { fecha: true, validezDias: true },
            });
            const porVencer = cotizaciones.filter((c) => {
              const restan = diasEntre(hoy, sumarDias(soloFecha(c.fecha), c.validezDias));
              return restan >= 0 && restan <= 3;
            }).length;
            pend({ clave: 'cotizaciones', titulo: 'Cotizaciones que vencen en 3 días', cantidad: porVencer, enlace: '/cotizaciones' });
          }
        })(),
      );
    }

    // ─── Cobranza ───
    if (visibles && puede('contratos.ver') && puede('contratos.ver_montos')) {
      abre('cobranza');
      tareas.push(
        (async () => {
          const cuotas = await this.prisma.cuota.findMany({
            where: { contrato: { estado: 'vigente', trabajo: { eliminadoEn: null, estado: { not: 'cancelado' }, ...visibles } } },
            select: { monto: true, vencimiento: true, aplicaciones: { where: { pago: { anuladoEn: null } }, select: { montoAplicado: true } } },
          });
          const conSaldo = cuotas
            .map((c) => ({ saldo: redondear(Number(c.monto) - c.aplicaciones.reduce((s, a) => s + Number(a.montoAplicado), 0)), atraso: diasEntre(soloFecha(c.vencimiento), hoy) }))
            .filter((x) => x.saldo > 0.004);
          const vencidas = conSaldo.filter((x) => x.atraso > 0);
          const vencido = redondear(vencidas.reduce((s, x) => s + x.saldo, 0));
          const porCobrar = redondear(conSaldo.reduce((s, x) => s + x.saldo, 0));
          ind({ clave: 'por_cobrar', titulo: 'Por cobrar', valor: formatearSoles(porCobrar), tono: 'normal', enlace: '/contratos' });
          ind({
            clave: 'vencido',
            titulo: 'Cobranza vencida',
            valor: formatearSoles(vencido),
            detalle: vencidas.length ? plural(vencidas.length, 'cuota vencida', 'cuotas vencidas') : 'sin cuotas vencidas',
            tono: vencido > 0 ? 'alerta' : 'ok',
            enlace: '/contratos',
          });
          const tramos: [string, (d: number) => boolean][] = [
            ['Por vencer', (d) => d <= 0],
            ['1 a 30 días', (d) => d >= 1 && d <= 30],
            ['31 a 60 días', (d) => d >= 31 && d <= 60],
            ['61 a 90 días', (d) => d >= 61 && d <= 90],
            ['Más de 90 días', (d) => d > 90],
          ];
          panel.graficos.cobranza = tramos.map(([tramo, cumple]) => ({ tramo, monto: redondear(conSaldo.filter((x) => cumple(x.atraso)).reduce((s, x) => s + x.saldo, 0)) }));
        })(),
      );
    }

    // ─── Equipo: ocupación y puntualidad (reportes) ───
    if (puede('reportes.ver')) {
      abre('equipo');
      tareas.push(
        (async () => {
          const [ocupacion, puntualidad] = await Promise.all([
            this.reportes.ocupacion({ desde: sumarDias(hoy, -6), hasta: hoy }),
            this.reportes.puntualidad({ desde: sumarDias(`${hoy.slice(0, 7)}-01`, -150), hasta: hoy }),
          ]);
          panel.graficos.ocupacion = ocupacion.personas.map((p) => ({ nombre: p.usuario.nombres, porcentaje: p.porcentaje === null ? 0 : Math.round(p.porcentaje * 100) }));
          panel.graficos.puntualidad = puntualidad.porMes.slice(-6).map((m) => ({ mes: m.clave, porcentaje: m.porcentaje === null ? 0 : Math.round(m.porcentaje * 100), total: m.total }));
          const prom = ocupacion.total.porcentaje;
          if (prom !== null) ind({ clave: 'ocupacion', titulo: 'Ocupación del equipo (7 días)', valor: `${Math.round(prom * 100)} %`, tono: prom > 1 ? 'alerta' : 'normal', enlace: '/reportes' });
          if (puntualidad.total.porcentaje !== null) {
            ind({ clave: 'puntualidad', titulo: 'Puntualidad (últimos meses)', valor: `${Math.round(puntualidad.total.porcentaje * 100)} %`, detalle: `${puntualidad.total.total} entregables`, tono: puntualidad.total.porcentaje >= 0.85 ? 'ok' : 'alerta', enlace: '/reportes' });
          }
        })(),
      );
    }

    // ─── Ausencias y aprobaciones ───
    if (puede('ausencias.ver')) {
      abre('ausencias');
      tareas.push(
        (async () => {
          const filas = await this.prisma.ausencia.findMany({
            where: { estado: 'aprobada', fechaDesde: { lte: aFecha(hoy) }, fechaHasta: { gte: aFecha(hoy) }, usuario: { activo: true, eliminadoEn: null } },
            select: { tipo: true, usuario: { select: { nombres: true, apellidos: true } } },
            take: 20,
          });
          panel.ausenciasHoy = filas.map((a) => ({ nombre: `${a.usuario.nombres} ${a.usuario.apellidos}`, tipo: NOMBRE_TIPO_AUSENCIA[a.tipo] }));
        })(),
      );
    }
    if (puede('ausencias.aprobar')) tareas.push(this.prisma.ausencia.count({ where: { estado: 'solicitada' } }).then((n) => void pend({ clave: 'ausencias', titulo: 'Ausencias por aprobar', cantidad: n, enlace: '/ausencias' })));
    if (puede('horas_extra.aprobar')) tareas.push(this.prisma.horaExtraBono.count({ where: { estado: 'aceptada' } }).then((n) => void pend({ clave: 'horas_extra', titulo: 'Horas extra y bonos por aprobar', cantidad: n, enlace: '/horas-extra' })));
    if (puede('programacion.insertar_urgente')) tareas.push(this.prisma.solicitudUrgente.count({ where: { estado: 'pendiente' } }).then((n) => void pend({ clave: 'urgencias', titulo: 'Urgencias por ejecutar', cantidad: n, enlace: '/trabajos' })));

    // ─── Actividad reciente ───
    if (puede('auditoria.ver')) {
      abre('actividad');
      tareas.push(
        this.prisma.auditoria
          .findMany({ orderBy: { fecha: 'desc' }, take: 8, include: { usuario: { select: { nombres: true, apellidos: true } } } })
          .then((filas) => {
            panel.actividad = filas.map((a) => ({ id: a.id, accion: a.accion, entidad: a.entidad, usuario: a.usuario ? `${a.usuario.nombres} ${a.usuario.apellidos}` : null, fecha: a.fecha.toISOString() }));
          }),
      );
    }

    await Promise.all(tareas);
    // Los pendientes llegan en el orden en que terminan los cálculos: se ordenan por importancia fija.
    const ORDEN = ['urgencias', 'ausencias', 'horas_extra', 'por_asignar', 'sin_equipo', 'revision', 'turnitin', 'por_entregar', 'seguimientos', 'cotizaciones', 'enfriados'];
    panel.pendientes.sort((a, b) => ORDEN.indexOf(a.clave) - ORDEN.indexOf(b.clave));
    const ORDEN_IND = ['fuera_de_plazo', 'por_vencer', 'vencido', 'en_espera', 'urgentes', 'fechas_fijas', 'trabajos_abiertos', 'por_cobrar', 'prospectos_abiertos', 'ocupacion', 'puntualidad'];
    panel.indicadores.sort((a, b) => ORDEN_IND.indexOf(a.clave) - ORDEN_IND.indexOf(b.clave));
    return panel;
  }
}
