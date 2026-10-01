import { describe, expect, it } from 'vitest'
import { capitalizarNombre, dniSchema, fechaDeConsultaDni } from './consulta-dni.js'

describe('capitalizarNombre', () => {
  it.each([
    ['ELVIS BRAVO SANDOVAL', 'Elvis Bravo Sandoval'],
    ['  maría   DE LOS ÁNGELES ', 'María de los Ángeles'],
    ['DE LA CRUZ', 'De la Cruz'],
    ['pérez-ruiz', 'Pérez-Ruiz'],
    ["D'ANGELO", "D'Angelo"],
  ])('%s → %s', (entrada, esperado) => expect(capitalizarNombre(entrada)).toBe(esperado))
})

describe('fechaDeConsultaDni', () => {
  it('convierte dd/mm/aaaa a ISO', () => expect(fechaDeConsultaDni('18/09/1992')).toBe('1992-09-18'))
  it.each(['31/02/1990', '18-09-1992', '', null, undefined, '01/01/1800'])('rechaza %s', (v) => expect(fechaDeConsultaDni(v)).toBeNull())
})

describe('dniSchema', () => {
  it('pide exactamente 8 dígitos', () => {
    expect(dniSchema.safeParse('70167122').success).toBe(true)
    for (const mal of ['7016712', '701671222', '7016712a', ' 70167122']) expect(dniSchema.safeParse(mal).success).toBe(false)
  })
})
