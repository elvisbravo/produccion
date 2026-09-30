import { diaEnLima, sumarDias } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { CalendarOff } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { agendaMiaQuery } from '@/features/agenda/api'
import { Leyenda } from '@/features/agenda/components/leyenda'
import { NavegacionSemana } from '@/features/agenda/components/navegacion-semana'
import { Semana } from '@/features/agenda/components/semana'
import { horas, lunesDe } from '@/features/agenda/semanas'
import { exigirPermiso } from '@/lib/guardas'
import { usePermiso } from '@/lib/permisos'

export const Route = createFileRoute('/_app/agenda/')({
  validateSearch: z.object({ semana: z.iso.date().optional().catch(undefined) }),
  beforeLoad: () => exigirPermiso('agenda.ver'),
  component: MiAgenda,
})

function MiAgenda() {
  const { semana } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const hoy = diaEnLima()
  const lunesActual = lunesDe(hoy)
  const lunes = semana ? lunesDe(semana) : lunesActual
  const { data, isPending } = useQuery(agendaMiaQuery(lunes, sumarDias(lunes, 6)))
  const puedeSolicitar = usePermiso('ausencias.solicitar')

  const capacidad = data?.dias.reduce((s, d) => s + d.capacidad, 0) ?? 0
  const ocupado = data?.dias.reduce((s, d) => s + d.ocupado, 0) ?? 0

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Mi agenda</h1>
          <p className="text-sm text-muted-foreground">
            Tu horario, tus días libres y tus actividades.
            {data && capacidad > 0 && ` Esta semana: ${horas(ocupado)} programadas de ${horas(capacidad)} disponibles.`}
          </p>
        </div>
        {puedeSolicitar && (
          <Button variant="outline" asChild>
            <Link to="/ausencias" search={{ nueva: true }}>
              <CalendarOff />
              Solicitar vacaciones o permiso
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <NavegacionSemana lunes={lunes} lunesActual={lunesActual} onCambiar={(s) => void navigate({ search: { semana: s }, replace: true })} />
        <Leyenda />
      </div>

      {isPending || !data ? <Skeleton className="h-[640px]" /> : <Semana dias={data.dias} hoy={hoy} />}
    </div>
  )
}
