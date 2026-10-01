import { describe, expect, it } from 'vitest';
import type { TareaAgenda, TramoSemanal } from '@grupoes/shared';
import { calcularDia, esCumpleanos, evaluar, restar, tramosDelDia, type EntradaDia } from './disponibilidad.js';

const h = (hora: number) => hora * 60;
const ESTANDAR: TramoSemanal[] = [
  ...[1, 2, 3, 4, 5].flatMap((diaSemana) => [
    { diaSemana, inicio: h(8), fin: h(13) },
    { diaSemana, inicio: h(15), fin: h(19) },
  ]),
  { diaSemana: 6, inicio: h(8), fin: h(13) },
];
// 2026-10-05 es lunes; 2026-10-04, domingo.
const LUNES = '2026-10-05';

const tarea = (id: string, inicio: number | null, minutos: number, estado: TareaAgenda['estado'] = 'pendiente'): TareaAgenda => ({
  id,
  actividad: `Tarea ${id}`,
  comportamiento: 'reunion',
  color: null,
  estado,
  inicio,
  fin: inicio === null ? null : inicio + minutos,
  minutos,
  referencia: null,
  enCola: false,
});

const dia = (extra: Partial<EntradaDia> = {}) =>
  calcularDia({ fecha: LUNES, tramos: tramosDelDia(LUNES, [], ESTANDAR), feriado: null, cumpleanos: false, ausencias: [], tareas: [], ...extra });

describe('tramosDelDia', () => {
  it('usa la plantilla por defecto si la persona no tiene horario', () => {
    expect(tramosDelDia(LUNES, [], ESTANDAR)).toEqual([
      { inicio: h(8), fin: h(13) },
      { inicio: h(15), fin: h(19) },
    ]);
    expect(tramosDelDia('2026-10-04', [], ESTANDAR)).toEqual([]);
  });

  it('usa el horario vigente más reciente que ya empezó', () => {
    const horarios = [
      { vigenteDesde: '2026-01-01', tramos: [{ diaSemana: 1, inicio: h(9), fin: h(18) }] },
      { vigenteDesde: '2026-10-06', tramos: [{ diaSemana: 1, inicio: h(14), fin: h(20) }] },
    ];
    expect(tramosDelDia(LUNES, horarios, ESTANDAR)).toEqual([{ inicio: h(9), fin: h(18) }]);
    expect(tramosDelDia('2026-10-12', horarios, ESTANDAR)).toEqual([{ inicio: h(14), fin: h(20) }]);
  });
});

describe('esCumpleanos', () => {
  it('compara mes y día', () => {
    expect(esCumpleanos('1995-10-05', LUNES)).toBe(true);
    expect(esCumpleanos('1995-10-06', LUNES)).toBe(false);
    expect(esCumpleanos(null, LUNES)).toBe(false);
  });
  it('29 de febrero: el 28 en años no bisiestos', () => {
    expect(esCumpleanos('2000-02-29', '2027-02-28')).toBe(true);
    expect(esCumpleanos('2000-02-29', '2028-02-28')).toBe(false);
    expect(esCumpleanos('2000-02-29', '2028-02-29')).toBe(true);
  });
});

describe('restar', () => {
  it('parte un tramo cuando el bloqueo cae en medio', () => {
    expect(restar([{ inicio: h(8), fin: h(13) }], [{ inicio: h(10), fin: h(11) }])).toEqual([
      { inicio: h(8), fin: h(10) },
      { inicio: h(11), fin: h(13) },
    ]);
  });
});

describe('calcularDia', () => {
  it('día normal: capacidad de 9 horas y libre', () => {
    const d = dia();
    expect(d.capacidad).toBe(h(9));
    expect(d.estado).toBe('libre');
  });

  it('domingo: descanso', () => {
    const d = calcularDia({ fecha: '2026-10-04', tramos: tramosDelDia('2026-10-04', [], ESTANDAR), feriado: null, cumpleanos: false, ausencias: [], tareas: [] });
    expect(d.estado).toBe('descanso');
    expect(d.capacidad).toBe(0);
  });

  it('feriado, cumpleaños y vacaciones bloquean el día completo', () => {
    expect(dia({ feriado: { nombre: 'Combate de Angamos', medioDia: false } }).estado).toBe('no_laborable');
    expect(dia({ cumpleanos: true }).estado).toBe('no_laborable');
    expect(dia({ ausencias: [{ tipo: 'vacaciones', nombre: 'Vacaciones', intervalo: null }] }).capacidad).toBe(0);
  });

  it('feriado de medio día: solo se trabaja la mañana', () => {
    const d = dia({ feriado: { nombre: 'Víspera', medioDia: true } });
    expect(d.libres).toEqual([{ inicio: h(8), fin: h(13) }]);
    expect(d.estado).toBe('libre');
  });

  it('un permiso por horas resta solo esas horas', () => {
    const d = dia({ ausencias: [{ tipo: 'permiso', nombre: 'Permiso', intervalo: { inicio: h(15), fin: h(17) } }] });
    expect(d.capacidad).toBe(h(7));
  });

  it('ocupado y sobrecargado según la carga', () => {
    expect(dia({ tareas: [tarea('a', null, h(7))] }).estado).toBe('ocupado');
    expect(dia({ tareas: [tarea('a', null, h(10))] }).estado).toBe('sobrecargado');
    // Las canceladas no cuentan.
    expect(dia({ tareas: [tarea('a', null, h(10), 'cancelada')] }).estado).toBe('libre');
  });
});

describe('evaluar', () => {
  it('libre dentro del horario', () => {
    expect(evaluar(dia(), { inicio: h(10), minutos: 80 })).toMatchObject({ estado: 'libre', bloqueo: null, avisos: [] });
  });

  it('bloquea en días u horas no laborables', () => {
    expect(evaluar(dia({ cumpleanos: true }), { inicio: h(10), minutos: 60 })).toMatchObject({ estado: 'no_laborable', bloqueo: 'Cumpleaños' });
    const permiso = dia({ ausencias: [{ tipo: 'permiso', nombre: 'Permiso', intervalo: { inicio: h(15), fin: h(17) } }] });
    expect(evaluar(permiso, { inicio: h(16), minutos: 60 })).toMatchObject({ estado: 'no_laborable', bloqueo: 'Permiso (15:00–17:00)' });
    expect(evaluar(permiso, { inicio: h(10), minutos: 60 }).estado).toBe('libre');
  });

  it('avisa el choque con otra reunión (sin contarse a sí misma)', () => {
    const d = dia({ tareas: [tarea('a', h(10), 80)] });
    const r = evaluar(d, { inicio: h(11), minutos: 60 });
    expect(r.estado).toBe('ocupado');
    expect(r.avisos[0]).toContain('Choca con "Tarea a"');
    expect(evaluar(d, { id: 'a', inicio: h(10), minutos: 80 }).estado).toBe('libre');
  });

  it('avisa fuera de horario: en el refrigerio, después de hora o en domingo', () => {
    expect(evaluar(dia(), { inicio: h(12.5), minutos: 80 }).estado).toBe('fuera_horario');
    expect(evaluar(dia(), { inicio: h(19), minutos: 60 }).estado).toBe('fuera_horario');
    const domingo = calcularDia({ fecha: '2026-10-04', tramos: [], feriado: null, cumpleanos: false, ausencias: [], tareas: [] });
    expect(evaluar(domingo, { inicio: h(10), minutos: 60 }).avisos).toEqual(['Ese día no está en su horario']);
  });

  it('avisa cuando supera la capacidad del día', () => {
    const r = evaluar(dia({ tareas: [tarea('a', null, h(8.5))] }), { inicio: null, minutos: 60 });
    expect(r.estado).toBe('sobrecargado');
    expect(r.avisos[0]).toContain('Supera su capacidad');
  });
});
