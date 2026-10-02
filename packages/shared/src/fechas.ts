/**
 * Fechas en hora de Lima. Perú no usa horario de verano: el desfase es siempre UTC−5.
 */
export const ZONA_HORARIA = 'America/Lima'
const DESFASE = '-05:00'

const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' })
const formatoHora = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hour12: false })

/** Día (YYYY-MM-DD) en Lima de un instante. */
export function diaEnLima(instante: Date = new Date()): string {
  return formatoDia.format(instante)
}

/** Hora (HH:mm) en Lima de un instante. */
export function horaEnLima(instante: Date): string {
  return formatoHora.format(instante)
}

/** Instante que corresponde a un día y una hora de Lima. */
export function instanteDesdeLima(dia: string, hora: string): Date {
  return new Date(`${dia}T${hora}:00${DESFASE}`)
}

/** Suma días a un día YYYY-MM-DD. */
export function sumarDias(dia: string, dias: number): string {
  const fecha = new Date(`${dia}T12:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

/** Días hábiles entre dos días (ambos incluidos): sin domingos ni los feriados indicados. */
export function diasHabilesEntre(desde: string, hasta: string, feriados: readonly string[] = []): number {
  let n = 0
  for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 1)) {
    if (new Date(`${dia}T12:00:00Z`).getUTCDay() !== 0 && !feriados.includes(dia)) n++
  }
  return n
}
