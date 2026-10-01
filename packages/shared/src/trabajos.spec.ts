import { describe, expect, it } from 'vitest'
import { armarEquipoSchema } from './trabajos.js'

const A = '0199a000-0000-7000-8000-000000000001'
const B = '0199a000-0000-7000-8000-000000000002'
const C = '0199a000-0000-7000-8000-000000000003'

describe('armarEquipoSchema', () => {
  it('acepta un equipo con personas distintas', () => {
    expect(armarEquipoSchema.safeParse({ auxiliarPrincipalId: A, auxiliaresApoyo: [B], jefeResponsableId: C }).success).toBe(true)
  })

  it('el jefe responsable no puede ser el auxiliar principal ni uno de apoyo', () => {
    for (const equipo of [
      { auxiliarPrincipalId: A, auxiliaresApoyo: [], jefeResponsableId: A },
      { auxiliarPrincipalId: A, auxiliaresApoyo: [B], jefeResponsableId: B },
    ]) {
      const r = armarEquipoSchema.safeParse(equipo)
      expect(r.success).toBe(false)
      expect(r.error?.issues.some((i) => i.path[0] === 'jefeResponsableId')).toBe(true)
    }
  })

  it('el auxiliar principal tampoco puede ser de apoyo', () => {
    expect(armarEquipoSchema.safeParse({ auxiliarPrincipalId: A, auxiliaresApoyo: [A], jefeResponsableId: C }).success).toBe(false)
  })
})
