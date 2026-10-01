import type { ComentarioDatos, ComentarioItem, EntidadComentario, UsuarioResumen } from '@grupoes/shared'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const clavesComentarios = {
  hilo: (entidad: EntidadComentario, entidadId: string) => ['comentarios', entidad, entidadId] as const,
  mencionables: (entidad: EntidadComentario, entidadId: string) => ['comentarios', entidad, entidadId, 'mencionables'] as const,
}

const consulta = (entidad: EntidadComentario, entidadId: string) => `entidad=${entidad}&entidadId=${entidadId}`

export const comentariosQuery = (entidad: EntidadComentario, entidadId: string) =>
  queryOptions({
    queryKey: clavesComentarios.hilo(entidad, entidadId),
    queryFn: ({ signal }) => api<ComentarioItem[]>(`/comentarios?${consulta(entidad, entidadId)}`, { signal }),
  })

export const mencionablesQuery = (entidad: EntidadComentario, entidadId: string) =>
  queryOptions({
    queryKey: clavesComentarios.mencionables(entidad, entidadId),
    queryFn: ({ signal }) => api<UsuarioResumen[]>(`/comentarios/mencionables?${consulta(entidad, entidadId)}`, { signal }),
    staleTime: 5 * 60_000,
  })

function useRefrescar(entidad: EntidadComentario, entidadId: string) {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: clavesComentarios.hilo(entidad, entidadId), exact: true })
}

export function useComentar(entidad: EntidadComentario, entidadId: string) {
  const refrescar = useRefrescar(entidad, entidadId)
  return useMutation({
    mutationFn: (texto: string) => api<ComentarioItem>('/comentarios', { method: 'POST', body: { entidad, entidadId, texto } satisfies ComentarioDatos }),
    onSuccess: refrescar,
  })
}

export function useEditarComentario(entidad: EntidadComentario, entidadId: string) {
  const refrescar = useRefrescar(entidad, entidadId)
  return useMutation({
    mutationFn: ({ id, texto }: { id: string; texto: string }) => api<ComentarioItem>(`/comentarios/${id}`, { method: 'PATCH', body: { texto } }),
    onSuccess: refrescar,
  })
}

export function useEliminarComentario(entidad: EntidadComentario, entidadId: string) {
  const refrescar = useRefrescar(entidad, entidadId)
  return useMutation({
    mutationFn: (id: string) => api<void>(`/comentarios/${id}`, { method: 'DELETE' }),
    onSuccess: refrescar,
  })
}
