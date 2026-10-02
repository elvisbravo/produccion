import { describe, expect, it } from 'vitest'
import { armarEquipoSchema, seguimientoDe } from './trabajos.js'

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

describe('seguimientoDe', () => {
  const base = { urgente: false, pendientePago: false }

  it('un trabajo normal muestra su avance', () => {
    expect(seguimientoDe({ ...base, estado: 'sin_asignar' })).toEqual({ principal: 'sin_asignar', etiquetas: [] })
    expect(seguimientoDe({ ...base, estado: 'asignado' })).toEqual({ principal: 'programado', etiquetas: [] })
    expect(seguimientoDe({ ...base, estado: 'en_proceso' })).toEqual({ principal: 'abordando', etiquetas: [] })
  })

  it('lo urgente y el pago pendiente pasan por delante, y el avance queda como etiqueta', () => {
    expect(seguimientoDe({ estado: 'en_proceso', urgente: true, pendientePago: true })).toEqual({ principal: 'urgente', etiquetas: ['pendiente_pago', 'abordando'] })
    expect(seguimientoDe({ estado: 'asignado', urgente: false, pendientePago: true })).toEqual({ principal: 'pendiente_pago', etiquetas: ['programado'] })
  })

  it('entregado y cancelado cierran el trabajo: no hay urgencia que valga, pero el pago pendiente sí se avisa', () => {
    expect(seguimientoDe({ estado: 'finalizado', urgente: true, pendientePago: true })).toEqual({ principal: 'entregado', etiquetas: ['pendiente_pago'] })
    expect(seguimientoDe({ estado: 'finalizado', urgente: false, pendientePago: false })).toEqual({ principal: 'entregado', etiquetas: [] })
    expect(seguimientoDe({ estado: 'cancelado', urgente: true, pendientePago: true })).toEqual({ principal: 'cancelado', etiquetas: [] })
  })

  it('suspendido va después de urgente', () => {
    expect(seguimientoDe({ estado: 'suspendido', urgente: true, pendientePago: false })).toEqual({ principal: 'urgente', etiquetas: ['suspendido'] })
    expect(seguimientoDe({ estado: 'suspendido', urgente: false, pendientePago: true })).toEqual({ principal: 'suspendido', etiquetas: ['pendiente_pago'] })
  })
})
