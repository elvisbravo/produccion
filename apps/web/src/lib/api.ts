import type { LoginRespuesta } from '@grupoes/shared'
import { useSesion } from '@/stores/sesion'

export interface ErrorCampo {
  campo: string
  mensaje: string
}

export class ApiError extends Error {
  readonly status: number
  readonly errores: ErrorCampo[]

  constructor(status: number, message: string, errores: ErrorCampo[] = []) {
    super(message)
    this.status = status
    this.errores = errores
  }
}

let refrescoEnCurso: Promise<boolean> | null = null

/**
 * Pide un access token nuevo usando la cookie del refresh token.
 * Las llamadas simultáneas comparten la misma petición.
 */
export function refrescarSesion(): Promise<boolean> {
  refrescoEnCurso ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
      if (!res.ok) {
        useSesion.getState().limpiar()
        return false
      }
      useSesion.getState().establecer((await res.json()) as LoginRespuesta)
      return true
    } catch {
      return false
    } finally {
      refrescoEnCurso = null
    }
  })()
  return refrescoEnCurso
}

interface OpcionesApi {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

/** Cliente de la API: agrega el token, reintenta una vez tras refrescar la sesión y normaliza los errores. */
export async function api<T>(ruta: string, opciones: OpcionesApi = {}, reintento = false): Promise<T> {
  const { method = 'GET', body, signal } = opciones
  const token = useSesion.getState().accessToken

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`/api${ruta}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    })
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revisa tu conexión.')
  }

  if (res.status === 401 && token && !reintento) {
    if (await refrescarSesion()) return api<T>(ruta, opciones, true)
  }

  if (!res.ok) {
    const datos = (await res.json().catch(() => ({}))) as { message?: string | string[]; errores?: ErrorCampo[] }
    const mensaje = Array.isArray(datos.message) ? datos.message.join('. ') : datos.message
    throw new ApiError(res.status, mensaje ?? 'Ocurrió un error inesperado', datos.errores)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
