import { z } from 'zod'

export const dniSchema = z.string().regex(/^\d{8}$/, 'El DNI debe tener 8 dígitos')

/** Datos del DNI que se usan para rellenar el formulario (la persona puede corregirlos). */
export interface DatosDni {
  nombres: string
  /** Apellido paterno y materno juntos. */
  apellidos: string
  /** AAAA-MM-DD; null si el servicio no la trae o no es válida. */
  fechaNacimiento: string | null
}

/**
 * Resultado de buscar un DNI. El servicio externo falla seguido (tarda, se cae, no encuentra), así que la
 * búsqueda nunca es un error: siempre se puede completar a mano.
 */
export type ResultadoConsultaDni =
  | { estado: 'encontrado'; datos: DatosDni }
  | { estado: 'no_encontrado' }
  | { estado: 'no_disponible' }

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'van', 'von', 'da', 'di'])

/** "BRAVO SANDOVAL" → "Bravo Sandoval"; deja "de", "del", "la"... en minúscula salvo al inicio. */
export function capitalizarNombre(texto: string): string {
  return texto
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((palabra, i) =>
      i > 0 && PARTICULAS.has(palabra)
        ? palabra
        : // También después de apóstrofo o guion: "D'Angelo", "Pérez-Ruiz".
          palabra.replace(/(^|['’-])(\p{L})/gu, (_, antes: string, letra: string) => antes + letra.toUpperCase()),
    )
    .join(' ')
}

/** "18/09/1992" → "1992-09-18" (o null si no es una fecha real). */
export function fechaDeConsultaDni(texto: unknown): string | null {
  const m = typeof texto === 'string' ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim()) : null
  if (!m) return null
  const [, d, mes, a] = m
  const fecha = new Date(`${a}-${mes}-${d}T12:00:00Z`)
  const real = !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(`${a}-${mes}-${d}`)
  return real && Number(a) >= 1900 ? `${a}-${mes}-${d}` : null
}
