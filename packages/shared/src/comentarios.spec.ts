import { describe, expect, it } from 'vitest'
import { desmarcarMenciones, extraerMenciones, marcarMenciones, partesComentario, textoPlano } from './comentarios.js'

const ANA = { id: '0199a000-0000-7000-8000-000000000001', nombre: 'Ana Torres' }
const ANA_MARIA = { id: '0199a000-0000-7000-8000-000000000002', nombre: 'Ana María Ruiz' }

describe('menciones', () => {
  it('marca solo a las personas elegidas que siguen en el texto', () => {
    const texto = marcarMenciones('Hola @Ana Torres y @Ana María Ruiz, revisen. @Luis no fue elegido', [ANA, ANA_MARIA])
    expect(texto).toBe(`Hola @[Ana Torres](${ANA.id}) y @[Ana María Ruiz](${ANA_MARIA.id}), revisen. @Luis no fue elegido`)
    expect(extraerMenciones(texto)).toEqual([ANA.id, ANA_MARIA.id])
  })

  it('no marca si la mención se borró o quedó incompleta', () => {
    expect(marcarMenciones('Hola @Ana Torr', [ANA])).toBe('Hola @Ana Torr')
    expect(marcarMenciones('Hola @Ana Torresano', [ANA])).toBe('Hola @Ana Torresano')
    expect(marcarMenciones('correo ana@Ana Torres', [ANA])).toBe('correo ana@Ana Torres')
  })

  it('no repite ids y separa el texto en partes', () => {
    const texto = `@[Ana Torres](${ANA.id}) mira esto, @[Ana Torres](${ANA.id})`
    expect(extraerMenciones(texto)).toEqual([ANA.id])
    expect(partesComentario(texto)).toEqual([
      { tipo: 'mencion', id: ANA.id, nombre: 'Ana Torres' },
      { tipo: 'texto', texto: ' mira esto, ' },
      { tipo: 'mencion', id: ANA.id, nombre: 'Ana Torres' },
    ])
    expect(textoPlano(texto)).toBe('@Ana Torres mira esto, @Ana Torres')
  })

  it('desmarcar y volver a marcar deja el mismo texto', () => {
    const original = `Listo @[Ana Torres](${ANA.id}).`
    const { texto, elegidas } = desmarcarMenciones(original)
    expect(texto).toBe('Listo @Ana Torres.')
    expect(marcarMenciones(texto, elegidas)).toBe(original)
  })
})
