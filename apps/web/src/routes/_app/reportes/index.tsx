import { diaEnLima, sumarDias, type FilaComparacion } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Timer } from 'lucide-react'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { reporteTiemposQuery } from '@/features/tiempo/api'
import { duracion, formatearFecha, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/reportes/')({
  validateSearch: z.object({ desde: z.iso.date().optional().catch(undefined), hasta: z.iso.date().optional().catch(undefined) }),
  beforeLoad: () => exigirPermiso('reportes.ver'),
  component: Reportes,
})

/** "+25 %" en ámbar o rojo si se pasa de lo estimado; verde si se hizo en menos. */
function Desviacion({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-muted-foreground">—</span>
  const pct = Math.round(valor * 100)
  return (
    <Badge
      variant="outline"
      className={cn(
        pct > 25
          ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
          : pct > 10
            ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
            : pct < -10
              ? 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
              : '',
      )}
    >
      {pct > 0 ? '+' : ''}
      {pct} %
    </Badge>
  )
}

function Totales({ f }: { f: FilaComparacion }) {
  const datos = [
    ['Tareas completadas', String(f.tareas)],
    ['Horas estimadas', duracion(f.minutosEstimados)],
    ['Horas reales', duracion(f.minutosReales)],
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {datos.map(([etiqueta, valor]) => (
        <div key={etiqueta} className="flex flex-col rounded-xl border bg-card px-4 py-3">
          <span className="text-xs text-muted-foreground">{etiqueta}</span>
          <span className="text-2xl font-semibold tabular-nums">{valor}</span>
        </div>
      ))}
      <div className="flex flex-col rounded-xl border bg-card px-4 py-3">
        <span className="text-xs text-muted-foreground">Diferencia</span>
        <span className="pt-1">
          <Desviacion valor={f.desviacion} />
        </span>
      </div>
    </div>
  )
}

function Reportes() {
  const { desde: d, hasta: h } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const hasta = h ?? diaEnLima()
  const desde = d ?? sumarDias(hasta, -29)
  const { data, isPending } = useQuery(reporteTiemposQuery(desde, hasta))

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tiempos: estimado frente a real</h1>
        <p className="text-sm text-muted-foreground">
          Tareas completadas en el periodo con tiempo registrado (cronómetro o manual). Sirve para ajustar los tiempos del catálogo y de las plantillas.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-40">
          <FieldLabel htmlFor="rep-desde">Desde</FieldLabel>
          <Input id="rep-desde" type="date" value={desde} max={hasta} onChange={(ev) => ev.target.value && void navigate({ search: (x) => ({ ...x, desde: ev.target.value }), replace: true })} />
        </Field>
        <Field className="w-40">
          <FieldLabel htmlFor="rep-hasta">Hasta</FieldLabel>
          <Input id="rep-hasta" type="date" value={hasta} min={desde} onChange={(ev) => ev.target.value && void navigate({ search: (x) => ({ ...x, hasta: ev.target.value }), replace: true })} />
        </Field>
      </div>

      {isPending || !data ? (
        <Skeleton className="h-96" />
      ) : data.total.tareas === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Timer />
            </EmptyMedia>
            <EmptyTitle>Sin datos en este periodo</EmptyTitle>
            <EmptyDescription>Aparecerán cuando se completen tareas con el cronómetro o con tiempo registrado a mano.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Totales f={data.total} />

          <Card>
            <CardHeader>
              <CardTitle>Por actividad</CardTitle>
              <CardDescription>Si la mediana real se aleja del tiempo del catálogo, conviene ajustarlo.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Actividad</TableHead>
                    <TableHead className="text-right">Tareas</TableHead>
                    <TableHead className="text-right">Estimado</TableHead>
                    <TableHead className="text-right">Real</TableHead>
                    <TableHead>Diferencia</TableHead>
                    <TableHead className="text-right">Catálogo → mediana real</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.porActividad.map((a) => (
                    <TableRow key={a.actividad.id}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span className="size-2 rounded-full" style={{ backgroundColor: a.actividad.color }} aria-hidden="true" />
                          {a.actividad.nombre}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{a.tareas}</TableCell>
                      <TableCell className="text-right tabular-nums">{duracion(a.minutosEstimados)}</TableCell>
                      <TableCell className="text-right tabular-nums">{duracion(a.minutosReales)}</TableCell>
                      <TableCell>
                        <Desviacion valor={a.desviacion} />
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                        {duracion(a.estimadoCatalogo)} → <span className="font-medium text-foreground">{duracion(a.medianaReal)}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Por persona</CardTitle>
              <CardDescription>"Manual" es el tiempo ingresado a mano (sin cronómetro).</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead className="text-right">Tareas</TableHead>
                    <TableHead className="text-right">Estimado</TableHead>
                    <TableHead className="text-right">Real</TableHead>
                    <TableHead>Diferencia</TableHead>
                    <TableHead className="text-right">Manual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.porPersona.map((p) => (
                    <TableRow key={p.usuario.id}>
                      <TableCell className="font-medium">{nombreCompleto(p.usuario)}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.tareas}</TableCell>
                      <TableCell className="text-right tabular-nums">{duracion(p.minutosEstimados)}</TableCell>
                      <TableCell className="text-right tabular-nums">{duracion(p.minutosReales)}</TableCell>
                      <TableCell>
                        <Desviacion valor={p.desviacion} />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">{p.minutosManuales ? duracion(p.minutosManuales) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mayores diferencias</CardTitle>
              <CardDescription>Las tareas que más se alejaron de lo estimado, para revisar por qué.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y rounded-lg border">
                {data.mayoresDesvios.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{t.titulo}</span>
                      <span className="text-muted-foreground">
                        {' · '}
                        {t.referencia?.tipo === 'trabajo' ? (
                          <Link to="/trabajos/$id" params={{ id: t.referencia.id }} className="font-mono hover:underline">
                            {t.referencia.codigo}
                          </Link>
                        ) : t.referencia ? (
                          <Link to="/prospectos/$id" params={{ id: t.referencia.id }} className="font-mono hover:underline">
                            {t.referencia.codigo}
                          </Link>
                        ) : null}
                        {` · ${t.responsables.join(', ')} · ${formatearFecha(t.completadaEn)}`}
                      </span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {duracion(t.minutosEstimados)} → {duracion(t.minutosReales)}
                    </span>
                    <Desviacion valor={t.desviacion} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
