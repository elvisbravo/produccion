import { describe, expect, it } from 'vitest'
import { enlaceWhatsapp, formatearCelular, normalizarCelular } from './celular.js'
import { prospectoSchema } from './prospectos.js'

describe('normalizarCelular', () => {
  it.each([
    ['987654321', '+51987654321'],
    ['987 654 321', '+51987654321'],
    ['+51 987-654-321', '+51987654321'],
    ['51987654321', '+51987654321'],
    ['0051987654321', '+51987654321'],
    ['(+1) 415 555 0100', '+14155550100'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarCelular(entrada)).toBe(esperado)
  })

  it.each(['12345', '887654321', 'abc', ''])('rechaza "%s"', (entrada) => {
    expect(normalizarCelular(entrada)).toBeNull()
  })

  it('formatea y arma el enlace de WhatsApp', () => {
    expect(formatearCelular('+51987654321')).toBe('+51 987 654 321')
    expect(enlaceWhatsapp('+51987654321', 'Hola Lucía')).toBe('https://wa.me/51987654321?text=Hola%20Luc%C3%ADa')
  })
})

describe('prospectoSchema', () => {
  const ids = {
    tipoTrabajoId: '0199a1b2-0000-7000-8000-000000000001',
    prioridadId: '0199a1b2-0000-7000-8000-000000000002',
    origenId: '0199a1b2-0000-7000-8000-000000000003',
  }

  it('acepta solo el celular y convierte los textos vacíos en undefined', () => {
    const r = prospectoSchema.parse({
      ...ids,
      contactos: [{ celular: '987 654 321', esPrincipal: true, nombres: '  ', email: '', tipoDocumento: '', numeroDocumento: '' }],
      titulo: '',
      linkDrive: '',
      temperatura: '',
    })
    expect(r.contactos[0]).toEqual({ celular: '+51987654321', esPrincipal: true })
    expect(r.titulo).toBeUndefined()
    expect(r.temperatura).toBeUndefined()
  })

  it('exige tipo y número de documento juntos y con el formato correcto', () => {
    const r = prospectoSchema.safeParse({
      ...ids,
      contactos: [
        { celular: '987654321', esPrincipal: true, tipoDocumento: 'DNI', numeroDocumento: '1234' },
        { celular: '987654322', esPrincipal: false, numeroDocumento: '12345678' },
      ],
    })
    expect(r.success).toBe(false)
    expect(r.error?.issues.map((i) => i.path.join('.'))).toEqual(['contactos.0.numeroDocumento', 'contactos.1.tipoDocumento'])
  })

  it('exige exactamente un contacto principal y celulares distintos', () => {
    const r = prospectoSchema.safeParse({
      ...ids,
      contactos: [
        { celular: '987654321', esPrincipal: false },
        { celular: '+51 987 654 321', esPrincipal: false },
      ],
    })
    expect(r.error?.issues.map((i) => i.message)).toEqual(['Marca un contacto como principal', 'Este celular ya está en otro contacto'])
  })

  it('solo acepta enlaces http(s) y fechas reales', () => {
    const r = prospectoSchema.safeParse({
      ...ids,
      contactos: [{ celular: '987654321', esPrincipal: true }],
      linkDrive: 'javascript:alert(1)',
      fechaEntregaTentativa: '2027-02-30',
    })
    expect(r.error?.issues.map((i) => i.path.join('.'))).toEqual(['fechaEntregaTentativa', 'linkDrive'])
  })
})
