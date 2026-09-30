import { diaEnLima, type TareaItem } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CalendarCheck2, Inbox } from 'lucide-react'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { actividadesQuery, misTareasQuery, porAsignarQuery, useCatalogosSeguimiento } from '@/features/tareas/api'
import { TareaFila } from '@/features/tareas/components/tarea-fila'
import { exigirPermiso } from '@/lib/guardas'
import { usePermiso } from '@/lib/permisos'

export const Route = createFileRoute('/_app/tareas/')({
  validateSearch: z.object({ vista: z.enum(['mias', 'por-asignar']).optional().catch(undefined) }),
  beforeLoad: () => exigirPermiso('tareas.ver'),
  component: PaginaTareas,
})

function PaginaTareas() {
  const { vista } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const puedeAsignar = usePermiso('tareas.asignar')
  const { data: porAsignar } = useQuery({ ...porAsignarQuery, enabled: puedeAsignar })
  const pestana = vista ?? 'mias'

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tareas</h1>
        <p className="text-sm text-muted-foreground">Tus actividades programadas{puedeAsignar ? ' y las que esperan responsable' : ''}.</p>
      </div>

      <Tabs value={pestana} onValueChange={(v) => void navigate({ search: { vista: v === 'mias' ? undefined : (v as 'por-asignar') }, replace: true })}>
        {puedeAsignar && (
          <TabsList>
            <TabsTrigger value="mias">Mis tareas</TabsTrigger>
            <TabsTrigger value="por-asignar">
              Por asignar
              {porAsignar && porAsignar.length > 0 && <Badge className="ml-1 h-5 min-w-5 px-1.5">{porAsignar.length}</Badge>}
            </TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="mias" className="mt-4">
          <MisTareas />
        </TabsContent>
        {puedeAsignar && (
          <TabsContent value="por-asignar" className="mt-4">
            <PorAsignar tareas={porAsignar} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

function useApoyo() {
  const { data: actividades = [] } = useQuery(actividadesQuery('prospecto'))
  const catalogos = useCatalogosSeguimiento()
  return { actividades, catalogos, hoy: diaEnLima() }
}

function MisTareas() {
  const { data: tareas, isPending } = useQuery(misTareasQuery)
  const { actividades, catalogos, hoy } = useApoyo()

  if (isPending) return <Cargando />
  const activas = (tareas ?? []).filter((t) => ['pendiente', 'en_proceso'].includes(t.estado))
  const grupos: { titulo: string; tareas: TareaItem[]; destacar?: boolean }[] = [
    { titulo: 'Vencidas', tareas: activas.filter((t) => t.vencida), destacar: true },
    { titulo: 'Hoy', tareas: activas.filter((t) => !t.vencida && t.fecha === hoy) },
    { titulo: 'Próximas', tareas: activas.filter((t) => t.fecha > hoy) },
    { titulo: 'Completadas hoy', tareas: (tareas ?? []).filter((t) => !['pendiente', 'en_proceso', 'por_asignar'].includes(t.estado)) },
  ].filter((g) => g.tareas.length > 0)

  if (grupos.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarCheck2 />
          </EmptyMedia>
          <EmptyTitle>No tienes actividades pendientes</EmptyTitle>
          <EmptyDescription>Cuando te asignen o programes una actividad, aparecerá aquí.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {grupos.map((g) => (
        <Card key={g.titulo} className={g.destacar ? 'border-red-200 dark:border-red-900' : undefined}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {g.titulo}
              <Badge variant="secondary">{g.tareas.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {g.tareas.map((t) => (
                <TareaFila key={t.id} tarea={t} hoy={hoy} actividades={actividades} catalogos={catalogos} mostrarProspecto />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function PorAsignar({ tareas }: { tareas: TareaItem[] | undefined }) {
  const { actividades, catalogos, hoy } = useApoyo()
  if (!tareas) return <Cargando />
  if (tareas.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox />
          </EmptyMedia>
          <EmptyTitle>Nada por asignar</EmptyTitle>
          <EmptyDescription>Los enfoques y demás actividades coordinadas llegan aquí para elegir al responsable.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <Card>
      <CardContent>
        <ul className="divide-y">
          {tareas.map((t) => (
            <TareaFila key={t.id} tarea={t} hoy={hoy} actividades={actividades} catalogos={catalogos} mostrarProspecto />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function Cargando() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
    </div>
  )
}
