/**
 * Programación secuencial: acomoda las tareas de la cola de una persona, una tras
 * otra, en sus huecos libres (horario − días no laborables − reuniones). Sin base de datos.
 * Las horas son minutos desde las 00:00 en Lima.
 */
import { diaEnLima, type Intervalo, type Semaforo } from '@grupoes/shared';
import { restar } from './disponibilidad.js';

/** Hasta cuántos días hacia adelante se planifica la cola. */
export const HORIZONTE_DIAS = 120;
/** Holgura "justa" (ámbar): terminar el mismo día o un día antes de la fecha límite. */
const HOLGURA_JUSTA = 1;

export interface DiaLibre {
  fecha: string;
  /** Tiempo libre del día para la cola: tramos libres menos las tareas con hora. */
  huecos: Intervalo[];
}

export interface TareaEnCola {
  id: string;
  minutos: number;
  /** No empieza antes de este día. */
  noAntesDe: string;
}

export interface Segmento {
  fecha: string;
  inicio: number;
  fin: number;
}

export interface PlanCola {
  segmentos: Segmento[];
  /** null si no alcanza el horizonte para terminarla. */
  inicio: Segmento | null;
  fin: Segmento | null;
}

/** Huecos del día: lo libre del horario menos las tareas con hora (reuniones, que no se mueven). */
export function huecosDelDia(libres: Intervalo[], ocupados: Intervalo[]): Intervalo[] {
  return restar(libres, ocupados);
}

/**
 * Planifica la cola en orden. `ahora` recorta el día de hoy (no se programa en el pasado).
 * Una tarea larga se reparte en varios días.
 */
export function planificar(dias: DiaLibre[], tareas: TareaEnCola[], ahora: { fecha: string; minuto: number }): Map<string, PlanCola> {
  // Copia de los huecos para ir consumiéndolos.
  const disponibles = dias
    .filter((d) => d.fecha >= ahora.fecha)
    .map((d) => ({
      fecha: d.fecha,
      huecos: d.fecha === ahora.fecha ? restar(d.huecos, [{ inicio: 0, fin: ahora.minuto }]) : d.huecos.map((h) => ({ ...h })),
    }));

  const planes = new Map<string, PlanCola>();
  let indiceDia = 0;
  for (const tarea of tareas) {
    let restante = tarea.minutos;
    const segmentos: Segmento[] = [];
    let i = indiceDia;
    while (restante > 0 && i < disponibles.length) {
      const dia = disponibles[i];
      if (dia.fecha < tarea.noAntesDe) {
        i++;
        continue;
      }
      const hueco = dia.huecos[0];
      if (!hueco) {
        i++;
        continue;
      }
      const usa = Math.min(restante, hueco.fin - hueco.inicio);
      segmentos.push({ fecha: dia.fecha, inicio: hueco.inicio, fin: hueco.inicio + usa });
      restante -= usa;
      if (usa === hueco.fin - hueco.inicio) dia.huecos.shift();
      else hueco.inicio += usa;
    }
    // La siguiente tarea sigue donde terminó esta (la cola es estrictamente secuencial).
    if (segmentos.length > 0) indiceDia = disponibles.findIndex((d) => d.fecha === segmentos.at(-1)!.fecha);
    const completa = restante === 0;
    planes.set(tarea.id, { segmentos, inicio: completa ? segmentos[0] : null, fin: completa ? segmentos.at(-1)! : null });
  }
  return planes;
}

/** Días entre el fin planificado y la fecha límite (negativo = no llega). */
export function holgura(finFecha: string | null, fechaLimite: string): { dias: number | null; semaforo: Semaforo } {
  if (!finFecha) return { dias: null, semaforo: 'sin_plan' };
  const dias = Math.round((Date.parse(`${fechaLimite}T12:00:00Z`) - Date.parse(`${finFecha}T12:00:00Z`)) / 86_400_000);
  return { dias, semaforo: dias < 0 ? 'rojo' : dias <= HOLGURA_JUSTA ? 'ambar' : 'verde' };
}

/** Minuto actual del día en Lima. */
export function ahoraEnLima(instante = new Date()): { fecha: string; minuto: number } {
  const lima = new Date(instante.getTime() - 5 * 3_600_000);
  return { fecha: diaEnLima(instante), minuto: lima.getUTCHours() * 60 + lima.getUTCMinutes() };
}
