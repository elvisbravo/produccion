import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form'
import { ApiError } from '@/lib/api'

/**
 * Lleva los errores de la API a sus campos del formulario.
 * Devuelve el mensaje general a mostrar (o null si todo quedó en campos).
 */
export function aplicarErroresApi<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, conocidos?: readonly string[]): string {
  if (!(error instanceof ApiError)) return 'Ocurrió un error inesperado'
  if (error.errores.length === 0) return error.message

  const sinCampo: string[] = []
  for (const e of error.errores) {
    if (!conocidos || conocidos.some((c) => e.campo === c || e.campo.startsWith(`${c}.`))) {
      setError(e.campo as FieldPath<T>, { message: e.mensaje })
    } else {
      sinCampo.push(e.mensaje)
    }
  }
  return sinCampo.length ? sinCampo.join('. ') : 'Revisa los campos marcados.'
}
