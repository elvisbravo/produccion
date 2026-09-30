import { describe, expect, it } from 'vitest';
import { estadoCuota, repartirPago, resumenCuenta, type CuotaCalculo } from './cuenta.js';

const cuota = (numero: number, monto: number, vencimiento: string, pagado = 0): CuotaCalculo => ({
  id: `c${numero}`,
  numero,
  monto,
  vencimiento,
  pagado,
});

describe('estadoCuota', () => {
  const hoy = '2026-10-15';
  it('distingue pagada, vencida, parcial y pendiente', () => {
    expect(estadoCuota(cuota(1, 1000, '2026-10-01', 1000), hoy)).toBe('pagada');
    expect(estadoCuota(cuota(1, 1000, '2026-10-01', 400), hoy)).toBe('vencida');
    expect(estadoCuota(cuota(1, 1000, '2026-11-01', 400), hoy)).toBe('parcial');
    expect(estadoCuota(cuota(1, 1000, '2026-11-01'), hoy)).toBe('pendiente');
    expect(estadoCuota(cuota(1, 1000, hoy), hoy)).toBe('pendiente');
  });
});

describe('repartirPago', () => {
  it('aplica de la cuota más antigua a la más nueva y parte una cuota si hace falta', () => {
    const cuotas = [cuota(2, 190000, '2026-11-01'), cuota(1, 190000, '2026-10-01', 50000)];
    expect(repartirPago(200000, cuotas)).toEqual([
      { cuotaId: 'c1', centimos: 140000 },
      { cuotaId: 'c2', centimos: 60000 },
    ]);
  });

  it('salta las cuotas ya pagadas', () => {
    expect(repartirPago(1000, [cuota(1, 1000, '2026-10-01', 1000), cuota(2, 1000, '2026-11-01')])).toEqual([{ cuotaId: 'c2', centimos: 1000 }]);
  });

  it('no acepta pagar más que el saldo', () => {
    expect(() => repartirPago(2001, [cuota(1, 1000, '2026-10-01'), cuota(2, 1000, '2026-11-01')])).toThrow(RangeError);
  });
});

describe('resumenCuenta', () => {
  it('calcula total, pagado, saldo, vencido y la próxima cuota', () => {
    const r = resumenCuenta([cuota(1, 190000, '2026-10-01', 190000), cuota(2, 190000, '2026-10-10', 50000), cuota(3, 100000, '2026-12-01')], '2026-10-15');
    expect(r).toEqual({
      total: 4800,
      pagado: 2400,
      saldo: 2400,
      vencido: 1400,
      proximaCuota: { numero: 2, vencimiento: '2026-10-10', saldo: 1400 },
    });
  });
});
