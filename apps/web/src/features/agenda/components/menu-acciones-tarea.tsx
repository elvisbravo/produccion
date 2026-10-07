import { ESTADOS_ACTIVOS, type TareaAgenda, type TareaItem } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarClock, ExternalLink, HandHelping, MoreVertical, Pencil, Shuffle, UserRoundPen, Video, XCircle } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { DialogoApoyo } from '@/features/produccion/components/dialogo-apoyo'
import { DialogoCarga } from '@/features/produccion/components/dialogo-carga'
import { DialogoInicio } from '@/features/produccion/components/dialogo-inicio'
import { DialogoPasarTrabajo } from '@/features/produccion/components/dialogo-pasar-trabajo'
import { tareaDetalleQuery } from '@/features/tareas/api'
import { DialogoEnlaceReunion } from '@/features/tareas/components/dialogo-enlace'
import { DialogoEquipoReunion } from '@/features/tareas/components/dialogo-equipo-reunion'
import { DialogoCancelar, DialogoReprogramar } from '@/features/tareas/components/dialogos-simples'
import { trabajoQuery } from '@/features/trabajos/api'
import { DialogoReprogramar as DialogoReprogramarEntrega } from '@/features/trabajos/components/edicion'
import { usePermiso } from '@/lib/permisos'

type Accion = 'reprogramar' | 'cancelar' | 'equipo' | 'enlace' | 'inicio' | 'apoyo' | 'carga' | 'carga_todos' | 'entrega'

/**
 * Acciones de un bloque del calendario de una persona: reprogramar o cancelar una reunión, cambiar su equipo o enlace, y, en un tramo de la cola,
 * cambiar desde cuándo se programa, buscar apoyo, pasar el trabajo a otro auxiliar o mover la entrega del trabajo. Son los mismos diálogos de siempre,
 * con sus avisos y confirmaciones; la cola se recalcula sola.
 */
export function MenuAccionesTarea({ tarea, usuarioId, estilo }: { tarea: TareaAgenda; usuarioId: string; estilo: CSSProperties }) {
  const [accion, setAccion] = useState<Accion | null>(null)
  const puedeReprogramar = usePermiso('tareas.reprogramar')
  const puedeEditar = usePermiso('tareas.editar')
  const puedeAsignar = usePermiso('tareas.asignar')
  const puedeProgramar = usePermiso('programacion.programar')
  const puedeReasignar = usePermiso('programacion.reasignar')
  const puedeEntrega = usePermiso('trabajos.reprogramar')
  const activa = ESTADOS_ACTIVOS.includes(tarea.estado)
  const esReunion = tarea.comportamiento === 'reunion' && !tarea.enCola

  const reunion = esReunion && activa ? [puedeReprogramar, puedeEditar, puedeAsignar].some(Boolean) : false
  const cola = tarea.enCola && activa && (puedeProgramar || puedeReasignar || puedeEntrega)
  if (!reunion && !cola) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon-xs" className="absolute z-10 size-5 opacity-70 hover:opacity-100" style={estilo} aria-label={`Acciones de ${tarea.actividad}`}>
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {esReunion && (
            <>
              {puedeReprogramar && (
                <DropdownMenuItem onSelect={() => setAccion('reprogramar')}>
                  <CalendarClock /> Reprogramar la reunión
                </DropdownMenuItem>
              )}
              {puedeAsignar && (
                <DropdownMenuItem onSelect={() => setAccion('equipo')}>
                  <UserRoundPen /> Cambiar jefe o auxiliar
                </DropdownMenuItem>
              )}
              {puedeEditar && (
                <DropdownMenuItem onSelect={() => setAccion('enlace')}>
                  <Video /> Enlace de la reunión
                </DropdownMenuItem>
              )}
              {puedeEditar && (
                <DropdownMenuItem variant="destructive" onSelect={() => setAccion('cancelar')}>
                  <XCircle /> Cancelar la reunión
                </DropdownMenuItem>
              )}
            </>
          )}
          {tarea.enCola && (
            <>
              {puedeProgramar && (
                <DropdownMenuItem onSelect={() => setAccion('inicio')}>
                  <Pencil /> Cambiar desde cuándo se programa
                </DropdownMenuItem>
              )}
              {puedeReasignar && (
                <DropdownMenuItem onSelect={() => setAccion('apoyo')}>
                  <HandHelping /> Buscar apoyo (horas extra, bono u otro auxiliar)
                </DropdownMenuItem>
              )}
              {puedeReasignar && (
                <DropdownMenuItem onSelect={() => setAccion('carga')}>
                  <Shuffle /> {tarea.referencia?.tipo === 'trabajo' ? 'Pasar a otro auxiliar (tarea, bloque o trabajo)' : 'Pasar trabajos a otro auxiliar'}
                </DropdownMenuItem>
              )}
              {puedeEntrega && tarea.referencia?.tipo === 'trabajo' && (
                <DropdownMenuItem onSelect={() => setAccion('entrega')}>
                  <CalendarClock /> Mover la entrega del trabajo
                </DropdownMenuItem>
              )}
            </>
          )}
          {tarea.referencia && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                {tarea.referencia.tipo === 'trabajo' ? (
                  <Link to="/trabajos/$id" params={{ id: tarea.referencia.id }}>
                    <ExternalLink /> Abrir {tarea.referencia.codigo}
                  </Link>
                ) : (
                  <Link to="/prospectos/$id" params={{ id: tarea.referencia.id }}>
                    <ExternalLink /> Abrir {tarea.referencia.codigo}
                  </Link>
                )}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {accion && <Dialogos accion={accion} tarea={tarea} usuarioId={usuarioId} onCerrar={() => setAccion(null)} onVerTodos={() => setAccion('carga_todos')} />}
    </>
  )
}

/** Carga el detalle que cada diálogo necesita y lo muestra. */
function Dialogos({ accion, tarea, usuarioId, onCerrar, onVerTodos }: { accion: Accion; tarea: TareaAgenda; usuarioId: string; onCerrar: () => void; onVerTodos: () => void }) {
  const necesitaTarea = accion === 'reprogramar' || accion === 'cancelar' || accion === 'equipo' || accion === 'enlace' || accion === 'inicio'
  const { data: t } = useQuery(tareaDetalleQuery(tarea.id, necesitaTarea))
  const { data: trabajo } = useQuery({ ...trabajoQuery(tarea.referencia?.id ?? ''), enabled: accion === 'entrega' && tarea.referencia?.tipo === 'trabajo' })
  const cerrar = (abierto: boolean) => !abierto && onCerrar()

  if (accion === 'apoyo') return <DialogoApoyo tareaId={tarea.id} onCerrar={onCerrar} />
  // Desde un tramo de un trabajo se abre enfocado en eso; «ver todos» abre la lista completa de la persona.
  if (accion === 'carga' && tarea.referencia?.tipo === 'trabajo') return <DialogoPasarTrabajo usuarioId={usuarioId} trabajoId={tarea.referencia.id} tareaId={tarea.id} onCerrar={onCerrar} onVerTodos={onVerTodos} />
  if (accion === 'carga' || accion === 'carga_todos') return <DialogoCarga usuarioId={usuarioId} onCerrar={onCerrar} />
  if (accion === 'entrega') return trabajo ? <DialogoReprogramarEntrega t={trabajo} abierto onAbiertoChange={cerrar} /> : null
  if (!t) return null
  return <DialogoDeTarea accion={accion} t={t} cerrar={cerrar} onCerrar={onCerrar} />
}

function DialogoDeTarea({ accion, t, cerrar, onCerrar }: { accion: Accion; t: TareaItem; cerrar: (abierto: boolean) => void; onCerrar: () => void }) {
  if (accion === 'reprogramar') return <DialogoReprogramar tarea={t} abierto onAbiertoChange={cerrar} />
  if (accion === 'cancelar') return <DialogoCancelar tarea={t} abierto onAbiertoChange={cerrar} />
  if (accion === 'enlace') return <DialogoEnlaceReunion tareaId={t.id} enlace={t.enlaceReunion} onCerrar={onCerrar} />
  if (accion === 'equipo') {
    const de = (texto: string) => t.responsables.find((r) => r.rol.toLowerCase().includes(texto))?.usuario.id ?? null
    return <DialogoEquipoReunion tareaId={t.id} actividad={t.actividad.nombre} jefeId={de('jefe')} auxiliarId={de('auxiliar')} onCerrar={onCerrar} />
  }
  if (accion === 'inicio') return <DialogoInicio tareaId={t.id} actividad={t.titulo ?? t.actividad.nombre} fecha={t.fecha} hora="" onCerrar={onCerrar} />
  return null
}
