import {
  formatearCelular,
  NOMBRE_ESTADO_TAREA,
  NOMBRE_MODALIDAD,
  type ActividadCatalogo,
  type CatalogosProspecto,
  type EstadoTarea,
  type ResultadoCompletar,
  type TareaItem,
} from '@grupoes/shared'
import { Link } from '@tanstack/react-router'
import { CalendarClock, Check, CircleSlash, EllipsisVertical, Repeat2, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { describirCuando, duracion, nombreCompleto } from '@/lib/formato'
import { useAlcance, usePermiso } from '@/lib/permisos'
import { useSesion } from '@/stores/sesion'
import { cn } from '@/lib/utils'
import { DialogoAsignar } from './dialogo-asignar'
import { DialogoCompletar } from './dialogo-completar'
import { DialogoCancelar, DialogoReprogramar } from './dialogos-simples'

const ESTILO_ESTADO: Record<EstadoTarea, string> = {
  por_asignar: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  pendiente: '',
  en_proceso: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
  completada: 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200',
  cancelada: 'text-muted-foreground line-through',
  no_asistio: 'border-zinc-300 text-muted-foreground',
}

export function InsigniaEstadoTarea({ tarea }: { tarea: Pick<TareaItem, 'estado' | 'vencida'> }) {
  if (tarea.vencida) {
    return (
      <Badge variant="outline" className="border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        Vencida
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className={ESTILO_ESTADO[tarea.estado]}>
      {NOMBRE_ESTADO_TAREA[tarea.estado]}
    </Badge>
  )
}

interface Props {
  tarea: TareaItem
  hoy: string
  actividades: ActividadCatalogo[]
  catalogos: Pick<CatalogosProspecto, 'resultadosContacto' | 'motivosPerdida'>
  /** Muestra el prospecto al que pertenece (en listas generales). */
  mostrarProspecto?: boolean
  hayOtrasPendientes?: boolean
  onCompletada?: (resultado: ResultadoCompletar) => void
}

type Dialogo = 'completar' | 'reprogramar' | 'cancelar' | 'asignar' | null

export function TareaFila({ tarea, hoy, actividades, catalogos, mostrarProspecto, hayOtrasPendientes = false, onCompletada }: Props) {
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const puedeEditar = usePermiso('tareas.editar')
  const puedeReprogramar = usePermiso('tareas.reprogramar')
  const puedeAsignar = usePermiso('tareas.asignar')
  const alcanceEditar = useAlcance('tareas.editar')
  const usuarioId = useSesion((s) => s.usuario?.id)
  // Con alcance "propios" solo la completa quien la realiza.
  const puedeCancelar =
    puedeEditar && (alcanceEditar === 'todos' || puedeAsignar || tarea.creadaPor.id === usuarioId || tarea.prospecto?.responsableId === usuarioId)
  const puedeCompletar = puedeEditar && (alcanceEditar === 'todos' || tarea.responsables.some((r) => r.usuario.id === usuarioId))
  const activa = ['por_asignar', 'pendiente', 'en_proceso'].includes(tarea.estado)
  const cerrar = (abierto: boolean) => !abierto && setDialogo(null)
  const contacto = tarea.prospecto?.contacto
  const puedeVerProspecto = usePermiso('prospectos.ver')

  return (
    <li className={cn('flex items-start gap-3 py-3', !activa && 'opacity-70')}>
      <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: tarea.actividad.color }} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{tarea.titulo ?? tarea.actividad.nombre}</span>
          <InsigniaEstadoTarea tarea={tarea} />
          {tarea.modalidad && <span className="text-xs text-muted-foreground">{NOMBRE_MODALIDAD[tarea.modalidad]}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className={cn('inline-flex items-center gap-1', tarea.vencida && 'text-red-700 dark:text-red-400')}>
            <CalendarClock className="size-3.5" />
            {describirCuando(tarea, hoy)} · {duracion(tarea.minutosEstimados)}
          </span>
          {tarea.responsables.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" />
              {tarea.responsables.map((r) => nombreCompleto(r.usuario)).join(', ')}
            </span>
          )}
          {mostrarProspecto && tarea.prospecto && (
            <ReferenciaProspecto prospecto={tarea.prospecto} enlazar={puedeVerProspecto}>
              <span className="font-mono text-xs">{tarea.prospecto.codigo}</span>
              {contacto && ` · ${nombreCompleto(contacto) ?? formatearCelular(contacto.celular)}`}
            </ReferenciaProspecto>
          )}
          {tarea.trabajo && (
            <Link to="/trabajos/$id" params={{ id: tarea.trabajo.id }} className="hover:text-foreground hover:underline">
              <span className="font-mono text-xs">{tarea.trabajo.codigo}</span>
              {tarea.entregable && ` · ${tarea.entregable.nombre}`}
            </Link>
          )}
        </div>
        {tarea.notas && activa && <p className="text-sm">{tarea.notas}</p>}
        {!activa && (tarea.resultadoContacto || tarea.resultado || tarea.motivoCancelacion) && (
          <p className="text-sm">
            {[tarea.resultadoContacto, tarea.resultado, tarea.motivoCancelacion].filter(Boolean).join(' — ')}
          </p>
        )}
      </div>

      {activa && (
        <div className="flex shrink-0 items-center gap-1">
          {tarea.entregable && tarea.actividad.comportamiento === 'revision' ? (
            // La revisión se cierra aprobando u observando el entregable, en el trabajo.
            <Button size="sm" variant="outline" asChild>
              <Link to="/trabajos/$id" params={{ id: tarea.trabajo!.id }}>
                <Check />
                Revisar
              </Link>
            </Button>
          ) : tarea.estado === 'por_asignar' && puedeAsignar ? (
            <Button size="sm" onClick={() => setDialogo('asignar')}>
              <UserPlus />
              Asignar
            </Button>
          ) : (
            tarea.estado !== 'por_asignar' &&
            puedeCompletar && (
              <Button size="sm" variant="outline" onClick={() => setDialogo('completar')}>
                <Check />
                Completar
              </Button>
            )
          )}
          {(puedeCancelar || puedeReprogramar || puedeAsignar) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Más acciones">
                  <EllipsisVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {puedeReprogramar && (
                  <DropdownMenuItem onSelect={() => setDialogo('reprogramar')}>
                    <Repeat2 />
                    Reprogramar
                  </DropdownMenuItem>
                )}
                {puedeAsignar && tarea.estado !== 'por_asignar' && (
                  <DropdownMenuItem onSelect={() => setDialogo('asignar')}>
                    <UserPlus />
                    Reasignar
                  </DropdownMenuItem>
                )}
                {puedeCancelar && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDialogo('cancelar')}>
                      <CircleSlash />
                      Cancelar
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {dialogo === 'completar' && (
        <DialogoCompletar
          tarea={tarea}
          actividades={actividades}
          catalogos={catalogos}
          hayOtrasPendientes={hayOtrasPendientes}
          abierto
          onAbiertoChange={cerrar}
          onCompletada={onCompletada}
        />
      )}
      {dialogo === 'reprogramar' && <DialogoReprogramar tarea={tarea} abierto onAbiertoChange={cerrar} />}
      {dialogo === 'cancelar' && <DialogoCancelar tarea={tarea} abierto onAbiertoChange={cerrar} />}
      {dialogo === 'asignar' && <DialogoAsignar tareaId={tarea.id} hoy={hoy} abierto onAbiertoChange={cerrar} />}
    </li>
  )
}

/** Enlace al prospecto, o solo el texto si el usuario no puede verlo (p. ej. el auxiliar que da el enfoque). */
function ReferenciaProspecto({ prospecto, enlazar, children }: { prospecto: { id: string }; enlazar: boolean; children: React.ReactNode }) {
  if (!enlazar) return <span>{children}</span>
  return (
    <Link to="/prospectos/$id" params={{ id: prospecto.id }} className="hover:text-foreground hover:underline">
      {children}
    </Link>
  )
}
