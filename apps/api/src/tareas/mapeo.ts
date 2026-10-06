import { diaEnLima, ESTADOS_ACTIVOS, type EstadoTarea, type TareaItem } from '@grupoes/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { CAMPOS_PERSONA } from '../personas/personas.service.js';

const CAMPOS_USUARIO = { id: true, nombres: true, apellidos: true } as const;

export const INCLUIR_TAREA = {
  actividad: { include: { tipo: true } },
  resultadoContacto: { select: { nombre: true } },
  creadaPor: { select: CAMPOS_USUARIO },
  prospecto: {
    select: {
      id: true,
      codigo: true,
      responsableId: true,
      contactos: { orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }], take: 1, select: { persona: { select: CAMPOS_PERSONA } } },
    },
  },
  responsables: {
    orderBy: { participacion: { orden: 'asc' } },
    include: {
      usuario: { select: CAMPOS_USUARIO },
      participacion: { select: { nombre: true } },
      rol: { select: { nombre: true } },
      prioridad: { select: { nombre: true } },
    },
  },
  personas: { select: { persona: { select: CAMPOS_PERSONA } } },
  trabajo: { select: { id: true, codigo: true, titulo: true } },
  entregable: { select: { id: true, nombre: true } },
  tiempos: { select: { usuarioId: true, inicio: true, fin: true, minutos: true } },
} as const satisfies Prisma.TareaInclude;

export type TareaCompleta = Prisma.TareaGetPayload<{ include: typeof INCLUIR_TAREA }>;

export const esActiva = (estado: EstadoTarea) => ESTADOS_ACTIVOS.includes(estado);

/** Minutos reales de una tarea: tramos cerrados más lo que lleva corriendo un cronómetro abierto. */
export function minutosReales(tiempos: { inicio: Date; fin: Date | null; minutos: number | null }[], ahora = new Date()): number {
  return tiempos.reduce((s, t) => s + (t.fin ? (t.minutos ?? 0) : Math.max(0, Math.round((ahora.getTime() - t.inicio.getTime()) / 60_000))), 0);
}

export const finDe = (inicio: Date, minutos: number) => new Date(inicio.getTime() + minutos * 60_000);

/** Vencida: activa y ya pasó su hora de fin (o su día, si no tiene hora). */
export function estaVencida(t: { estado: EstadoTarea; inicio: Date | null; fecha: Date; minutosEstimados: number }, ahora = new Date()): boolean {
  if (!esActiva(t.estado)) return false;
  if (t.inicio) return finDe(t.inicio, t.minutosEstimados) < ahora;
  return t.fecha.toISOString().slice(0, 10) < diaEnLima(ahora);
}

export function aTareaItem(t: TareaCompleta, ahora = new Date()): TareaItem {
  return {
    id: t.id,
    actividad: {
      id: t.actividad.id,
      nombre: t.actividad.nombre,
      comportamiento: t.actividad.tipo.comportamiento,
      color: t.actividad.tipo.color,
      esSeguimiento: t.actividad.esSeguimiento,
      requiereHoraFija: t.actividad.requiereHoraFija,
    },
    fecha: t.fecha.toISOString().slice(0, 10),
    inicio: t.inicio?.toISOString() ?? null,
    minutosEstimados: t.minutosEstimados,
    modalidad: t.modalidad,
    enlaceReunion: t.enlaceReunion,
    estado: t.estado,
    vencida: estaVencida(t, ahora),
    notas: t.notas,
    resultado: t.resultado,
    resultadoContacto: t.resultadoContacto?.nombre ?? null,
    completadaEn: t.completadaEn?.toISOString() ?? null,
    motivoCancelacion: t.motivoCancelacion,
    vecesReprogramada: t.vecesReprogramada,
    prospecto: t.prospecto
      ? { id: t.prospecto.id, codigo: t.prospecto.codigo, responsableId: t.prospecto.responsableId, contacto: t.prospecto.contactos[0]?.persona ?? null }
      : null,
    trabajo: t.trabajo,
    entregable: t.entregable,
    titulo: t.titulo,
    // Solo tramos cerrados: la web suma en vivo el tramo en curso (enCurso).
    minutosReales: minutosReales(t.tiempos.filter((x) => x.fin), ahora),
    enCurso: t.tiempos.filter((x) => !x.fin).map((x) => ({ usuarioId: x.usuarioId, inicio: x.inicio.toISOString() })),
    responsables: t.responsables.map((r) => ({
      usuario: r.usuario,
      participacion: r.participacion.nombre,
      rol: r.rol.nombre,
      prioridad: r.prioridad?.nombre ?? null,
      forzado: r.forzado,
    })),
    personas: t.personas.map((p) => p.persona),
    creadaPor: t.creadaPor,
  };
}

/** Orden natural de una lista de tareas: activas primero (por fecha/hora), luego las cerradas más recientes. */
export const ORDEN_TAREAS: Prisma.TareaOrderByWithRelationInput[] = [{ fecha: 'asc' }, { inicio: 'asc' }, { creadoEn: 'asc' }];
