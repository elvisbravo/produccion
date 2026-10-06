import type { ColaPersona } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { ListOrdered, Loader2, Shuffle, TriangleAlert, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { duracion, formatearFechaHora, nombreCompleto } from '@/lib/formato'
import { usePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { colasQuery, useOrdenSugerido } from '../api'
import { DialogoCarga } from './dialogo-carga'
import { ListaCola } from './lista-cola'

/** Colas de trabajo del personal de producción: resumen por persona y la cola de la elegida. */
export function VistaColas() {
  const { data, isPending } = useQuery(colasQuery)
  const [elegidaId, setElegidaId] = useState<string | null>(null)
  const puedeProgramar = usePermiso('programacion.programar')
  const puedeReasignar = usePermiso('programacion.reasignar')

  if (isPending || !data) return <Skeleton className="h-80" />
  const elegida = data.find((c) => c.usuario.id === elegidaId) ?? data.find((c) => c.items.length > 0) ?? data[0]
  if (!elegida) return <p className="text-sm text-muted-foreground">No hay auxiliares ni jefes de producción activos.</p>

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <ul className="flex flex-col gap-2">
        {data.map((c) => (
          <li key={c.usuario.id}>
            <button
              type="button"
              onClick={() => setElegidaId(c.usuario.id)}
              className={cn(
                'flex w-full flex-col gap-1 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/60',
                c.usuario.id === elegida.usuario.id && 'border-primary ring-1 ring-primary',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{nombreCompleto(c.usuario)}</span>
                {c.enRojo > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-400">
                    <TriangleAlert className="size-3.5" />
                    {c.enRojo} no llega{c.enRojo === 1 ? '' : 'n'}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {c.items.length === 0
                  ? `${c.roles.join(', ')} · cola vacía`
                  : `${c.items.length} ${c.items.length === 1 ? 'tarea' : 'tareas'} · ${duracion(c.minutosPendientes)}${c.finCola ? ` · termina ${formatearFechaHora(c.finCola)}` : ''}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Cola cola={elegida} puedeProgramar={puedeProgramar} puedeReasignar={puedeReasignar} />
    </div>
  )
}

function Cola({ cola, puedeProgramar, puedeReasignar }: { cola: ColaPersona; puedeProgramar: boolean; puedeReasignar: boolean }) {
  const sugerir = useOrdenSugerido(cola.usuario.id)
  const [repartiendo, setRepartiendo] = useState(false)
  const aplicar = async () => {
    try {
      await sugerir.mutateAsync()
      toast.success('Cola ordenada por prioridad y fecha de entrega')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo ordenar')
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Cola de {nombreCompleto(cola.usuario)}</h2>
          <p className="text-sm text-muted-foreground">
            {puedeProgramar ? 'Arrastra para cambiar el orden: las fechas se recalculan solas.' : 'Las tareas se hacen en este orden.'} Las reuniones con hora no se mueven.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeReasignar && cola.items.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setRepartiendo(true)}>
              <Shuffle />
              Reasignar carga
            </Button>
          )}
          {puedeProgramar && cola.items.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => void aplicar()} disabled={sugerir.isPending}>
              {sugerir.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
              Orden sugerido
            </Button>
          )}
        </div>
      </div>
      {cola.items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListOrdered />
            </EmptyMedia>
            <EmptyTitle>Cola vacía</EmptyTitle>
            <EmptyDescription>Las tareas de producción que se le asignen aparecerán aquí, en orden.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ListaCola usuarioId={cola.usuario.id} items={cola.items} ordenable={puedeProgramar} />
      )}
      {repartiendo && <DialogoCarga usuarioId={cola.usuario.id} onCerrar={() => setRepartiendo(false)} />}
    </section>
  )
}
