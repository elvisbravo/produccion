import { describe, expect, it } from 'vitest';
import { alcanceMayor, combinarPermisos } from './combinar.js';

describe('alcanceMayor', () => {
  it('elige el alcance más amplio', () => {
    expect(alcanceMayor('propios', 'todos')).toBe('todos');
    expect(alcanceMayor('equipo', 'propios')).toBe('equipo');
    expect(alcanceMayor(null, 'equipo')).toBe('equipo');
    expect(alcanceMayor(null, null)).toBeNull();
  });
});

describe('combinarPermisos', () => {
  it('une los permisos de varios roles con el alcance más amplio', () => {
    const efectivos = combinarPermisos(
      [
        { codigo: 'prospectos.ver', usaAlcance: true, alcance: 'propios' },
        { codigo: 'prospectos.ver', usaAlcance: true, alcance: 'todos' },
        { codigo: 'reportes.ver', usaAlcance: false, alcance: null },
      ],
      [],
    );
    expect(efectivos).toEqual({ 'prospectos.ver': 'todos', 'reportes.ver': null });
  });

  it('concede permisos que el rol no tiene', () => {
    const efectivos = combinarPermisos(
      [{ codigo: 'tareas.ver', usaAlcance: true, alcance: 'propios' }],
      [{ codigo: 'ausencias.aprobar', usaAlcance: false, alcance: null, tipo: 'conceder' }],
    );
    expect(efectivos).toEqual({ 'tareas.ver': 'propios', 'ausencias.aprobar': null });
  });

  it('la denegación gana sobre roles y concesiones', () => {
    const efectivos = combinarPermisos(
      [{ codigo: 'contratos.ver_montos', usaAlcance: false, alcance: null }],
      [
        { codigo: 'contratos.ver_montos', usaAlcance: false, alcance: null, tipo: 'conceder' },
        { codigo: 'contratos.ver_montos', usaAlcance: false, alcance: null, tipo: 'denegar' },
      ],
    );
    expect(efectivos).toEqual({});
  });

  it('una acción con alcance sin valor se toma como "propios"', () => {
    const efectivos = combinarPermisos([{ codigo: 'tareas.editar', usaAlcance: true, alcance: null }], []);
    expect(efectivos).toEqual({ 'tareas.editar': 'propios' });
  });
});
