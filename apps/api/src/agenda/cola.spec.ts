import { describe, expect, it } from 'vitest';
import { ahoraEnLima, holgura, huecosDelDia, planificar, type DiaLibre } from './cola.js';

const h = (hora: number) => hora * 60;
const jornada = [
  { inicio: h(8), fin: h(13) },
  { inicio: h(15), fin: h(19) },
];
// Lunes 5 al miércoles 7 de octubre de 2026.
const dias: DiaLibre[] = ['2026-10-05', '2026-10-06', '2026-10-07'].map((fecha) => ({ fecha, huecos: jornada }));
const temprano = { fecha: '2026-10-05', minuto: h(7) };

describe('planificar', () => {
  it('acomoda las tareas una tras otra y salta el refrigerio', () => {
    const plan = planificar(dias, [
      { id: 'a', minutos: h(4), noAntesDe: '2026-10-05' },
      { id: 'b', minutos: h(3), noAntesDe: '2026-10-05' },
    ], temprano);
    expect(plan.get('a')!.segmentos).toEqual([{ fecha: '2026-10-05', inicio: h(8), fin: h(12) }]);
    // "b" usa la hora que queda en la mañana y sigue después del refrigerio.
    expect(plan.get('b')!.segmentos).toEqual([
      { fecha: '2026-10-05', inicio: h(12), fin: h(13) },
      { fecha: '2026-10-05', inicio: h(15), fin: h(17) },
    ]);
  });

  it('una tarea larga ocupa varios días', () => {
    const plan = planificar(dias, [{ id: 'a', minutos: h(12), noAntesDe: '2026-10-05' }], temprano).get('a')!;
    expect(plan.inicio).toEqual({ fecha: '2026-10-05', inicio: h(8), fin: h(13) });
    expect(plan.fin).toEqual({ fecha: '2026-10-06', inicio: h(8), fin: h(11) });
  });

  it('no programa en el pasado', () => {
    const plan = planificar(dias, [{ id: 'a', minutos: 60, noAntesDe: '2026-10-05' }], { fecha: '2026-10-05', minuto: h(16) });
    expect(plan.get('a')!.inicio).toEqual({ fecha: '2026-10-05', inicio: h(16), fin: h(17) });
  });

  it('respeta "no antes de" sin que la siguiente tarea se adelante', () => {
    const plan = planificar(dias, [
      { id: 'a', minutos: 60, noAntesDe: '2026-10-06' },
      { id: 'b', minutos: 60, noAntesDe: '2026-10-05' },
    ], temprano);
    expect(plan.get('a')!.inicio!.fecha).toBe('2026-10-06');
    expect(plan.get('b')!.inicio).toEqual({ fecha: '2026-10-06', inicio: h(9), fin: h(10) });
  });

  it('con hora de inicio, la tarea no empieza antes de esa hora del día', () => {
    const plan = planificar(dias, [{ id: 'a', minutos: 60, noAntesDe: '2026-10-05', noAntesDeMinuto: h(10) + 30 }], temprano);
    expect(plan.get('a')!.inicio).toEqual({ fecha: '2026-10-05', inicio: h(10) + 30, fin: h(11) + 30 });
    // Una hora dentro del refrigerio pasa a la tarde
    const almuerzo = planificar(dias, [{ id: 'b', minutos: 60, noAntesDe: '2026-10-05', noAntesDeMinuto: h(13) + 30 }], temprano);
    expect(almuerzo.get('b')!.inicio).toEqual({ fecha: '2026-10-05', inicio: h(15), fin: h(16) });
    // La siguiente tarea sigue a continuación
    const dos = planificar(dias, [{ id: 'a', minutos: 60, noAntesDe: '2026-10-05', noAntesDeMinuto: h(10) }, { id: 'c', minutos: 60, noAntesDe: '2026-10-05' }], temprano);
    expect(dos.get('c')!.inicio).toEqual({ fecha: '2026-10-05', inicio: h(11), fin: h(12) });
  });

  it('una tarea retroactiva se programa desde su inicio aunque ya haya pasado; las demás, desde ahora', () => {
    const tarde = { fecha: '2026-10-06', minuto: h(15) };
    const diasPasados = [{ fecha: '2026-10-05', huecos: [{ inicio: h(9), fin: h(13) }, { inicio: h(15), fin: h(18) }] }, ...dias.filter((d) => d.fecha >= '2026-10-06')];
    const plan = planificar(
      diasPasados,
      [{ id: 'r', minutos: 120, noAntesDe: '2026-10-05', noAntesDeMinuto: h(10), retroactiva: true }, { id: 'n', minutos: 60, noAntesDe: '2026-10-05' }],
      tarde,
    );
    expect(plan.get('r')!.inicio).toEqual({ fecha: '2026-10-05', inicio: h(10), fin: h(12) });
    // La normal nunca cae antes de ahora (hoy 15:00), aunque su fecha sea anterior
    const n = plan.get('n')!.inicio!;
    expect(n.fecha > '2026-10-06' || (n.fecha === '2026-10-06' && n.inicio >= h(15))).toBe(true);
  });

  it('una reunión en medio del día parte el trabajo y lo que no cabe pasa al día siguiente', () => {
    // Día lleno (8–13 y 15–19) y entra una reunión de 16:00 a 17:00
    const conReunion: DiaLibre[] = dias.map((d) => (d.fecha === '2026-10-05' ? { fecha: d.fecha, huecos: huecosDelDia(jornada, [{ inicio: h(16), fin: h(17) }]) } : d));
    const plan = planificar(conReunion, [{ id: 'a', minutos: h(9), noAntesDe: '2026-10-05' }, { id: 'b', minutos: h(2), noAntesDe: '2026-10-05' }], temprano);
    expect(plan.get('a')!.segmentos).toEqual([
      { fecha: '2026-10-05', inicio: h(8), fin: h(13) },
      { fecha: '2026-10-05', inicio: h(15), fin: h(16) },
      { fecha: '2026-10-05', inicio: h(17), fin: h(19) },
      { fecha: '2026-10-06', inicio: h(8), fin: h(9) },
    ]);
    // Lo siguiente sigue a continuación, sin cruzarse con nada
    expect(plan.get('b')!.segmentos).toEqual([{ fecha: '2026-10-06', inicio: h(9), fin: h(11) }]);
  });

  it('si no alcanza el horizonte, queda sin fin', () => {
    const plan = planificar(dias, [{ id: 'a', minutos: h(40), noAntesDe: '2026-10-05' }], temprano).get('a')!;
    expect(plan.fin).toBeNull();
    expect(plan.segmentos).toHaveLength(6);
  });

  it('las reuniones son anclas: la cola las rodea', () => {
    const huecos = huecosDelDia(jornada, [{ inicio: h(10), fin: h(11) }]);
    const plan = planificar([{ fecha: '2026-10-05', huecos }], [{ id: 'a', minutos: h(3), noAntesDe: '2026-10-05' }], temprano).get('a')!;
    expect(plan.segmentos).toEqual([
      { fecha: '2026-10-05', inicio: h(8), fin: h(10) },
      { fecha: '2026-10-05', inicio: h(11), fin: h(12) },
    ]);
  });
});

describe('holgura', () => {
  it('semáforo según los días que sobran', () => {
    expect(holgura('2026-10-05', '2026-10-09')).toEqual({ dias: 4, semaforo: 'verde' });
    expect(holgura('2026-10-08', '2026-10-09')).toEqual({ dias: 1, semaforo: 'ambar' });
    expect(holgura('2026-10-10', '2026-10-09')).toEqual({ dias: -1, semaforo: 'rojo' });
    expect(holgura(null, '2026-10-09')).toEqual({ dias: null, semaforo: 'sin_plan' });
  });
});

describe('ahoraEnLima', () => {
  it('convierte a la hora de Lima (UTC−5)', () => {
    expect(ahoraEnLima(new Date('2026-10-05T15:30:00Z'))).toEqual({ fecha: '2026-10-05', minuto: h(10.5) });
  });
});
