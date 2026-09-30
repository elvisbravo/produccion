import type { ProspectoDetalle, ProspectoListadoItem } from '@grupoes/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { CAMPOS_PERSONA } from '../personas/personas.service.js';

const CAMPOS_USUARIO = { id: true, nombres: true, apellidos: true } as const;
const CAMPOS_ETAPA = { id: true, nombre: true, color: true, clase: true } as const;

export const INCLUIR_LISTADO = {
  tipoTrabajo: { select: { nombre: true } },
  nivelAcademico: { select: { nombre: true } },
  universidad: { select: { nombre: true, siglas: true } },
  carrera: { select: { nombre: true } },
  etapa: { select: CAMPOS_ETAPA },
  prioridad: { select: { nombre: true, color: true } },
  responsable: { select: CAMPOS_USUARIO },
  contactos: { orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }], select: { esPrincipal: true, persona: { select: CAMPOS_PERSONA } } },
} as const satisfies Prisma.ProspectoInclude;

export const INCLUIR_DETALLE = {
  tipoTrabajo: { select: { id: true, nombre: true } },
  prioridad: { select: { id: true, nombre: true, color: true } },
  nivelAcademico: { select: { id: true, nombre: true } },
  universidad: { select: { id: true, nombre: true } },
  carrera: { select: { id: true, nombre: true } },
  origen: { select: { id: true, nombre: true } },
  referidoPor: { select: CAMPOS_PERSONA },
  etapa: { select: CAMPOS_ETAPA },
  captadoPor: { select: CAMPOS_USUARIO },
  responsable: { select: CAMPOS_USUARIO },
  contactos: { orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }], select: { esPrincipal: true, persona: { select: CAMPOS_PERSONA } } },
  eventos: { orderBy: { fecha: 'desc' }, take: 100, include: { usuario: { select: CAMPOS_USUARIO } } },
} as const satisfies Prisma.ProspectoInclude;

type ProspectoListado = Prisma.ProspectoGetPayload<{ include: typeof INCLUIR_LISTADO }>;
type ProspectoConDetalle = Prisma.ProspectoGetPayload<{ include: typeof INCLUIR_DETALLE }>;

/** Fecha de una columna DATE como 'YYYY-MM-DD'. */
const soloFecha = (fecha: Date | null) => (fecha ? fecha.toISOString().slice(0, 10) : null);

export function aListado(p: ProspectoListado): ProspectoListadoItem {
  return {
    id: p.id,
    codigo: p.codigo,
    titulo: p.titulo,
    tipoTrabajo: p.tipoTrabajo.nombre,
    nivelAcademico: p.nivelAcademico?.nombre ?? null,
    universidad: p.universidad ? (p.universidad.siglas ?? p.universidad.nombre) : null,
    carrera: p.carrera?.nombre ?? null,
    etapa: p.etapa,
    prioridad: p.prioridad,
    temperatura: p.temperatura,
    contactoPrincipal: p.contactos[0]?.persona ?? null,
    totalContactos: p.contactos.length,
    responsable: p.responsable,
    creadoEn: p.creadoEn.toISOString(),
  };
}

export function aDetalle(p: ProspectoConDetalle): ProspectoDetalle {
  return {
    id: p.id,
    codigo: p.codigo,
    titulo: p.titulo,
    tipoTrabajo: p.tipoTrabajo,
    prioridad: p.prioridad,
    nivelAcademico: p.nivelAcademico,
    universidad: p.universidad,
    carrera: p.carrera,
    origen: p.origen,
    referidoPor: p.referidoPor,
    fechaEntregaTentativa: soloFecha(p.fechaEntregaTentativa),
    linkDrive: p.linkDrive,
    observaciones: p.observaciones,
    detalles: p.detalles,
    etapa: p.etapa,
    temperatura: p.temperatura,
    contactos: p.contactos.map((c) => ({ ...c.persona, esPrincipal: c.esPrincipal })),
    captadoPor: p.captadoPor,
    responsable: p.responsable,
    creadoEn: p.creadoEn.toISOString(),
    actualizadoEn: p.actualizadoEn.toISOString(),
    eventos: p.eventos.map((e) => ({ id: e.id, tipo: e.tipo, detalle: e.detalle, usuario: e.usuario, fecha: e.fecha.toISOString() })),
  };
}
