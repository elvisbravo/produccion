import { describe, expect, it } from 'vitest'
import { bloquesPlantilla, cotizacionSchema, empresaSchema, EMPRESA_POR_DEFECTO, fechaLarga, montoEnLetras, rellenarPlantilla } from './documentos.js'

describe('montoEnLetras', () => {
  it.each([
    [0, 'CERO CON 00/100 SOLES'],
    [1, 'UNO CON 00/100 SOLES'],
    [15, 'QUINCE CON 00/100 SOLES'],
    [21, 'VEINTIUNO CON 00/100 SOLES'],
    [100, 'CIEN CON 00/100 SOLES'],
    [101, 'CIENTO UNO CON 00/100 SOLES'],
    [1000, 'MIL CON 00/100 SOLES'],
    [1500.5, 'MIL QUINIENTOS CON 50/100 SOLES'],
    [3999.99, 'TRES MIL NOVECIENTOS NOVENTA Y NUEVE CON 99/100 SOLES'],
    [21_000, 'VEINTIÚN MIL CON 00/100 SOLES'],
    [31_200, 'TREINTA Y UN MIL DOSCIENTOS CON 00/100 SOLES'],
    [100_000, 'CIEN MIL CON 00/100 SOLES'],
    [1_000_001, 'UN MILLÓN UNO CON 00/100 SOLES'],
    [2_350_000, 'DOS MILLONES TRESCIENTOS CINCUENTA MIL CON 00/100 SOLES'],
  ])('%d → %s', (monto, letras) => expect(montoEnLetras(monto)).toBe(letras))
})

describe('plantillas', () => {
  it('reemplaza las variables conocidas y deja las desconocidas', () => {
    expect(rellenarPlantilla('Hola {cliente}, total {total} {otra}', { cliente: 'Ana', total: 'S/ 10' })).toBe('Hola Ana, total S/ 10 {otra}')
  })

  it('divide en títulos, párrafos y listas', () => {
    expect(bloquesPlantilla('# Condiciones\n- uno\n- dos\n\nPrimera línea\nsegunda\n\n\n# Fin')).toEqual([
      { tipo: 'titulo', texto: 'Condiciones' },
      { tipo: 'lista', items: ['uno', 'dos'] },
      { tipo: 'parrafo', lineas: ['Primera línea', 'segunda'] },
      { tipo: 'titulo', texto: 'Fin' },
    ])
  })

  it('fecha larga en español', () => expect(fechaLarga('2026-10-01')).toBe('1 de octubre de 2026'))
})

describe('esquemas', () => {
  it('valida el RUC de la empresa', () => {
    expect(empresaSchema.safeParse({ ...EMPRESA_POR_DEFECTO, ruc: '20601234567' }).success).toBe(true)
    expect(empresaSchema.safeParse({ ...EMPRESA_POR_DEFECTO, ruc: '123' }).success).toBe(false)
  })

  it('una cotización necesita un total mayor a 0', () => {
    const base = { fecha: '2026-10-01', validezDias: 15 }
    expect(cotizacionSchema.safeParse({ ...base, items: [{ descripcion: 'Tesis', cantidad: 1, precio: 0 }] }).success).toBe(false)
    expect(cotizacionSchema.safeParse({ ...base, items: [{ descripcion: 'Tesis', cantidad: '1', precio: '3500' }] }).success).toBe(true)
  })
})
