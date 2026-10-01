import { aCentimos, deCentimos, type CuotaDetalle, type EstadoCuota, type ResumenCuenta } from '@grupoes/shared';

/** Datos mínimos de una cuota para calcular su estado (montos en céntimos). */
export interface CuotaCalculo {
  id: string;
  numero: number;
  monto: number;
  vencimiento: string;
  /** Suma de lo aplicado por pagos no anulados. */
  pagado: number;
  /** Número del adicional del que nace, si aplica. */
  adicional?: number | null;
}

export function estadoCuota(c: CuotaCalculo, hoy: string): EstadoCuota {
  if (c.pagado >= c.monto) return 'pagada';
  if (c.vencimiento < hoy) return 'vencida';
  return c.pagado > 0 ? 'parcial' : 'pendiente';
}

export function detalleCuota(c: CuotaCalculo, hoy: string): CuotaDetalle {
  return {
    id: c.id,
    numero: c.numero,
    adicional: c.adicional ?? null,
    monto: deCentimos(c.monto),
    vencimiento: c.vencimiento,
    pagado: deCentimos(c.pagado),
    saldo: deCentimos(Math.max(0, c.monto - c.pagado)),
    estado: estadoCuota(c, hoy),
  };
}

export function resumenCuenta(cuotas: CuotaCalculo[], hoy: string): ResumenCuenta {
  const total = cuotas.reduce((s, c) => s + c.monto, 0);
  const pagado = cuotas.reduce((s, c) => s + Math.min(c.pagado, c.monto), 0);
  const vencido = cuotas.filter((c) => estadoCuota(c, hoy) === 'vencida').reduce((s, c) => s + (c.monto - c.pagado), 0);
  const proxima = [...cuotas].sort((a, b) => a.numero - b.numero).find((c) => c.pagado < c.monto);
  return {
    total: deCentimos(total),
    pagado: deCentimos(pagado),
    saldo: deCentimos(total - pagado),
    vencido: deCentimos(vencido),
    proximaCuota: proxima ? { numero: proxima.numero, vencimiento: proxima.vencimiento, saldo: deCentimos(proxima.monto - proxima.pagado) } : null,
  };
}

/**
 * Reparte un pago (en céntimos) entre las cuotas con saldo, de la más antigua a la más nueva.
 * Lanza un error si el pago supera el saldo total.
 */
export function repartirPago(montoCentimos: number, cuotas: CuotaCalculo[]): { cuotaId: string; centimos: number }[] {
  let restante = montoCentimos;
  const reparto: { cuotaId: string; centimos: number }[] = [];
  for (const c of [...cuotas].sort((a, b) => a.numero - b.numero)) {
    const saldo = c.monto - c.pagado;
    if (restante <= 0) break;
    if (saldo <= 0) continue;
    const aplicado = Math.min(saldo, restante);
    reparto.push({ cuotaId: c.id, centimos: aplicado });
    restante -= aplicado;
  }
  if (restante > 0) throw new RangeError('El pago supera el saldo pendiente');
  return reparto;
}

/** Convierte un Decimal de Prisma (o número) a céntimos enteros. */
export const centimosDe = (valor: { toString(): string } | number) => aCentimos(Number(valor.toString()));
