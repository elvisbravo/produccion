import { useEffect, useState } from 'react'

/** Devuelve el valor recién después de `ms` sin cambios (para búsquedas mientras se escribe). */
export function useDebounce<T>(valor: T, ms = 300): T {
  const [retrasado, setRetrasado] = useState(valor)
  useEffect(() => {
    const t = window.setTimeout(() => setRetrasado(valor), ms)
    return () => window.clearTimeout(t)
  }, [valor, ms])
  return retrasado
}
