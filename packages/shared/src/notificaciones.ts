/**
 * Notificaciones internas. El tipo es "área.evento" (p. ej. "tarea.asignada"):
 * el área decide el ícono y qué datos refrescar en la web al recibirla.
 */
export const AREAS_NOTIFICACION = ['tarea', 'prospecto', 'trabajo', 'equipo', 'entregable', 'observacion', 'ausencia', 'urgente', 'extra', 'cuota', 'recordatorio', 'comentario'] as const
export type AreaNotificacion = (typeof AREAS_NOTIFICACION)[number]

export const areaDe = (tipo: string): AreaNotificacion => {
  const area = tipo.split('.')[0]
  return (AREAS_NOTIFICACION as readonly string[]).includes(area) ? (area as AreaNotificacion) : 'tarea'
}

export interface NotificacionItem {
  id: string
  tipo: string
  titulo: string
  mensaje: string | null
  enlace: string | null
  leida: boolean
  creadaEn: string
}

export interface BandejaNotificaciones {
  items: NotificacionItem[]
  noLeidas: number
}

/** Evento de Socket.IO con una notificación nueva. */
export const EVENTO_NOTIFICACION = 'notificacion'
/** Ruta del canal en vivo (pasa por el mismo /api que la API). */
export const RUTA_SOCKET = '/api/socket.io'
