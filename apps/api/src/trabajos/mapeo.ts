import { diaEnLima, seguimientoDe } from '@grupoes/shared';
import type { AdicionalItem, ContratoDetalle, MiembroEquipo, PagoDetalle, TrabajoDetalle, TrabajoListadoItem } from '@grupoes/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { CAMPOS_PERSONA } from '../personas/personas.service.js';
import { centimosDe, detalleCuota, resumenCuenta, type CuotaCalculo } from './cuenta.js';

const CAMPOS_USUARIO = { id: true, nombres: true, apellidos: true } as const;
const soloFecha = (fecha: Date) => fecha.toISOString().slice(0, 10);

const INCLUIR_CUOTAS = {
  orderBy: { numero: 'asc' },
  include: { aplicaciones: { where: { pago: { anuladoEn: null } }, select: { montoAplicado: true } }, adicional: { select: { numero: true } } },
} as const satisfies Prisma.Contrato$cuotasArgs;

export const INCLUIR_LISTADO = {
  proveedor: { select: { id: true, nombres: true, apellidos: true } },
  tipoTrabajo: { select: { nombre: true } },
  nivelAcademico: { select: { nombre: true } },
  universidad: { select: { nombre: true, siglas: true } },
  carrera: { select: { nombre: true } },
  prioridad: { select: { nombre: true, color: true, permiteInsercionUrgente: true } },
  integrantes: { orderBy: [{ esTitular: 'desc' }, { orden: 'asc' }], select: { esTitular: true, persona: { select: CAMPOS_PERSONA } } },
  equipo: { where: { hasta: null }, include: { usuario: { select: CAMPOS_USUARIO } } },
  contrato: { include: { cuotas: INCLUIR_CUOTAS } },
  _count: { select: { entregables: { where: { estado: 'en_turnitin' } }, valoraciones: true } },
} as const satisfies Prisma.TrabajoInclude;

export const INCLUIR_DETALLE = {
  prospecto: { select: { id: true, codigo: true, clienteDirecto: true } },
  proveedor: { select: { id: true, nombres: true, apellidos: true } },
  actividadPlan: { select: { nombre: true } },
  tipoTrabajo: { select: { id: true, nombre: true } },
  prioridad: { select: { id: true, nombre: true, color: true, permiteInsercionUrgente: true } },
  nivelAcademico: { select: { id: true, nombre: true } },
  universidad: { select: { id: true, nombre: true } },
  carrera: { select: { id: true, nombre: true } },
  integrantes: { orderBy: [{ esTitular: 'desc' }, { orden: 'asc' }], select: { esTitular: true, persona: { select: CAMPOS_PERSONA } } },
  equipo: { orderBy: { desde: 'desc' }, include: { usuario: { select: CAMPOS_USUARIO }, asignadoPor: { select: CAMPOS_USUARIO } } },
  // Los ids (uuid v7) desempatan eventos del mismo instante en el orden en que se crearon.
  eventos: { orderBy: [{ fecha: 'desc' }, { id: 'desc' }], take: 100, include: { usuario: { select: CAMPOS_USUARIO } } },
  pausas: { where: { reanudadaEn: null }, take: 1, include: { creadaPor: { select: CAMPOS_USUARIO } } },
  valoraciones: { orderBy: { registradaEn: 'desc' }, take: 1, include: { registradaPor: { select: CAMPOS_USUARIO } } },
  fechasFijasPor: { select: CAMPOS_USUARIO },
  _count: { select: { entregables: { where: { estado: 'en_turnitin' } }, valoraciones: true } },
  contrato: {
    include: {
      cuotas: INCLUIR_CUOTAS,
      adicionales: {
        orderBy: { numero: 'asc' },
        include: {
          propuestoPor: { select: CAMPOS_USUARIO },
          respondidoPor: { select: CAMPOS_USUARIO },
          cuotas: { orderBy: { numero: 'asc' }, include: { aplicaciones: { where: { pago: { anuladoEn: null } }, select: { montoAplicado: true } } } },
        },
      },
      pagos: {
        orderBy: { registradoEn: 'desc' },
        include: {
          registradoPor: { select: CAMPOS_USUARIO },
          anuladoPor: { select: CAMPOS_USUARIO },
          aplicaciones: { include: { cuota: { select: { numero: true } } } },
        },
      },
    },
  },
} as const satisfies Prisma.TrabajoInclude;

type TrabajoListado = Prisma.TrabajoGetPayload<{ include: typeof INCLUIR_LISTADO }>;
type TrabajoConDetalle = Prisma.TrabajoGetPayload<{ include: typeof INCLUIR_DETALLE }>;
/** Basta con las aplicaciones; el adicional se incluye donde se muestra. */
type CuotaConAplicaciones = Prisma.CuotaGetPayload<{ include: { aplicaciones: { select: { montoAplicado: true } } } }> & { adicional?: { numero: number } | null };

export function aCalculo(c: CuotaConAplicaciones): CuotaCalculo {
  return {
    id: c.id,
    numero: c.numero,
    monto: centimosDe(c.monto),
    vencimiento: soloFecha(c.vencimiento),
    pagado: c.aplicaciones.reduce((s, a) => s + centimosDe(a.montoAplicado), 0),
    adicional: c.adicional?.numero ?? null,
  };
}

export function aListado(t: TrabajoListado, verMontos: boolean, hoy: string): TrabajoListadoItem {
  const vigente = (f: string) => t.equipo.find((e) => e.funcion === f)?.usuario ?? null;
  const cuenta = t.contrato && verMontos ? resumenCuenta(t.contrato.cuotas.map(aCalculo), hoy) : null;
  return {
    id: t.id,
    codigo: t.codigo,
    titulo: t.titulo,
    tipoTrabajo: t.tipoTrabajo.nombre,
    nivelAcademico: t.nivelAcademico?.nombre ?? null,
    universidad: t.universidad ? (t.universidad.siglas ?? t.universidad.nombre) : null,
    carrera: t.carrera?.nombre ?? null,
    prioridad: { nombre: t.prioridad.nombre, color: t.prioridad.color },
    estado: t.estado,
    seguimiento: seguimientoDe({ estado: t.estado, urgente: t.prioridad.permiteInsercionUrgente, pendientePago: (cuenta?.vencido ?? 0) > 0 && t.contrato?.estado === 'vigente', enTurnitin: t._count.entregables > 0, valorado: t._count.valoraciones > 0 }),
    fechasFijas: t.fechasFijas,
    fechaLimite: soloFecha(t.fechaLimite),
    proveedor: t.proveedor,
    titular: t.integrantes[0]?.persona ?? null,
    totalIntegrantes: t.integrantes.length,
    auxiliarPrincipal: vigente('auxiliar_principal'),
    jefeResponsable: vigente('jefe_responsable'),
    saldo: cuenta?.saldo ?? null,
    vencido: cuenta?.vencido ?? null,
  };
}

function aMiembro(e: TrabajoConDetalle['equipo'][number]): MiembroEquipo {
  return {
    id: e.id,
    usuario: e.usuario,
    funcion: e.funcion,
    desde: e.desde.toISOString(),
    hasta: e.hasta?.toISOString() ?? null,
    asignadoPor: e.asignadoPor,
    motivo: e.motivo,
  };
}

function aAdicional(a: NonNullable<TrabajoConDetalle['contrato']>['adicionales'][number]): AdicionalItem {
  const aceptado = a.estado === 'aceptado';
  return {
    id: a.id,
    numero: a.numero,
    descripcion: a.descripcion,
    monto: Number(a.monto),
    estado: a.estado,
    cuotas: aceptado
      ? a.cuotas.map((q) => ({ numero: q.numero, monto: Number(q.monto), vencimiento: soloFecha(q.vencimiento) }))
      : (a.cuotasPropuestas as { monto: number; vencimiento: string }[]).map((q) => ({ numero: null, ...q })),
    propuestoPor: a.propuestoPor,
    propuestoEn: a.propuestoEn.toISOString(),
    respondido: a.respondidoEn ? { por: a.respondidoPor, en: a.respondidoEn.toISOString() } : null,
    motivo: a.motivo,
    conPagos: a.cuotas.some((q) => q.aplicaciones.length > 0),
  };
}

function aContrato(c: NonNullable<TrabajoConDetalle['contrato']>, verMontos: boolean, hoy: string): ContratoDetalle {
  const cuotas = c.cuotas.map(aCalculo);
  const pagos: PagoDetalle[] = c.pagos.map((p) => ({
    id: p.id,
    numeroRecibo: p.numeroRecibo,
    monto: Number(p.monto),
    fecha: soloFecha(p.fecha),
    metodo: p.metodo,
    numeroOperacion: p.numeroOperacion,
    observaciones: p.observaciones,
    registradoPor: p.registradoPor,
    registradoEn: p.registradoEn.toISOString(),
    anulado: p.anuladoEn ? { en: p.anuladoEn.toISOString(), por: p.anuladoPor, motivo: p.motivoAnulacion } : null,
    cuotas: p.aplicaciones.map((a) => ({ numero: a.cuota.numero, monto: Number(a.montoAplicado) })).sort((a, b) => a.numero - b.numero),
  }));
  return {
    id: c.id,
    fechaFirma: soloFecha(c.fechaFirma),
    moneda: c.moneda,
    formaPago: c.formaPago,
    diasGarantia: c.diasGarantia,
    finGarantia: c.finGarantia ? soloFecha(c.finGarantia) : null,
    estado: c.estado,
    observaciones: c.observaciones,
    montoContrato: verMontos ? Number(c.montoTotal) : null,
    cuenta: verMontos ? resumenCuenta(cuotas, hoy) : null,
    adicionales: verMontos ? c.adicionales.map(aAdicional) : null,
    cuotas: verMontos ? cuotas.map((x) => detalleCuota(x, hoy)) : null,
    pagos: verMontos ? pagos : null,
  };
}

export function aDetalle(
  t: TrabajoConDetalle,
  permisos: { verContrato: boolean; verMontos: boolean },
  hoy: string,
  dioElEnfoque: TrabajoDetalle['dioElEnfoque'] = null,
): Omit<TrabajoDetalle, 'entregables' | 'hayPlantilla' | 'turnitin' | 'valoracion'> {
  return {
    id: t.id,
    codigo: t.codigo,
    prospecto: t.prospecto ? { id: t.prospecto.id, codigo: t.prospecto.codigo } : null,
    clienteDirecto: Boolean(t.prospecto?.clienteDirecto),
    proveedor: t.proveedor,
    planProveedor: t.actividadPlan && t.minutosPlan ? { actividad: t.actividadPlan.nombre, minutos: t.minutosPlan } : null,
    titulo: t.titulo,
    tipoTrabajo: t.tipoTrabajo,
    prioridad: { id: t.prioridad.id, nombre: t.prioridad.nombre, color: t.prioridad.color },
    nivelAcademico: t.nivelAcademico,
    universidad: t.universidad,
    carrera: t.carrera,
    linkDrive: t.linkDrive,
    observaciones: t.observaciones,
    detalles: t.detalles,
    fechaInicio: soloFecha(t.fechaInicio),
    fechaLimite: soloFecha(t.fechaLimite),
    estado: t.estado,
    // El pago pendiente solo se muestra a quien puede ver montos.
    seguimiento: seguimientoDe({
      estado: t.estado,
      urgente: t.prioridad.permiteInsercionUrgente,
      enTurnitin: t._count.entregables > 0,
      valorado: t._count.valoraciones > 0,
      pendientePago: permisos.verMontos && t.contrato?.estado === 'vigente' && resumenCuenta(t.contrato.cuotas.map(aCalculo), hoy).vencido > 0,
    }),
    fechasFijas: t.fechasFijas ? { motivo: t.fechasFijasMotivo ?? '', por: t.fechasFijasPor, desde: (t.fechasFijasEn ?? t.actualizadoEn).toISOString() } : null,
    pausa: t.pausas[0]
      ? {
          id: t.pausas[0].id,
          motivo: t.pausas[0].motivo,
          desde: t.pausas[0].creadaEn.toISOString(),
          dias: Math.max(0, Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${diaEnLima(t.pausas[0].creadaEn)}T12:00:00Z`)) / 86_400_000)),
          por: t.pausas[0].creadaPor,
          tareasPausadas: Array.isArray(t.pausas[0].tareasPausadas) ? t.pausas[0].tareasPausadas.length : 0,
        }
      : null,
    integrantes: t.integrantes.map((i) => ({ ...i.persona, esTitular: i.esTitular })),
    equipo: t.equipo.filter((e) => !e.hasta).map(aMiembro),
    historialEquipo: t.equipo.filter((e) => e.hasta).map(aMiembro),
    contrato: t.contrato && permisos.verContrato ? aContrato(t.contrato, permisos.verMontos, hoy) : null,
    eventos: t.eventos.map((e) => ({ id: e.id, tipo: e.tipo, detalle: e.detalle, usuario: e.usuario, fecha: e.fecha.toISOString() })),
    creadoEn: t.creadoEn.toISOString(),
    dioElEnfoque,
  };
}
