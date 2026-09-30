/**
 * Cálculo de disponibilidad, sin base de datos: a partir del horario, los
 * feriados, el cumpleaños, las ausencias y las tareas de un día.
 * Todas las horas son minutos desde las 00:00 en Lima.
 */
import {
  diaSemanaDe,
  minutosAHora,
  type BloqueoDia,
  type DiaAgenda,
  type Disponibilidad,
  type EstadoDia,
  type EstadoTarea,
  type Intervalo,
  type TareaAgenda,
  type TramoSemanal,
} from '@grupoes/shared';

/** Un feriado de medio día libera la tarde: se trabaja hasta esta hora. */
export const FIN_MEDIO_DIA = 13 * 60;
/** Desde qué proporción de su capacidad un día se considera "ocupado". */
const UMBRAL_OCUPADO = 0.75;
/** Estados de tarea que ocupan tiempo en la agenda. */
const ESTADOS_QUE_OCUPAN: readonly EstadoTarea[] = ['pendiente', 'en_proceso', 'completada', 'no_asistio'];
const ESTADOS_QUE_CHOCAN: readonly EstadoTarea[] = ['pendiente', 'en_proceso'];

export interface HorarioVigencia {
  /** YYYY-MM-DD */
  vigenteDesde: string;
  tramos: TramoSemanal[];
}

/** Tramos del día según el horario vigente (el más reciente que ya empezó) o, si no hay, los de la plantilla por defecto. */
export function tramosDelDia(fecha: string, horarios: HorarioVigencia[], porDefecto: TramoSemanal[]): Intervalo[] {
  const vigente = horarios.filter((h) => h.vigenteDesde <= fecha).sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))[0];
  const diaSemana = diaSemanaDe(fecha);
  return (vigente?.tramos ?? porDefecto)
    .filter((t) => t.diaSemana === diaSemana)
    .map(({ inicio, fin }) => ({ inicio, fin }))
    .sort((a, b) => a.inicio - b.inicio);
}

/** Cumpleaños: mismo mes y día (quien nació un 29 de febrero lo celebra el 28 en años no bisiestos). */
export function esCumpleanos(fechaNacimiento: string | null, fecha: string): boolean {
  if (!fechaNacimiento) return false;
  const nacimiento = fechaNacimiento.slice(5);
  const dia = fecha.slice(5);
  if (nacimiento === '02-29') {
    const anio = Number(fecha.slice(0, 4));
    const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
    return dia === (bisiesto ? '02-29' : '02-28');
  }
  return nacimiento === dia;
}

/** Resta intervalos: lo que queda de `base` fuera de `quitar`. */
export function restar(base: Intervalo[], quitar: Intervalo[]): Intervalo[] {
  let resultado = base.map((i) => ({ ...i }));
  for (const q of quitar) {
    resultado = resultado.flatMap((i) => {
      if (q.fin <= i.inicio || q.inicio >= i.fin) return [i];
      const partes: Intervalo[] = [];
      if (q.inicio > i.inicio) partes.push({ inicio: i.inicio, fin: q.inicio });
      if (q.fin < i.fin) partes.push({ inicio: q.fin, fin: i.fin });
      return partes;
    });
  }
  return resultado;
}

const cruza = (a: Intervalo, b: Intervalo) => a.inicio < b.fin && b.inicio < a.fin;
const rango = (i: Intervalo) => `${minutosAHora(i.inicio)}–${minutosAHora(i.fin)}`;
const horas = (minutos: number) => `${Math.round((minutos / 60) * 10) / 10} h`;

export interface EntradaDia {
  fecha: string;
  tramos: Intervalo[];
  feriado: { nombre: string; medioDia: boolean } | null;
  cumpleanos: boolean;
  ausencias: { tipo: BloqueoDia['tipo']; nombre: string; intervalo: Intervalo | null }[];
  tareas: TareaAgenda[];
}

export function calcularDia(e: EntradaDia): DiaAgenda {
  const bloqueos: BloqueoDia[] = [];
  if (e.feriado) {
    bloqueos.push({
      tipo: 'feriado',
      nombre: e.feriado.medioDia ? `${e.feriado.nombre} (medio día)` : e.feriado.nombre,
      intervalo: e.feriado.medioDia ? { inicio: FIN_MEDIO_DIA, fin: 24 * 60 } : null,
    });
  }
  if (e.cumpleanos) bloqueos.push({ tipo: 'cumpleanos', nombre: 'Cumpleaños', intervalo: null });
  bloqueos.push(...e.ausencias);

  const diaCompleto = bloqueos.some((b) => !b.intervalo);
  const libres = diaCompleto ? [] : restar(e.tramos, bloqueos.flatMap((b) => (b.intervalo ? [b.intervalo] : [])));
  const capacidad = libres.reduce((s, i) => s + i.fin - i.inicio, 0);
  const ocupado = e.tareas.filter((t) => ESTADOS_QUE_OCUPAN.includes(t.estado)).reduce((s, t) => s + t.minutos, 0);

  let estado: EstadoDia;
  if (diaCompleto || (capacidad === 0 && bloqueos.length > 0)) estado = 'no_laborable';
  else if (e.tramos.length === 0) estado = 'descanso';
  else if (ocupado > capacidad) estado = 'sobrecargado';
  else if (ocupado > capacidad * UMBRAL_OCUPADO) estado = 'ocupado';
  else estado = 'libre';

  return {
    fecha: e.fecha,
    diaSemana: diaSemanaDe(e.fecha),
    tramos: e.tramos,
    bloqueos,
    libres,
    capacidad,
    ocupado,
    estado,
    tareas: [...e.tareas].sort((a, b) => (a.inicio ?? 9999) - (b.inicio ?? 9999)),
  };
}

/**
 * ¿Puede la persona hacer una tarea ese día (y a esa hora, si la tiene)?
 * - Un día u hora no laborable **bloquea** (no se puede asignar).
 * - Choques, fuera de horario y capacidad superada son **avisos** que se pueden forzar con un motivo.
 */
export function evaluar(dia: DiaAgenda, tarea: { id?: string; inicio: number | null; minutos: number }): Disponibilidad {
  const otras = dia.tareas.filter((t) => t.id !== tarea.id);
  const ocupado = otras.filter((t) => ESTADOS_QUE_OCUPAN.includes(t.estado)).reduce((s, t) => s + t.minutos, 0);
  const base = { capacidad: dia.capacidad, ocupado };

  const total = dia.bloqueos.find((b) => !b.intervalo);
  if (total) return { ...base, estado: 'no_laborable', bloqueo: total.nombre, avisos: [] };

  const intervalo = tarea.inicio === null ? null : { inicio: tarea.inicio, fin: tarea.inicio + tarea.minutos };
  if (intervalo) {
    const parcial = dia.bloqueos.find((b) => b.intervalo && cruza(b.intervalo, intervalo));
    if (parcial) return { ...base, estado: 'no_laborable', bloqueo: `${parcial.nombre} (${rango(parcial.intervalo!)})`, avisos: [] };
  } else if (dia.capacidad === 0 && dia.bloqueos.length > 0) {
    return { ...base, estado: 'no_laborable', bloqueo: dia.bloqueos.map((b) => b.nombre).join(', '), avisos: [] };
  }

  const avisos: string[] = [];
  let estado: Disponibilidad['estado'] = 'libre';

  const choques = intervalo
    ? otras.filter((t) => ESTADOS_QUE_CHOCAN.includes(t.estado) && t.inicio !== null && cruza({ inicio: t.inicio, fin: t.fin! }, intervalo))
    : [];
  for (const c of choques) avisos.push(`Choca con "${c.actividad}" (${rango({ inicio: c.inicio!, fin: c.fin! })})`);

  const fuera = intervalo ? !dia.libres.some((l) => l.inicio <= intervalo.inicio && intervalo.fin <= l.fin) : dia.tramos.length === 0;
  if (fuera) avisos.push(dia.tramos.length === 0 ? 'Ese día no está en su horario' : 'Fuera de su horario');

  const excede = ocupado + tarea.minutos > dia.capacidad;
  if (excede && dia.tramos.length > 0) avisos.push(`Supera su capacidad del día (${horas(ocupado + tarea.minutos)} de ${horas(dia.capacidad)})`);

  if (choques.length > 0) estado = 'ocupado';
  else if (fuera) estado = 'fuera_horario';
  else if (excede) estado = 'sobrecargado';

  return { ...base, estado, bloqueo: null, avisos };
}
