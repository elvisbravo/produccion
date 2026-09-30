import { useEffect } from 'react'

const EVENTOS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const

/** Ejecuta `alExpirar` si pasan `minutos` sin actividad del usuario. */
export function useInactividad(minutos: number, alExpirar: () => void) {
  useEffect(() => {
    if (minutos <= 0) return

    let temporizador = window.setTimeout(alExpirar, minutos * 60_000)
    let ultimoReinicio = Date.now()

    const reiniciar = () => {
      // Evita reprogramar el temporizador en cada movimiento del mouse.
      if (Date.now() - ultimoReinicio < 5_000) return
      ultimoReinicio = Date.now()
      window.clearTimeout(temporizador)
      temporizador = window.setTimeout(alExpirar, minutos * 60_000)
    }

    EVENTOS.forEach((e) => window.addEventListener(e, reiniciar, { passive: true }))
    return () => {
      window.clearTimeout(temporizador)
      EVENTOS.forEach((e) => window.removeEventListener(e, reiniciar))
    }
  }, [minutos, alExpirar])
}
