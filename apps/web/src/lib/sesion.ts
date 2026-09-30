import type { LoginInput, LoginRespuesta } from '@grupoes/shared'
import { api, refrescarSesion } from '@/lib/api'
import { queryClient } from '@/lib/query-client'
import { useSesion, type MotivoSalida } from '@/stores/sesion'

/** La cookie de sesión se consulta una sola vez por carga de página. */
let sesionConsultada = false

export async function iniciarSesion(datos: LoginInput): Promise<void> {
  const respuesta = await api<LoginRespuesta>('/auth/login', { method: 'POST', body: datos })
  useSesion.getState().establecer(respuesta)
}

/** Recupera la sesión al recargar la página (usa la cookie del refresh token). */
export async function restaurarSesion(): Promise<boolean> {
  if (useSesion.getState().usuario) return true
  if (sesionConsultada) return false
  sesionConsultada = true
  return refrescarSesion()
}

/** Cierra la sesión; el layout redirige al login al ver que ya no hay usuario. */
export async function cerrarSesion(motivo: MotivoSalida = 'logout'): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
  } finally {
    useSesion.getState().limpiar(motivo)
    queryClient.clear()
  }
}
