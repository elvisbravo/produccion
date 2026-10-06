import type { TrabajoDetalle } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { Video } from 'lucide-react'
import { useState } from 'react'
import { Can } from '@/components/can'
import { Button } from '@/components/ui/button'
import { actividadesQuery } from '@/features/tareas/api'
import { DialogoEquipoReunion } from '@/features/tareas/components/dialogo-equipo-reunion'
import { DialogoProgramar } from '@/features/tareas/components/dialogo-programar'
import { usePermiso } from '@/lib/permisos'

/** Botón de la ficha: programar una reunión (enfoque…) con el cliente de este trabajo. */
export function BotonProgramarReunion({ t }: { t: TrabajoDetalle }) {
  const [abierto, setAbierto] = useState(false)
  // Quien puede asignar elige de una vez quién la da; si no, la reunión queda por asignar y se ve igual en el calendario del equipo.
  const puedeAsignar = usePermiso('tareas.asignar')
  const [recien, setRecien] = useState<{ tareaId: string; actividad: string } | null>(null)
  const { data: actividades = [] } = useQuery({ ...actividadesQuery('cliente'), enabled: abierto })
  if (['finalizado', 'cancelado'].includes(t.estado)) return null
  // Solo reuniones; las que se asignan al responsable del trabajo no se programan desde aquí.
  const reuniones = actividades.filter((a) => a.tipo.comportamiento === 'reunion' && a.modoAsignacion !== 'responsable_trabajo')
  return (
    <Can permiso="tareas.crear">
      <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
        <Video />
        Programar reunión
      </Button>
      {abierto && (
        <DialogoProgramar
          trabajoId={t.id}
          actividades={reuniones}
          abierto
          onAbiertoChange={setAbierto}
          onProgramada={(tarea) => {
            if (puedeAsignar && tarea.estado === 'por_asignar') setRecien({ tareaId: tarea.id, actividad: tarea.actividad.nombre })
          }}
        />
      )}
      {recien && <DialogoEquipoReunion tareaId={recien.tareaId} actividad={recien.actividad} jefeId={null} auxiliarId={null} onCerrar={() => setRecien(null)} />}
    </Can>
  )
}
