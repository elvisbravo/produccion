import { toast } from 'sonner'
import { api } from '@/lib/api'

/** Tras asignar una reunión que dejó tareas sin llegar a su fecha: ofrece reordenar la cola por prioridad y fecha (no mueve nada sin decirlo). */
export function avisarReordenar(usuarioIds: string[], mensaje: string) {
  toast.success(mensaje, {
    description: 'Algunas tareas de su cola ya no llegan a su fecha límite.',
    duration: 15_000,
    action: {
      label: 'Reordenar por prioridad y fecha',
      onClick: () => {
        void Promise.all(usuarioIds.map((id) => api<void>(`/produccion/colas/${id}/orden-sugerido`, { method: 'POST' })))
          .then(() => toast.success('Cola reordenada por prioridad y fecha de entrega'))
          .catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'No se pudo reordenar'))
      },
    },
  })
}
