import { diaEnLima, NOMBRE_ALCANCE_FERIADO, resumirHorario, type FeriadoItem, type PersonalItem, type PlantillaHorarioItem } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Cake, ChevronLeft, ChevronRight, Clock, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { feriadosQuery, personalQuery, plantillasQuery } from '@/features/agenda/api'
import { DialogoCumpleanos, DialogoFeriado, DialogoHorario, DialogoPlantilla } from '@/features/agenda/components/dialogos-calendario'
import { formatearFecha, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { usePermiso } from '@/lib/permisos'

const PESTANAS = ['personal', 'plantillas', 'feriados'] as const

export const Route = createFileRoute('/_app/calendario/')({
  validateSearch: z.object({ vista: z.enum(PESTANAS).optional().catch(undefined), anio: z.number().int().optional().catch(undefined) }),
  beforeLoad: () => exigirPermiso('calendario.ver'),
  component: PaginaCalendario,
})

function PaginaCalendario() {
  const { vista } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Horarios y feriados</h1>
        <p className="text-sm text-muted-foreground">De esto depende la disponibilidad de cada persona al programar tareas.</p>
      </div>
      <Tabs value={vista ?? 'personal'} onValueChange={(v) => void navigate({ search: (x) => ({ ...x, vista: v === 'personal' ? undefined : (v as (typeof PESTANAS)[number]) }), replace: true })}>
        <TabsList>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="plantillas">Plantillas</TabsTrigger>
          <TabsTrigger value="feriados">Feriados</TabsTrigger>
        </TabsList>
        <TabsContent value="personal" className="mt-4">
          <Personal />
        </TabsContent>
        <TabsContent value="plantillas" className="mt-4">
          <Plantillas />
        </TabsContent>
        <TabsContent value="feriados" className="mt-4">
          <Feriados />
        </TabsContent>
      </Tabs>
    </div>
  )
}

const diaYMes = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', timeZone: 'UTC' })

const proximoCumple =(nacimiento: string, hoy: string) => {
  const esteAnio = `${hoy.slice(0, 4)}${nacimiento.slice(4)}`
  return esteAnio >= hoy ? esteAnio : `${Number(hoy.slice(0, 4)) + 1}${nacimiento.slice(4)}`
}

function Personal() {
  const { data, isPending } = useQuery(personalQuery)
  const puedeEditar = usePermiso('calendario.editar')
  const [editando, setEditando] = useState<{ persona: PersonalItem; que: 'horario' | 'cumple' } | null>(null)
  const hoy = diaEnLima()

  if (isPending || !data) return <Skeleton className="h-64" />
  return (
    <>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              <TableHead>Horario</TableHead>
              <TableHead className="hidden md:table-cell">Cumpleaños</TableHead>
              {puedeEditar && <TableHead className="w-24" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((p) => (
              <TableRow key={p.usuario.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{nombreCompleto(p.usuario)}</span>
                    <span className="text-xs text-muted-foreground">{p.roles.join(', ')}</span>
                  </div>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-col gap-0.5">
                    <span>{resumirHorario(p.horario.tramos)}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.horario.porDefecto
                        ? `Plantilla por defecto${p.horario.plantilla ? ` (${p.horario.plantilla.nombre})` : ''}`
                        : `${p.horario.plantilla?.nombre ?? 'Personalizado'} · desde ${formatearFecha(p.horario.vigenteDesde)}`}
                    </span>
                    {p.proximo && (
                      <span className="text-xs text-amber-700 dark:text-amber-400">
                        Cambia el {formatearFecha(p.proximo.vigenteDesde)}: {resumirHorario(p.proximo.tramos)}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {p.fechaNacimiento ? (
                    <span className="flex flex-col">
                      <span>{diaYMes.format(new Date(`${p.fechaNacimiento}T12:00:00Z`))}</span>
                      {proximoCumple(p.fechaNacimiento, hoy) === hoy && <Badge variant="secondary">Hoy</Badge>}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                {puedeEditar && (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditando({ persona: p, que: 'horario' })} aria-label={`Cambiar horario de ${nombreCompleto(p.usuario)}`}>
                        <Clock />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditando({ persona: p, que: 'cumple' })} aria-label={`Cumpleaños de ${nombreCompleto(p.usuario)}`}>
                        <Cake />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editando?.que === 'horario' && (
        <DialogoHorario key={editando.persona.usuario.id} persona={editando.persona} abierto onAbiertoChange={(v) => !v && setEditando(null)} />
      )}
      {editando?.que === 'cumple' && (
        <DialogoCumpleanos key={editando.persona.usuario.id} persona={editando.persona} abierto onAbiertoChange={(v) => !v && setEditando(null)} />
      )}
    </>
  )
}

function Plantillas() {
  const { data, isPending } = useQuery(plantillasQuery)
  const puedeEditar = usePermiso('calendario.editar')
  const [editando, setEditando] = useState<PlantillaHorarioItem | 'nueva' | null>(null)

  if (isPending || !data) return <Skeleton className="h-40" />
  return (
    <div className="flex flex-col gap-4">
      {puedeEditar && (
        <Button variant="outline" className="w-fit" onClick={() => setEditando('nueva')}>
          <Plus />
          Nueva plantilla
        </Button>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {data.map((p) => (
          <Card key={p.id} className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardTitle className="flex items-center gap-2">
                {p.nombre}
                {p.porDefecto && <Badge variant="secondary">Por defecto</Badge>}
              </CardTitle>
              <CardDescription>
                {resumirHorario(p.tramos)}
                <br />
                {p.enUso === 0 ? 'Nadie tiene copiado este horario' : `${p.enUso} ${p.enUso === 1 ? 'persona lo tiene' : 'personas lo tienen'} como horario propio`}
              </CardDescription>
              {puedeEditar && (
                <CardAction>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditando(p)} aria-label={`Editar ${p.nombre}`}>
                    <Pencil />
                  </Button>
                </CardAction>
              )}
            </CardHeader>
          </Card>
        ))}
      </div>
      {editando && (
        <DialogoPlantilla
          key={editando === 'nueva' ? 'nueva' : editando.id}
          plantilla={editando === 'nueva' ? null : editando}
          abierto
          onAbiertoChange={(v) => !v && setEditando(null)}
        />
      )}
    </div>
  )
}

function Feriados() {
  const { anio: anioBuscado } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const anioActual = Number(diaEnLima().slice(0, 4))
  const anio = anioBuscado ?? anioActual
  const { data, isPending } = useQuery(feriadosQuery(anio))
  const puedeEditar = usePermiso('calendario.editar')
  const [editando, setEditando] = useState<FeriadoItem | 'nuevo' | null>(null)
  const cambiarAnio = (a: number) => void navigate({ search: (x) => ({ ...x, anio: a === anioActual ? undefined : a }), replace: true })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => cambiarAnio(anio - 1)} aria-label="Año anterior">
            <ChevronLeft />
          </Button>
          <span className="w-12 text-center font-medium tabular-nums">{anio}</span>
          <Button variant="outline" size="icon" onClick={() => cambiarAnio(anio + 1)} aria-label="Año siguiente">
            <ChevronRight />
          </Button>
        </div>
        {puedeEditar && (
          <Button variant="outline" onClick={() => setEditando('nuevo')}>
            <Plus />
            Agregar feriado
          </Button>
        )}
      </div>
      {isPending || !data ? (
        <Skeleton className="h-64" />
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay feriados cargados para {anio}.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Alcance</TableHead>
                {puedeEditar && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="tabular-nums">{formatearFecha(f.fecha)}</TableCell>
                  <TableCell>
                    {f.nombre}
                    {f.medioDia && (
                      <Badge variant="outline" className="ml-2">
                        Medio día
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{NOMBRE_ALCANCE_FERIADO[f.alcance]}</TableCell>
                  {puedeEditar && (
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditando(f)} aria-label={`Editar ${f.nombre}`}>
                        <Pencil />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {editando && (
        <DialogoFeriado
          key={editando === 'nuevo' ? 'nuevo' : editando.id}
          feriado={editando === 'nuevo' ? null : editando}
          anio={anio}
          abierto
          onAbiertoChange={(v) => !v && setEditando(null)}
        />
      )}
    </div>
  )
}
