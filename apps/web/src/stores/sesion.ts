import type { LoginRespuesta, UsuarioSesion } from '@grupoes/shared'
import { create } from 'zustand'

export type MotivoSalida = 'logout' | 'inactividad' | 'expirada'

interface EstadoSesion {
  /** El access token vive solo en memoria; el refresh token está en una cookie httpOnly. */
  accessToken: string | null
  usuario: UsuarioSesion | null
  inactividadMinutos: number
  /** Por qué se cerró la última sesión (para el mensaje del login). */
  motivoSalida: MotivoSalida | null
  establecer: (respuesta: LoginRespuesta) => void
  limpiar: (motivo?: MotivoSalida) => void
}

export const useSesion = create<EstadoSesion>((set) => ({
  accessToken: null,
  usuario: null,
  inactividadMinutos: 30,
  motivoSalida: null,
  establecer: ({ accessToken, usuario, inactividadMinutos }) =>
    set({ accessToken, usuario, inactividadMinutos, motivoSalida: null }),
  limpiar: (motivo = 'expirada') => set({ accessToken: null, usuario: null, motivoSalida: motivo }),
}))
