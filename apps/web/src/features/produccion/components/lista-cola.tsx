import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ColaItem } from '@grupoes/shared'
import { Link } from '@tanstack/react-router'
import { Check, Clock, GripVertical, LifeBuoy, Loader2, Pin } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Can } from '@/components/can'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { duracion, formatearFecha, formatearFechaHora } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { BotonCronometro, TiempoTarea } from '@/features/tiempo/components/cronometro'
import { DialogoTiempos } from '@/features/tiempo/components/dialogo-tiempos'
import { useCompletarTareaCola, useReordenarCola } from '../api'
import { DialogoApoyo } from './dialogo-apoyo'
import { describirHolgura, PuntoSemaforo } from './insignias'

interface Props {
  usuarioId: string
  items: ColaItem[]
  /** Arrastrar para reordenar (asistente de producción). */
  ordenable?: boolean
  /** Botones Empezar / Completar (la propia persona). */
  acciones?: boolean
}

/** Cola de trabajo de una persona, en orden, con su inicio y fin planificados. */
export function ListaCola({ usuarioId, items, ordenable, acciones }: Props) {
  // Orden provisional mientras se guarda el arrastre; luego manda lo que devuelve el servidor.
  const [provisional, setProvisional] = useState<string[] | null>(null)
  const orden = provisional ? provisional.map((id) => items.find((i) => i.tareaId === id)).filter((i): i is ColaItem => Boolean(i)) : items
  const reordenar = useReordenarCola(usuarioId)
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const alSoltar = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const nuevo = arrayMove(orden, orden.findIndex((i) => i.tareaId === active.id), orden.findIndex((i) => i.tareaId === over.id)).map((i) => i.tareaId)
    setProvisional(nuevo)
    reordenar.mutate(nuevo, {
      onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo reordenar'),
      onSettled: () => setProvisional(null),
    })
  }

  const filas = orden.map((item, i) => <FilaCola key={item.tareaId} item={item} posicion={i + 1} ordenable={ordenable} acciones={acciones} />)
  if (!ordenable) return <ol className="divide-y rounded-lg border">{filas}</ol>
  return (
    <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={alSoltar}>
      <SortableContext items={orden.map((i) => i.tareaId)} strategy={verticalListSortingStrategy}>
        <ol className={cn('divide-y rounded-lg border', reordenar.isPending && 'opacity-70')}>{filas}</ol>
      </SortableContext>
    </DndContext>
  )
}

function FilaCola({ item, posicion, ordenable, acciones }: { item: ColaItem; posicion: number; ordenable?: boolean; acciones?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.tareaId, disabled: !ordenable })
  const completar = useCompletarTareaCola()
  const esRevision = item.actividad.comportamiento === 'revision'

  const [verTiempos, setVerTiempos] = useState(false)
  const [buscandoApoyo, setBuscandoApoyo] = useState(false)
  const enRiesgo = item.semaforo === 'rojo' || item.semaforo === 'sin_plan'
  const completarTarea = async () => {
    try {
      await completar.mutateAsync({ tareaId: item.tareaId })
      toast.success('Tarea completada')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-start gap-3 bg-card px-3 py-2.5', isDragging && 'relative z-10 shadow-lg')}
    >
      {ordenable ? (
        <button type="button" className="mt-0.5 cursor-grab touch-none text-muted-foreground hover:text-foreground" aria-label={`Mover ${item.titulo ?? item.actividad.nombre}`} {...attributes} {...listeners}>
          <GripVertical className="size-4" />
        </button>
      ) : (
        <span className="mt-0.5 w-4 text-center text-xs text-muted-foreground tabular-nums">{posicion}</span>
      )}
      <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: item.actividad.color }} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{item.titulo ?? item.actividad.nombre}</span>
          {item.estado === 'en_proceso' && <Badge variant="secondary">En proceso</Badge>}
          <TiempoTarea minutosReales={item.minutosReales} minutosEstimados={item.minutos} enCursoDesde={item.enCursoDesde} className="text-xs" />
        </div>
        <span className="text-xs text-muted-foreground">
          <Link to="/trabajos/$id" params={{ id: item.trabajo.id }} className="font-mono hover:text-foreground hover:underline">
            {item.trabajo.codigo}
            {item.trabajo.fechasFijas && <Pin className="ml-1 inline size-3 text-blue-700 dark:text-blue-400" aria-label="Fechas inamovibles" />}
          </Link>
          {item.entregable && ` · ${item.entregable.nombre}`} · {duracion(item.minutos)} · vence el {formatearFecha(item.fechaLimite)}
        </span>
        <span className="flex items-center gap-1.5 text-xs">
          <PuntoSemaforo semaforo={item.semaforo} dias={item.holguraDias} fin={item.plan?.fin} />
          {item.plan ? (
            <span className="text-muted-foreground tabular-nums">
              {formatearFechaHora(item.plan.inicio)} → {formatearFechaHora(item.plan.fin)}
            </span>
          ) : null}
          <span className={cn(item.semaforo === 'rojo' || item.semaforo === 'sin_plan' ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground')}>
            {item.plan ? `· ${describirHolgura(item.semaforo, item.holguraDias)}` : describirHolgura(item.semaforo, item.holguraDias)}
          </span>
        </span>
      </div>
      <Can permiso="programacion.reasignar">
        <Button size={enRiesgo ? 'sm' : 'icon-sm'} variant={enRiesgo ? 'outline' : 'ghost'} className={enRiesgo ? 'shrink-0 border-red-300 text-red-700 dark:border-red-800 dark:text-red-400' : 'shrink-0'} onClick={() => setBuscandoApoyo(true)} aria-label="Buscar apoyo para esta tarea" title="Buscar apoyo: pasarla a otra persona o con horas extra o bono">
          <LifeBuoy />
          {enRiesgo && 'Buscar apoyo'}
        </Button>
      </Can>
      {acciones && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <BotonCronometro tareaId={item.tareaId} enCurso={Boolean(item.enCursoDesde)} compacto />
          <Button size="icon-sm" variant="ghost" onClick={() => setVerTiempos(true)} aria-label="Tiempo registrado">
            <Clock />
          </Button>
          {esRevision ? (
            <Button size="sm" variant="outline" asChild>
              <Link to="/trabajos/$id" params={{ id: item.trabajo.id }}>
                Revisar
              </Link>
            </Button>
          ) : (
            item.estado === 'en_proceso' && (
              <Button size="sm" onClick={() => void completarTarea()} disabled={completar.isPending}>
                {completar.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                Completar
              </Button>
            )
          )}
        </div>
      )}
      {buscandoApoyo && <DialogoApoyo tareaId={item.tareaId} onCerrar={() => setBuscandoApoyo(false)} />}
      {verTiempos && <DialogoTiempos tareaId={item.tareaId} titulo={item.titulo ?? item.actividad.nombre} esResponsable onCerrar={() => setVerTiempos(false)} />}
    </li>
  )
}
