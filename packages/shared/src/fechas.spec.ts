import { describe, expect, it } from 'vitest'
import { diasHabilesEntre } from './fechas.js'

describe('diasHabilesEntre', () => {
  // 2026-10-05 es lunes.
  it('cuenta ambos extremos y salta los domingos', () => {
    expect(diasHabilesEntre('2026-10-05', '2026-10-05')).toBe(1)
    expect(diasHabilesEntre('2026-10-05', '2026-10-11')).toBe(6)
    expect(diasHabilesEntre('2026-10-11', '2026-10-11')).toBe(0)
  })

  it('descuenta los feriados', () => {
    expect(diasHabilesEntre('2026-10-05', '2026-10-11', ['2026-10-08'])).toBe(5)
    expect(diasHabilesEntre('2026-10-05', '2026-10-11', ['2026-10-11'])).toBe(6)
  })

  it('si el final es anterior al inicio no hay días', () => {
    expect(diasHabilesEntre('2026-10-10', '2026-10-05')).toBe(0)
  })
})
