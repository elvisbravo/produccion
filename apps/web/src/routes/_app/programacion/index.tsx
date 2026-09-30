import { diaEnLima, ROLES_BASE, sumarDias, type AgendaPersona } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { agendaEquipoQuery, agendaUsuarioQuery } from '@/features/agenda/api'
import { COLOR_ESTADO_DIA } from '@/features/agenda/components/insignias'
import { Leyenda } from '@/features/agenda/components/leyenda'
import { NavegacionSemana } from '@/features/agenda/components/navegacion-semana'
import { Semana } from '@/features/agenda/components/semana'
import { TablaEquipo } from '@/features/agenda/components/tabla-equipo'
import { describirSemana, lunesDe } from '@/features/agenda/semanas'
import { nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { cn } from '@/lib/utils'

const ROLES = { todos: undefined, auxiliares: ROLES_BASE.AUXILIAR, jefes: ROLES_BASE.JEFE_PROD } as const
type FiltroRol = keyof typeof ROLES

export const Route = createFileRoute('/_app/programacion/')({
  validateSearch: z.object({
    semana: z.iso.date().optional().catch(undefined),
    rol: z.enum(['todos', 'auxiliares', 'jefes']).optional().catch(undefined),
  }),
  beforeLoad: () => exigirPermiso('programacion.ver'),
  component: AgendaEquipo,
})

function AgendaEquipo() {
  const { semana, rol } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const hoy = diaEnLima()
  const lunesActual = lunesDe(hoy)
  const lunes = semana ? lunesDe(semana) : lunesActual
  const filtro: FiltroRol = rol ?? 'todos'
  const { data, isPending } = useQuery(agendaEquipoQuery(lunes, sumarDias(lunes, 6), ROLES[filtro]))
  const [elegida, setElegida] = useState<AgendaPersona | null>(null)

  const noLaborablesHoy = data?.personas.filter((p) => p.dias.find((d) => d.fecha === hoy)?.estado === 'no_laborable') ?? []

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Agenda del equipo</h1>
        <p className="text-sm text-muted-foreground">
          Horas programadas sobre las disponibles de cada persona. Toca una fila para ver su semana.
          {noLaborablesHoy.length > 0 && ` Hoy no trabajan: ${noLaborablesHoy.map((p) => nombreCompleto(p.usuario)).join(', ')}.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <NavegacionSemana lunes={lunes} lunesActual={lunesActual} onCambiar={(s) => void navigate({ search: (x) => ({ ...x, semana: s }), replace: true })} />
        <ToggleGroup
          type="single"
          variant="outline"
          value={filtro}
          onValueChange={(v) => v && void navigate({ search: (x) => ({ ...x, rol: v === 'todos' ? undefined : (v as FiltroRol) }), replace: true })}
        >
          <ToggleGroupItem value="todos">Todos</ToggleGroupItem>
          <ToggleGroupItem value="auxiliares">Auxiliares</ToggleGroupItem>
          <ToggleGroupItem value="jefes">Jefes</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(['libre', 'ocupado', 'sobrecargado', 'no_laborable'] as const).map((e) => (
          <li key={e} className="flex items-center gap-1.5">
            <span className={cn('h-1.5 w-4 rounded-full', COLOR_ESTADO_DIA[e].barra)} aria-hidden="true" />
            {{ libre: 'Libre', ocupado: 'Más del 75 %', sobrecargado: 'Sobrecargado', no_laborable: 'No laborable' }[e]}
          </li>
        ))}
      </ul>

      {isPending || !data ? (
        <Skeleton className="h-80" />
      ) : data.personas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay personas con ese rol.</p>
      ) : (
        <TablaEquipo personas={data.personas} hoy={hoy} onElegir={setElegida} />
      )}

      <Sheet open={Boolean(elegida)} onOpenChange={(abierto) => !abierto && setElegida(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-5xl">
          {elegida && <SemanaPersona persona={elegida} lunes={lunes} hoy={hoy} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function SemanaPersona({ persona, lunes, hoy }: { persona: AgendaPersona; lunes: string; hoy: string }) {
  const [desde, setDesde] = useState(lunes)
  const { data } = useQuery(agendaUsuarioQuery(persona.usuario.id, desde, sumarDias(desde, 6)))
  return (
    <>
      <SheetHeader>
        <SheetTitle>{nombreCompleto(persona.usuario)}</SheetTitle>
        <SheetDescription>
          {persona.roles.join(', ')} · {describirSemana(desde)}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <NavegacionSemana lunes={desde} lunesActual={lunesDe(hoy)} onCambiar={(s) => setDesde(s ?? lunesDe(hoy))} />
          <Leyenda />
        </div>
        {data ? <Semana dias={data.dias} hoy={hoy} /> : <Skeleton className="h-[600px]" />}
      </div>
    </>
  )
}
