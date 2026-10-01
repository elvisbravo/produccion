import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  diaEnLima,
  instanteDesdeLima,
  ROLES_BASE,
  sumarDias,
  type CostoHoraDatos,
  type CostoHoraItem,
  type FilaConversion,
  type FilaOcupacion,
  type FilaPuntualidad,
  type FilaRentabilidad,
  type FilaRetrabajo,
  type Periodo,
  type ReporteCobranza,
  type ReporteConversion,
  type ReporteOcupacion,
  type ReportePuntualidad,
  type ReporteRentabilidad,
  type ReporteRetrabajo,
  type Tablero,
} from '@grupoes/shared';
import { AgendaService } from '../agenda/agenda.service.js';
import { AuditoriaService } from '../common/auditoria.service.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const CAMPOS_USUARIO = { id: true, nombres: true, apellidos: true } as const;
const soloFecha = (d: Date) => d.toISOString().slice(0, 10);
const aFecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const redondear = (n: number) => Math.round(n * 100) / 100;
const dias = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
const nombre = (u: { nombres: string; apellidos: string }) => `${u.nombres} ${u.apellidos}`;
const MAX_DIAS = 366;
const MAX_DIAS_OCUPACION = 186;

/** Periodo por defecto: el mes en curso hasta hoy. */
export function resolverPeriodo(desde?: string, hasta?: string, maximo = MAX_DIAS): Periodo {
  const h = hasta ?? diaEnLima();
  const d = desde ?? `${h.slice(0, 7)}-01`;
  if (dias(d, h) > maximo) throw new BadRequestException(`El periodo puede ser de hasta ${maximo} días`);
  return { desde: d, hasta: h };
}

/** Costo vigente de una persona en un día (el último que empezó antes o ese día). */
function costoEn(costos: { usuarioId: string; costo: number; vigenteDesde: string }[], usuarioId: string, dia: string): number | null {
  const vigente = costos.filter((c) => c.usuarioId === usuarioId && c.vigenteDesde <= dia).sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))[0];
  return vigente ? vigente.costo : null;
}

const filaPuntualidad = (clave: string, nombreFila: string, items: { aTiempo: boolean }[]): FilaPuntualidad => ({
  clave,
  nombre: nombreFila,
  total: items.length,
  aTiempo: items.filter((i) => i.aTiempo).length,
  porcentaje: items.length ? Math.round((items.filter((i) => i.aTiempo).length / items.length) * 1000) / 1000 : null,
});

function agrupar<T>(items: T[], clave: (i: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const i of items) m.set(clave(i), [...(m.get(clave(i)) ?? []), i]);
  return m;
}

@Injectable()
export class ReportesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agenda: AgendaService,
    private readonly permisos: PermisosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Auxiliar principal de cada trabajo (el vigente o, si terminó, el último que tuvo). */
  private async principales(trabajoIds: string[]) {
    const filas = await this.prisma.trabajoEquipo.findMany({
      where: { trabajoId: { in: trabajoIds }, funcion: 'auxiliar_principal' },
      orderBy: { desde: 'desc' },
      include: { usuario: { select: CAMPOS_USUARIO } },
    });
    const m = new Map<string, { id: string; nombres: string; apellidos: string }>();
    for (const f of filas) if (!m.has(f.trabajoId)) m.set(f.trabajoId, f.usuario);
    return m;
  }

  // ─── Puntualidad ─────────────────────────────────────────

  /** Entregables con fecha límite en el periodo: a tiempo si su primera entrega al cliente fue hasta ese día. */
  async puntualidad(p: Periodo): Promise<ReportePuntualidad> {
    const hoy = diaEnLima();
    const entregables = await this.prisma.entregable.findMany({
      where: { fechaLimite: { gte: aFecha(p.desde), lte: aFecha(p.hasta) }, trabajo: { estado: { not: 'cancelado' }, eliminadoEn: null } },
      include: {
        entregas: { orderBy: { fecha: 'asc' }, take: 1, select: { fecha: true } },
        trabajo: { select: { id: true, codigo: true, tipoTrabajo: { select: { id: true, nombre: true } } } },
      },
    });
    const principales = await this.principales([...new Set(entregables.map((e) => e.trabajoId))]);
    const evaluados = entregables
      .map((e) => {
        const limite = soloFecha(e.fechaLimite);
        const entregadoEl = e.entregas[0] ? diaEnLima(e.entregas[0].fecha) : null;
        // Sin entregar y la fecha aún no llega: no cuenta todavía.
        if (!entregadoEl && limite >= hoy) return null;
        const referencia = entregadoEl ?? hoy;
        return { e, limite, entregadoEl, aTiempo: Boolean(entregadoEl && entregadoEl <= limite), diasAtraso: Math.max(0, dias(limite, referencia)), auxiliar: principales.get(e.trabajoId) ?? null };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const porAuxiliar = [...agrupar(evaluados, (x) => x.auxiliar?.id ?? 'sin')].map(([id, items]) =>
      filaPuntualidad(id, items[0].auxiliar ? nombre(items[0].auxiliar) : 'Sin auxiliar', items),
    );
    const porTipo = [...agrupar(evaluados, (x) => x.e.trabajo.tipoTrabajo.id)].map(([id, items]) => filaPuntualidad(id, items[0].e.trabajo.tipoTrabajo.nombre, items));
    const porMes = [...agrupar(evaluados, (x) => x.limite.slice(0, 7))].sort(([a], [b]) => a.localeCompare(b)).map(([mes, items]) => filaPuntualidad(mes, mes, items));
    return {
      ...p,
      total: filaPuntualidad('total', 'Total', evaluados),
      porAuxiliar: porAuxiliar.sort((a, b) => (a.porcentaje ?? 2) - (b.porcentaje ?? 2)),
      porTipo,
      porMes,
      atrasados: evaluados
        .filter((x) => !x.aTiempo)
        .sort((a, b) => b.diasAtraso - a.diasAtraso)
        .slice(0, 30)
        .map((x) => ({
          id: x.e.id,
          nombre: x.e.nombre,
          trabajo: { id: x.e.trabajo.id, codigo: x.e.trabajo.codigo },
          auxiliar: x.auxiliar,
          fechaLimite: x.limite,
          entregadoEl: x.entregadoEl,
          diasAtraso: x.diasAtraso,
        })),
    };
  }

  // ─── Retrabajo ───────────────────────────────────────────

  /** Observaciones internas (revisión) y del cliente registradas en el periodo, por entregable. */
  async retrabajo(p: Periodo): Promise<ReporteRetrabajo> {
    const desde = instanteDesdeLima(p.desde, '00:00');
    const hasta = instanteDesdeLima(sumarDias(p.hasta, 1), '00:00');
    const entregables = await this.prisma.entregable.findMany({
      where: {
        trabajo: { estado: { not: 'cancelado' }, eliminadoEn: null },
        OR: [{ revisiones: { some: { fecha: { gte: desde, lt: hasta } } } }, { entregas: { some: { fecha: { gte: desde, lt: hasta } } } }],
      },
      include: {
        revisiones: { where: { fecha: { gte: desde, lt: hasta } }, select: { resultado: true } },
        entregas: { where: { respondidoEn: { gte: desde, lt: hasta }, respuesta: 'observado' }, select: { id: true } },
        trabajo: { select: { id: true, codigo: true, tipoTrabajo: { select: { id: true, nombre: true } } } },
      },
    });
    const principales = await this.principales([...new Set(entregables.map((e) => e.trabajoId))]);
    const items = entregables.map((e) => ({
      e,
      auxiliar: principales.get(e.trabajoId) ?? null,
      internas: e.revisiones.filter((r) => r.resultado === 'observado').length,
      cliente: e.entregas.length,
    }));
    const fila = (clave: string, nombreFila: string, lista: typeof items): FilaRetrabajo => {
      const internas = lista.reduce((s, i) => s + i.internas, 0);
      const cliente = lista.reduce((s, i) => s + i.cliente, 0);
      return { clave, nombre: nombreFila, entregables: lista.length, observacionesInternas: internas, observacionesCliente: cliente, promedio: lista.length ? redondear((internas + cliente) / lista.length) : 0 };
    };
    return {
      ...p,
      total: fila('total', 'Total', items),
      porAuxiliar: [...agrupar(items, (i) => i.auxiliar?.id ?? 'sin')]
        .map(([id, lista]) => fila(id, lista[0].auxiliar ? nombre(lista[0].auxiliar) : 'Sin auxiliar', lista))
        .sort((a, b) => b.promedio - a.promedio),
      porTipo: [...agrupar(items, (i) => i.e.trabajo.tipoTrabajo.id)].map(([id, lista]) => fila(id, lista[0].e.trabajo.tipoTrabajo.nombre, lista)),
      masObservados: items
        .filter((i) => i.internas + i.cliente > 0)
        .sort((a, b) => b.internas + b.cliente - (a.internas + a.cliente))
        .slice(0, 15)
        .map((i) => ({ id: i.e.id, nombre: i.e.nombre, trabajo: { id: i.e.trabajo.id, codigo: i.e.trabajo.codigo }, auxiliar: i.auxiliar, internas: i.internas, cliente: i.cliente })),
    };
  }

  // ─── Ocupación ───────────────────────────────────────────

  /** Capacidad (horario menos días no laborables) frente a lo trabajado (cronómetro y manual), más horas extra y bonos. */
  async ocupacion(p: Periodo): Promise<ReporteOcupacion> {
    if (dias(p.desde, p.hasta) > MAX_DIAS_OCUPACION) throw new BadRequestException(`La ocupación se calcula para hasta ${MAX_DIAS_OCUPACION} días`);
    const usuarios = await this.prisma.usuario.findMany({
      where: { activo: true, eliminadoEn: null, roles: { some: { rol: { activo: true, codigo: { in: [ROLES_BASE.AUXILIAR, ROLES_BASE.JEFE_PROD] } } } } },
      orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }],
      select: { ...CAMPOS_USUARIO, roles: { select: { rol: { select: { nombre: true } } } } },
    });
    const ids = usuarios.map((u) => u.id);
    const desde = instanteDesdeLima(p.desde, '00:00');
    const hasta = instanteDesdeLima(sumarDias(p.hasta, 1), '00:00');
    const [agendas, tiempos, extras] = await Promise.all([
      this.agenda.calcular(ids, p.desde, p.hasta),
      this.prisma.registroTiempo.groupBy({ by: ['usuarioId'], where: { usuarioId: { in: ids }, fin: { not: null }, inicio: { gte: desde, lt: hasta } }, _sum: { minutos: true } }),
      this.prisma.horaExtraBono.findMany({
        where: {
          usuarioId: { in: ids },
          estado: { in: ['aprobada', 'realizada'] },
          OR: [
            { modalidad: 'horas_extra', fecha: { gte: aFecha(p.desde), lte: aFecha(p.hasta) } },
            { modalidad: 'bono', aprobadaEn: { gte: desde, lt: hasta } },
          ],
        },
      }),
    ]);
    const personas: FilaOcupacion[] = usuarios.map((u) => {
      const capacidad = (agendas.get(u.id) ?? []).reduce((s, d) => s + d.capacidad, 0);
      const trabajado = tiempos.find((t) => t.usuarioId === u.id)?._sum.minutos ?? 0;
      const suyas = extras.filter((x) => x.usuarioId === u.id);
      return {
        usuario: { id: u.id, nombres: u.nombres, apellidos: u.apellidos },
        roles: u.roles.map((r) => r.rol.nombre),
        capacidad,
        trabajado,
        porcentaje: capacidad ? Math.round((trabajado / capacidad) * 1000) / 1000 : null,
        minutosExtra: suyas.filter((x) => x.modalidad === 'horas_extra').reduce((s, x) => s + (x.minutosReales ?? x.minutoFin! - x.minutoInicio!), 0),
        bonos: redondear(suyas.filter((x) => x.modalidad === 'bono').reduce((s, x) => s + Number(x.monto), 0)),
      };
    });
    const capacidad = personas.reduce((s, x) => s + x.capacidad, 0);
    const trabajado = personas.reduce((s, x) => s + x.trabajado, 0);
    return {
      ...p,
      personas,
      total: {
        capacidad,
        trabajado,
        porcentaje: capacidad ? Math.round((trabajado / capacidad) * 1000) / 1000 : null,
        minutosExtra: personas.reduce((s, x) => s + x.minutosExtra, 0),
        bonos: redondear(personas.reduce((s, x) => s + x.bonos, 0)),
      },
    };
  }

  // ─── Cobranza ────────────────────────────────────────────

  /** Situación a la fecha "hasta" (pagos hasta ese día) y lo cobrado dentro del periodo. */
  async cobranza(p: Periodo): Promise<ReporteCobranza> {
    const corte = aFecha(p.hasta);
    const cuotas = await this.prisma.cuota.findMany({
      where: { contrato: { estado: 'vigente', fechaFirma: { lte: corte }, trabajo: { estado: { not: 'cancelado' }, eliminadoEn: null } } },
      include: {
        aplicaciones: { where: { pago: { anuladoEn: null, fecha: { lte: corte } } }, select: { montoAplicado: true } },
        contrato: { select: { trabajo: { select: { prospecto: { select: { responsable: { select: CAMPOS_USUARIO } } } } } } },
      },
    });
    const conSaldo = cuotas
      .map((c) => ({ c, saldo: redondear(Number(c.monto) - c.aplicaciones.reduce((s, a) => s + Number(a.montoAplicado), 0)), atraso: dias(soloFecha(c.vencimiento), p.hasta) }))
      .filter((x) => x.saldo > 0.004);
    const porCobrar = redondear(conSaldo.reduce((s, x) => s + x.saldo, 0));
    const vencidas = conSaldo.filter((x) => x.atraso > 0);
    const vencido = redondear(vencidas.reduce((s, x) => s + x.saldo, 0));
    const tramos: [string, (d: number) => boolean][] = [
      ['Por vencer', (d) => d <= 0],
      ['1 a 30 días', (d) => d >= 1 && d <= 30],
      ['31 a 60 días', (d) => d >= 31 && d <= 60],
      ['61 a 90 días', (d) => d >= 61 && d <= 90],
      ['Más de 90 días', (d) => d > 90],
    ];
    const pagos = await this.prisma.pago.findMany({ where: { anuladoEn: null, fecha: { gte: aFecha(p.desde), lte: corte } }, select: { monto: true, metodo: true, fecha: true } });
    const porResponsable = agrupar(vencidas, (x) => x.c.contrato.trabajo.prospecto.responsable.id);
    return {
      ...p,
      porCobrar,
      vencido,
      morosidad: porCobrar ? Math.round((vencido / porCobrar) * 1000) / 1000 : null,
      antiguedad: tramos.map(([tramo, cumple]) => {
        const lista = conSaldo.filter((x) => cumple(x.atraso));
        return { tramo, monto: redondear(lista.reduce((s, x) => s + x.saldo, 0)), cuotas: lista.length };
      }),
      cobradoEnPeriodo: redondear(pagos.reduce((s, x) => s + Number(x.monto), 0)),
      cobradoPorMetodo: [...agrupar(pagos, (x) => x.metodo)].map(([metodo, lista]) => ({ metodo, monto: redondear(lista.reduce((s, x) => s + Number(x.monto), 0)) })),
      cobradoPorMes: [...agrupar(pagos, (x) => soloFecha(x.fecha).slice(0, 7))]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, lista]) => ({ mes, monto: redondear(lista.reduce((s, x) => s + Number(x.monto), 0)) })),
      vencidoPorResponsable: [...porResponsable]
        .map(([, lista]) => ({ usuario: lista[0].c.contrato.trabajo.prospecto.responsable, monto: redondear(lista.reduce((s, x) => s + x.saldo, 0)), cuotas: lista.length }))
        .sort((a, b) => b.monto - a.monto),
    };
  }

  // ─── Rentabilidad (confidencial) ─────────────────────────

  /**
   * Trabajos con contrato firmado en el periodo: ingresos (monto del contrato) menos horas reales por el costo
   * por hora vigente de cada persona, menos horas extra (a su costo por hora) y bonos.
   */
  async rentabilidad(p: Periodo): Promise<ReporteRentabilidad> {
    const trabajos = await this.prisma.trabajo.findMany({
      where: { eliminadoEn: null, estado: { not: 'cancelado' }, contrato: { estado: 'vigente', fechaFirma: { gte: aFecha(p.desde), lte: aFecha(p.hasta) } } },
      include: {
        tipoTrabajo: { select: { nombre: true } },
        nivelAcademico: { select: { nombre: true } },
        universidad: { select: { nombre: true, siglas: true } },
        contrato: { include: { cuotas: { select: { monto: true } } } },
        tareas: { select: { tiempos: { where: { fin: { not: null } }, select: { usuarioId: true, inicio: true, minutos: true } } } },
        extras: { where: { estado: { in: ['aprobada', 'realizada'] } } },
      },
    });
    const usuarios = [...new Set(trabajos.flatMap((t) => [...t.tareas.flatMap((x) => x.tiempos.map((r) => r.usuarioId)), ...t.extras.map((x) => x.usuarioId)]))];
    const costos = (await this.prisma.costoHoraUsuario.findMany({ where: { usuarioId: { in: usuarios } } })).map((c) => ({
      usuarioId: c.usuarioId,
      costo: Number(c.costo),
      vigenteDesde: soloFecha(c.vigenteDesde),
    }));

    const filas = trabajos.map((t) => {
      const ingresos = redondear(t.contrato!.cuotas.reduce((s, c) => s + Number(c.monto), 0));
      let costoPersonal = 0;
      let minutos = 0;
      let minutosSinCosto = 0;
      for (const r of t.tareas.flatMap((x) => x.tiempos)) {
        const costo = costoEn(costos, r.usuarioId, diaEnLima(r.inicio));
        minutos += r.minutos ?? 0;
        if (costo === null) minutosSinCosto += r.minutos ?? 0;
        else costoPersonal += ((r.minutos ?? 0) / 60) * costo;
      }
      let costoExtras = 0;
      let bonos = 0;
      for (const x of t.extras) {
        if (x.modalidad === 'bono') bonos += Number(x.monto);
        else {
          const costo = costoEn(costos, x.usuarioId, soloFecha(x.fecha!)) ?? 0;
          costoExtras += ((x.minutosReales ?? x.minutoFin! - x.minutoInicio!) / 60) * costo;
        }
      }
      const margen = ingresos - costoPersonal - costoExtras - bonos;
      return {
        id: t.id,
        codigo: t.codigo,
        titulo: t.titulo,
        tipoTrabajo: t.tipoTrabajo.nombre,
        estado: t.estado,
        nivel: t.nivelAcademico?.nombre ?? 'Sin nivel',
        universidad: t.universidad ? (t.universidad.siglas ?? t.universidad.nombre) : 'Sin universidad',
        ingresos,
        costoPersonal: redondear(costoPersonal),
        costoExtras: redondear(costoExtras),
        bonos: redondear(bonos),
        margen: redondear(margen),
        margenPorcentaje: ingresos ? Math.round((margen / ingresos) * 1000) / 1000 : null,
        horas: redondear(minutos / 60),
        horasSinCosto: redondear(minutosSinCosto / 60),
      };
    });
    const sumar = (lista: typeof filas): FilaRentabilidad => {
      const ingresos = redondear(lista.reduce((s, x) => s + x.ingresos, 0));
      const margen = redondear(lista.reduce((s, x) => s + x.margen, 0));
      return {
        ingresos,
        costoPersonal: redondear(lista.reduce((s, x) => s + x.costoPersonal, 0)),
        costoExtras: redondear(lista.reduce((s, x) => s + x.costoExtras, 0)),
        bonos: redondear(lista.reduce((s, x) => s + x.bonos, 0)),
        margen,
        margenPorcentaje: ingresos ? Math.round((margen / ingresos) * 1000) / 1000 : null,
        horas: redondear(lista.reduce((s, x) => s + x.horas, 0)),
      };
    };
    const grupo = (clave: (x: (typeof filas)[number]) => string) =>
      [...agrupar(filas, clave)].map(([n, lista]) => ({ nombre: n, trabajos: lista.length, ...sumar(lista) })).sort((a, b) => b.margen - a.margen);
    return {
      ...p,
      total: sumar(filas),
      trabajos: filas.sort((a, b) => (a.margenPorcentaje ?? 0) - (b.margenPorcentaje ?? 0)).map(({ nivel: _n, universidad: _u, ...resto }) => resto),
      porTipo: grupo((x) => x.tipoTrabajo),
      porNivel: grupo((x) => x.nivel),
      porUniversidad: grupo((x) => x.universidad),
    };
  }

  // ─── Conversión del embudo comercial ─────────────────────

  /**
   * Prospectos registrados en el periodo (cohorte) y en qué terminaron: convertidos en cliente, perdidos o aún abiertos.
   * Para el embudo, un prospecto "alcanzó" una etapa si llegó a ella o a una posterior (por su etapa actual o su historial).
   */
  async conversion(p: Periodo): Promise<ReporteConversion> {
    const [prospectos, etapas] = await Promise.all([
      this.prisma.prospecto.findMany({
        where: { eliminadoEn: null, creadoEn: { gte: instanteDesdeLima(p.desde, '00:00'), lt: instanteDesdeLima(sumarDias(p.hasta, 1), '00:00') } },
        select: {
          creadoEn: true,
          etapaId: true,
          etapa: { select: { clase: true } },
          origen: { select: { id: true, nombre: true } },
          captadoPor: { select: CAMPOS_USUARIO },
          tipoTrabajo: { select: { id: true, nombre: true } },
          motivoPerdida: { select: { nombre: true } },
          eventos: { where: { tipo: 'cambio_etapa' }, select: { datos: true } },
          trabajo: {
            select: {
              creadoEn: true,
              eliminadoEn: true,
              estado: true,
              contrato: { select: { estado: true, cuotas: { select: { monto: true } } } },
            },
          },
        },
      }),
      this.prisma.etapaProspecto.findMany({ orderBy: { orden: 'asc' } }),
    ]);
    const inicial = etapas.find((e) => e.inicial);
    const ordenDe = new Map(etapas.map((e) => [e.id, e]));

    const filas = prospectos.map((x) => {
      const convertido = !!x.trabajo && !x.trabajo.eliminadoEn;
      const contrato = convertido && x.trabajo!.estado !== 'cancelado' && x.trabajo!.contrato?.estado === 'vigente' ? x.trabajo!.contrato : null;
      const visitadas = new Set([x.etapaId, ...(inicial ? [inicial.id] : [])]);
      for (const ev of x.eventos) {
        const hacia = (ev.datos as { hacia?: unknown } | null)?.hacia;
        if (typeof hacia === 'string') visitadas.add(hacia);
      }
      // La etapa más avanzada a la que llegó, sin contar las de pérdida.
      const maximo = Math.max(0, ...[...visitadas].map((id) => ordenDe.get(id)).filter((e) => e && e.clase !== 'perdida').map((e) => e!.orden));
      return {
        mes: diaEnLima(x.creadoEn).slice(0, 7),
        etapaId: x.etapaId,
        visitadas,
        maximo,
        origen: x.origen,
        captadoPor: x.captadoPor,
        tipoTrabajo: x.tipoTrabajo,
        motivo: x.motivoPerdida?.nombre ?? 'Sin motivo',
        convertido,
        perdido: !convertido && x.etapa.clase === 'perdida',
        monto: contrato ? contrato.cuotas.reduce((s, c) => s + Number(c.monto), 0) : 0,
        dias: convertido ? dias(diaEnLima(x.creadoEn), diaEnLima(x.trabajo!.creadoEn)) : null,
      };
    });

    const fila = (clave: string, nombreFila: string, lista: typeof filas): FilaConversion => {
      const convertidos = lista.filter((x) => x.convertido).length;
      const perdidos = lista.filter((x) => x.perdido).length;
      return {
        clave,
        nombre: nombreFila,
        prospectos: lista.length,
        convertidos,
        perdidos,
        abiertos: lista.length - convertidos - perdidos,
        tasa: lista.length ? Math.round((convertidos / lista.length) * 1000) / 1000 : null,
        monto: redondear(lista.reduce((s, x) => s + x.monto, 0)),
      };
    };
    const grupo = (clave: (x: (typeof filas)[number]) => { id: string; nombre: string }) =>
      [...agrupar(filas, (x) => clave(x).id)]
        .map(([id, lista]) => fila(id, clave(lista[0]).nombre, lista))
        .sort((a, b) => b.convertidos - a.convertidos || b.prospectos - a.prospectos || a.nombre.localeCompare(b.nombre));

    const total = fila('total', 'Total', filas);
    const conDias = filas.filter((x) => x.dias !== null);
    return {
      ...p,
      total: {
        ...total,
        diasPromedio: conDias.length ? Math.round((conDias.reduce((s, x) => s + x.dias!, 0) / conDias.length) * 10) / 10 : null,
        ticketPromedio: total.convertidos ? redondear(total.monto / total.convertidos) : null,
      },
      embudo: etapas
        .filter((e) => e.activa || filas.some((x) => x.visitadas.has(e.id)))
        .map((e) => ({
          id: e.id,
          nombre: e.nombre,
          color: e.color,
          clase: e.clase,
          alcanzaron: filas.filter((x) => (e.clase === 'perdida' ? x.visitadas.has(e.id) : x.maximo >= e.orden)).length,
          actuales: filas.filter((x) => x.etapaId === e.id).length,
        })),
      porOrigen: grupo((x) => x.origen),
      porAsistente: grupo((x) => ({ id: x.captadoPor.id, nombre: nombre(x.captadoPor) })),
      porTipo: grupo((x) => x.tipoTrabajo),
      porMes: [...agrupar(filas, (x) => x.mes)].sort(([a], [b]) => a.localeCompare(b)).map(([mes, lista]) => fila(mes, mes, lista)),
      motivosPerdida: [...agrupar(filas.filter((x) => x.perdido), (x) => x.motivo)]
        .map(([n, lista]) => ({ nombre: n, cantidad: lista.length }))
        .sort((a, b) => b.cantidad - a.cantidad),
    };
  }

  // ─── Tablero ─────────────────────────────────────────────

  async tablero(p: Periodo, usuarioId: string): Promise<Tablero> {
    const verCostos = 'usuarios.ver_costo_hora' in (await this.permisos.efectivos(usuarioId));
    const periodoOcupacion = dias(p.desde, p.hasta) > MAX_DIAS_OCUPACION ? { desde: sumarDias(p.hasta, -MAX_DIAS_OCUPACION), hasta: p.hasta } : p;
    const [puntualidad, retrabajo, ocupacion, cobranza, rentabilidad, conversion] = await Promise.all([
      this.puntualidad(p),
      this.retrabajo(p),
      this.ocupacion(periodoOcupacion),
      this.cobranza(p),
      verCostos ? this.rentabilidad(p) : Promise.resolve(null),
      this.conversion(p),
    ]);
    return {
      ...p,
      puntualidad: puntualidad.total.porcentaje,
      entregables: puntualidad.total.total,
      retrabajo: retrabajo.total.promedio,
      ocupacion: ocupacion.total.porcentaje,
      porCobrar: cobranza.porCobrar,
      vencido: cobranza.vencido,
      cobrado: cobranza.cobradoEnPeriodo,
      margen: rentabilidad?.total.margen ?? null,
      margenPorcentaje: rentabilidad?.total.margenPorcentaje ?? null,
      prospectos: conversion.total.prospectos,
      conversion: conversion.total.tasa,
      puntualidadPorMes: puntualidad.porMes,
      antiguedad: cobranza.antiguedad,
      ocupacionPorPersona: ocupacion.personas.map((x) => ({ nombre: x.usuario.nombres, porcentaje: x.porcentaje })),
    };
  }

  // ─── Costo por hora ──────────────────────────────────────

  async costos(usuarioId: string): Promise<CostoHoraItem[]> {
    if (!(await this.prisma.usuario.count({ where: { id: usuarioId, eliminadoEn: null } }))) throw new NotFoundException('Usuario no encontrado');
    const filas = await this.prisma.costoHoraUsuario.findMany({ where: { usuarioId }, orderBy: { vigenteDesde: 'desc' } });
    const autores = await this.prisma.usuario.findMany({ where: { id: { in: filas.map((f) => f.creadoPorId).filter((x): x is string => Boolean(x)) } }, select: CAMPOS_USUARIO });
    return filas.map((f) => ({
      id: f.id,
      costo: Number(f.costo),
      vigenteDesde: soloFecha(f.vigenteDesde),
      creadoPor: autores.find((a) => a.id === f.creadoPorId) ?? null,
      creadoEn: f.creadoEn.toISOString(),
    }));
  }

  /** Un costo nuevo rige desde una fecha; para corregir uno existente se registra otro con la misma fecha. */
  async guardarCosto(usuarioId: string, datos: CostoHoraDatos, actor: { usuarioId: string; ip: string | null }): Promise<CostoHoraItem[]> {
    if (!('usuarios.editar' in (await this.permisos.efectivos(actor.usuarioId)))) throw new ForbiddenException('No tienes permiso para esta acción');
    await this.costos(usuarioId);
    const fila = await this.prisma.costoHoraUsuario.upsert({
      where: { usuarioId_vigenteDesde: { usuarioId, vigenteDesde: aFecha(datos.vigenteDesde) } },
      create: { usuarioId, costo: datos.costo, vigenteDesde: aFecha(datos.vigenteDesde), creadoPorId: actor.usuarioId },
      update: { costo: datos.costo, creadoPorId: actor.usuarioId },
    });
    // Confidencial: la auditoría registra el cambio, pero no el monto.
    await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'costo_hora', entidad: 'usuario', entidadId: usuarioId, despues: { vigenteDesde: datos.vigenteDesde, registro: fila.id }, ip: actor.ip });
    return this.costos(usuarioId);
  }

  async quitarCosto(usuarioId: string, costoId: string, actor: { usuarioId: string; ip: string | null }): Promise<CostoHoraItem[]> {
    if (!('usuarios.editar' in (await this.permisos.efectivos(actor.usuarioId)))) throw new ForbiddenException('No tienes permiso para esta acción');
    const c = await this.prisma.costoHoraUsuario.findFirst({ where: { id: costoId, usuarioId } });
    if (!c) throw new NotFoundException('Costo no encontrado');
    if ((await this.prisma.costoHoraUsuario.count({ where: { usuarioId } })) === 1 && soloFecha(c.vigenteDesde) <= diaEnLima()) {
      throw new ConflictException('Es su único costo vigente: registra otro en lugar de quitarlo');
    }
    await this.prisma.costoHoraUsuario.delete({ where: { id: costoId } });
    await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'quitar_costo_hora', entidad: 'usuario', entidadId: usuarioId, antes: { vigenteDesde: soloFecha(c.vigenteDesde) }, ip: actor.ip });
    return this.costos(usuarioId);
  }
}
