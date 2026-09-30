import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Tema = 'light' | 'dark' | 'system'
const CLAVE = 'ges-tema'

interface ContextoTema {
  tema: Tema
  temaResuelto: 'light' | 'dark'
  cambiarTema: (tema: Tema) => void
}

const Contexto = createContext<ContextoTema | null>(null)

const consultaOscuro = () => window.matchMedia('(prefers-color-scheme: dark)')

function leerTema(): Tema {
  try {
    const guardado = localStorage.getItem(CLAVE)
    return guardado === 'light' || guardado === 'dark' ? guardado : 'system'
  } catch {
    return 'system'
  }
}

/**
 * Tema claro/oscuro. El script en index.html aplica la clase antes de pintar,
 * para que no haya parpadeo al cargar.
 */
export function ProveedorTema({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(leerTema)
  const [sistemaOscuro, setSistemaOscuro] = useState(() => consultaOscuro().matches)

  useEffect(() => {
    const consulta = consultaOscuro()
    const alCambiar = (e: MediaQueryListEvent) => setSistemaOscuro(e.matches)
    consulta.addEventListener('change', alCambiar)
    return () => consulta.removeEventListener('change', alCambiar)
  }, [])

  const temaResuelto = tema === 'system' ? (sistemaOscuro ? 'dark' : 'light') : tema

  useEffect(() => {
    const raiz = document.documentElement
    raiz.classList.toggle('dark', temaResuelto === 'dark')
    raiz.style.colorScheme = temaResuelto
  }, [temaResuelto])

  const cambiarTema = useCallback((nuevo: Tema) => {
    setTema(nuevo)
    try {
      localStorage.setItem(CLAVE, nuevo)
    } catch {
      // Sin almacenamiento (modo privado): el tema dura solo esta sesión.
    }
  }, [])

  const valor = useMemo(() => ({ tema, temaResuelto, cambiarTema }), [tema, temaResuelto, cambiarTema])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useTema(): ContextoTema {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useTema debe usarse dentro de ProveedorTema')
  return contexto
}
