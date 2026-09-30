import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import type { CatalogosProspecto, TableroSeguimiento, TarjetaSeguimiento } from '@grupoes/shared'
import { useNavigate } from '@tanstack/react-router'
import { CircleX, PartyPopper } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { usePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { useCambiarEtapa } from '@/features/tareas/api'
import { DialogoPerdido } from './cambio-etapa'
import { Tarjeta } from './tarjeta-seguimiento'

type Etapa = TableroSeguimiento['etapas'][number]

interface Props {
  tablero: TableroSeguimiento
  prospectos: TarjetaSeguimiento[]
  motivos: CatalogosProspecto['motivosPerdida']
}

const ZONA_PERDIDO = 'zona:perdido'
const ZONA_CONVERTIDO = 'zona:convertido'

/** Tablero del embudo: columnas por etapa abierta; se arrastran las tarjetas para cambiar de etapa. */
export function Kanban({ tablero, prospectos, motivos }: Props) {
  const puedeMover = usePermiso('prospectos.editar')
  const puedePerder = usePermiso('prospectos.marcar_perdido')
  const puedeConvertir = usePermiso('prospectos.convertir')
  const navigate = useNavigate()
  const cambiar = useCambiarEtapa()
  const [arrastrado, setArrastrado] = useState<TarjetaSeguimiento | null>(null)
  const [aPerdido, setAPerdido] = useState<TarjetaSeguimiento | null>(null)

  const abiertas = tablero.etapas.filter((e) => e.clase === 'abierta')
  const perdida = tablero.etapas.find((e) => e.clase === 'perdida')
  const sensores = useSensors(
    // Un clic sin mover sigue abriendo el prospecto; arrastrar requiere desplazar unos píxeles.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  const alSoltar = ({ active, over }: DragEndEvent) => {
    setArrastrado(null)
    const p = prospectos.find((x) => x.id === active.id)
    if (!p || !over) return
    if (over.id === ZONA_CONVERTIDO) {
      if (puedeConvertir) void navigate({ to: '/prospectos/$id/convertir', params: { id: p.id } })
      else toast.info('No tienes permiso para convertir prospectos en clientes.')
      return
    }
    if (over.id === ZONA_PERDIDO) {
      setAPerdido(p)
      return
    }
    const destino = abiertas.find((e) => e.id === over.id)
    if (!destino || destino.id === p.etapaId) return
    cambiar.mutate(
      { prospectoId: p.id, etapaId: destino.id },
      {
        onSuccess: () => toast.success(`${p.codigo} pasó a "${destino.nombre}"`),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo mover el prospecto'),
      },
    )
  }

  return (
    <DndContext
      sensors={sensores}
      onDragStart={({ active }) => setArrastrado(prospectos.find((p) => p.id === active.id) ?? null)}
      onDragCancel={() => setArrastrado(null)}
      onDragEnd={alSoltar}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {abiertas.map((etapa) => (
          <Columna
            key={etapa.id}
            etapa={etapa}
            prospectos={prospectos.filter((p) => p.etapaId === etapa.id)}
            hoy={tablero.hoy}
            puedeMover={puedeMover}
            idArrastrado={arrastrado?.id}
          />
        ))}
        {puedeMover && (
          <div className="flex w-44 shrink-0 flex-col gap-2">
            <ZonaSoltar id={ZONA_CONVERTIDO} icono={<PartyPopper className="size-4" />} titulo="Convertido" texto="Suelta aquí para registrar el contrato" tono="exito" deshabilitada={!puedeConvertir} />
            {perdida && puedePerder && (
              <ZonaSoltar id={ZONA_PERDIDO} icono={<CircleX className="size-4" />} titulo="Perdido" texto="Suelta aquí; pedirá el motivo" tono="neutro" />
            )}
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={null}>{arrastrado && <Tarjeta p={arrastrado} hoy={tablero.hoy} arrastrando />}</DragOverlay>

      {aPerdido && perdida && (
        <DialogoPerdido
          prospectoId={aPerdido.id}
          codigo={aPerdido.codigo}
          etapaPerdida={perdida}
          motivos={motivos}
          abierto
          onAbiertoChange={(abierto) => !abierto && setAPerdido(null)}
        />
      )}
    </DndContext>
  )
}

function Columna({
  etapa,
  prospectos,
  hoy,
  puedeMover,
  idArrastrado,
}: {
  etapa: Etapa
  prospectos: TarjetaSeguimiento[]
  hoy: string
  puedeMover: boolean
  idArrastrado?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id, disabled: !puedeMover })
  return (
    <section
      ref={setNodeRef}
      aria-label={`Etapa ${etapa.nombre}`}
      className={cn('flex w-72 shrink-0 flex-col gap-2 rounded-xl bg-muted/60 p-2 transition-colors', isOver && 'bg-muted ring-2 ring-ring/40')}
    >
      <header className="flex items-center gap-2 px-1.5 pt-1 pb-0.5 text-sm font-semibold">
        <span className="size-2 rounded-full" style={{ backgroundColor: etapa.color }} aria-hidden="true" />
        {etapa.nombre}
        <span className="ml-auto font-medium text-muted-foreground">{prospectos.length}</span>
      </header>
      <div className="flex min-h-24 flex-col gap-2">
        {prospectos.map((p) => (
          <TarjetaArrastrable key={p.id} p={p} hoy={hoy} deshabilitada={!puedeMover} oculta={p.id === idArrastrado} />
        ))}
        {prospectos.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Sin prospectos</p>}
      </div>
    </section>
  )
}

function TarjetaArrastrable({ p, hoy, deshabilitada, oculta }: { p: TarjetaSeguimiento; hoy: string; deshabilitada: boolean; oculta: boolean }) {
  const { setNodeRef, attributes, listeners } = useDraggable({ id: p.id, disabled: deshabilitada })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn('touch-none', !deshabilitada && 'cursor-grab', oculta && 'opacity-30')}>
      <Tarjeta p={p} hoy={hoy} />
    </div>
  )
}

function ZonaSoltar({
  id,
  icono,
  titulo,
  texto,
  tono,
  deshabilitada,
}: {
  id: string
  icono: React.ReactNode
  titulo: string
  texto: string
  tono: 'exito' | 'neutro'
  deshabilitada?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col items-center gap-1 rounded-xl border-2 border-dashed p-4 text-center text-xs transition-colors',
        tono === 'exito' ? 'border-green-300 bg-green-50/60 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300' : 'border-zinc-300 bg-card text-muted-foreground dark:border-zinc-700',
        isOver && !deshabilitada && 'border-solid ring-2 ring-ring/40',
        deshabilitada && 'opacity-70',
      )}
    >
      {icono}
      <span className="text-sm font-semibold">{titulo}</span>
      <span>{texto}</span>
    </div>
  )
}
