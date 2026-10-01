import { areaDe, EVENTO_NOTIFICACION, EVENTO_SESION_ACTUALIZADA, EVENTO_SESION_CERRADA, RUTA_SOCKET, type UsuarioSesion, type AreaNotificacion, type BandejaNotificaciones, type NotificacionItem } from '@grupoes/shared'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { io } from 'socket.io-client'
import { toast } from 'sonner'
import { api, refrescarSesion } from '@/lib/api'
import { cerrarSesion } from '@/lib/sesion'
import { useSesion } from '@/stores/sesion'

export const clavesNotificaciones = { bandeja: ['notificaciones'] as const }

export const bandejaNotificacionesQuery = queryOptions({
  queryKey: clavesNotificaciones.bandeja,
  queryFn: () => api<BandejaNotificaciones>('/notificaciones'),
  staleTime: 60_000,
})

/** Qué datos de la pantalla pueden haber cambiado según el área del aviso. */
const REFRESCAR: Record<AreaNotificacion, string[][]> = {
  tarea: [['tareas'], ['agenda'], ['produccion']],
  prospecto: [['prospectos'], ['seguimiento'], ['tareas']],
  trabajo: [['trabajos'], ['produccion']],
  equipo: [['trabajos'], ['produccion'], ['tareas']],
  entregable: [['trabajos'], ['produccion'], ['tareas']],
  ausencia: [['ausencias'], ['agenda']],
  urgente: [['urgentes'], ['produccion'], ['trabajos'], ['tareas']],
  extra: [['horas-extra'], ['agenda']],
  cuota: [['contratos']],
  recordatorio: [['tareas']],
  comentario: [['comentarios']],
}

/**
 * Conexión en vivo: se abre al iniciar sesión y se cierra al salir. El token se lee al conectar
 * (también al reconectar); si el servidor lo rechaza por vencido, se renueva y se vuelve a intentar.
 */
export function useCanalNotificaciones() {
  const conectado = useSesion((s) => Boolean(s.accessToken))
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  useEffect(() => {
    if (!conectado) return
    const socket = io({
      path: RUTA_SOCKET,
      transports: ['websocket'],
      auth: (cb) => cb({ token: useSesion.getState().accessToken }),
    })
    socket.on('no_autorizado', () => {
      void refrescarSesion().then((ok) => ok && socket.connect())
    })
    // Un administrador cambió mis roles o permisos: se recarga la sesión (menú y permisos) sin salir.
    socket.on(EVENTO_SESION_ACTUALIZADA, () => {
      void api<UsuarioSesion>('/auth/me').then((usuario) => {
        useSesion.setState({ usuario })
        toast.info('Tus permisos se actualizaron')
      })
    })
    // Me desactivaron o restablecieron mi contraseña: la sesión termina.
    socket.on(EVENTO_SESION_CERRADA, () => {
      toast.warning('Un administrador cerró tu sesión')
      void cerrarSesion('expirada')
    })
    socket.on(EVENTO_NOTIFICACION, (n: NotificacionItem) => {
      queryClient.setQueryData<BandejaNotificaciones>(clavesNotificaciones.bandeja, (b) =>
        b ? { items: [n, ...b.items.filter((x) => x.id !== n.id)].slice(0, 50), noLeidas: b.noLeidas + 1 } : b,
      )
      for (const queryKey of REFRESCAR[areaDe(n.tipo)]) void queryClient.invalidateQueries({ queryKey })
      toast(n.titulo, {
        description: n.mensaje ?? undefined,
        action: n.enlace ? { label: 'Ver', onClick: () => void navigate({ href: n.enlace! }) } : undefined,
      })
    })
    return () => {
      socket.disconnect()
    }
  }, [conectado, queryClient, navigate])
}

export function useMarcarLeida() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/notificaciones/${id}/leer`, { method: 'POST' }),
    onMutate: (id) => {
      queryClient.setQueryData<BandejaNotificaciones>(clavesNotificaciones.bandeja, (b) => {
        if (!b || !b.items.some((n) => n.id === id && !n.leida)) return b
        return { items: b.items.map((n) => (n.id === id ? { ...n, leida: true } : n)), noLeidas: Math.max(0, b.noLeidas - 1) }
      })
    },
  })
}

export function useMarcarTodas() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/notificaciones/leer-todas', { method: 'POST' }),
    onMutate: () => {
      queryClient.setQueryData<BandejaNotificaciones>(clavesNotificaciones.bandeja, (b) => (b ? { items: b.items.map((n) => ({ ...n, leida: true })), noLeidas: 0 } : b))
    },
  })
}
