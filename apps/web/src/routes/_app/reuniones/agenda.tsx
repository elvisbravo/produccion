import { diaEnLima, enlaceWhatsapp, ESTADOS_ACTIVOS, formatearCelular, NOMBRE_ESTADO_TAREA, NOMBRE_MODALIDAD, sumarDias, type ReunionFila } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { CalendarClock, CalendarRange, ChevronLeft, ChevronRight, ExternalLink, MessageCircle, Pencil, UserRoundPen, Video, XCircle } from 'lucide-react'
import { Fragment, useState } from 'react'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { reunionesQuery } from '@/features/tareas/api'
import { DialogoEnlaceReunion } from '@/features/tareas/components/dialogo-enlace'
import { DialogoEquipoReunion } from '@/features/tareas/components/dialogo-equipo-reunion'
import { DialogoCancelar, DialogoReprogramar } from '@/features/tareas/components/dialogos-simples'
import { asistentesQuery } from '@/features/trabajos/api'
import { duracion, formatearFecha, formatearHora, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { usePermiso } from '@/lib/permisos'

const ESTADOS = ['por_asignar', 'pendiente', 'completada', 'cancelada', 'no_asistio'] as const
const TODOS = 'todos'

export const Route = createFileRoute('/_app/reuniones/agenda')({
  validateSearch: z.object({
    dia: z.iso.date().optional().catch(undefined),
    vista: z.enum(['dia', 'semana']).optional().catch(undefined),
    estado: z.enum(ESTADOS).optional().catch(undefined),
    responsableId: z.uuid().optional().catch(undefined),
  }),
  beforeLoad: () => exigirPermiso('agenda_reuniones.ver'),
  component: AgendaReuniones,
})

/** Lunes y domingo de la semana de un día. */
function semanaDe(dia: string) {
  const dow = new Date(`${dia}T12:00:00Z`).getUTCDay()
  const lunes = sumarDias(dia, -((dow + 6) % 7))
  return { lunes, domingo: sumarDias(lunes, 6) }
}

const nombreDia = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const tituloDia = (dia: string) => {
  const t = nombreDia.format(new Date(`${dia}T12:00:00Z`))
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function AgendaReuniones() {
  const filtros = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const hoy = diaEnLima()
  const dia = filtros.dia ?? hoy
  const vista = filtros.vista ?? 'dia'
  const { desde, hasta } = vista === 'semana' ? { desde: semanaDe(dia).lunes, hasta: semanaDe(dia).domingo } : { desde: dia, hasta: dia }
  const { data, isPending } = useQuery(reunionesQuery({ desde, hasta, estado: filtros.estado, responsableId: filtros.responsableId }))
  const { data: asistentes = [] } = useQuery(asistentesQuery)

  // En la vista de semana salen los siete días (de lunes a domingo), con o sin reuniones; en la de día, solo ese día.
  const porDia = ((): [string, ReunionFila[]][] => {
    const grupos = new Map<string, ReunionFila[]>()
    for (const f of data ?? []) grupos.set(f.tarea.fecha, [...(grupos.get(f.tarea.fecha) ?? []), f])
    if (vista === 'semana') return Array.from({ length: 7 }, (_, i) => sumarDias(desde, i)).map((d) => [d, grupos.get(d) ?? []])
    return [...grupos.entries()]
  })()

  const ir = (cambio: Partial<{ dia: string | undefined; vista: 'dia' | 'semana' | undefined; estado: (typeof ESTADOS)[number] | undefined; responsableId: string | undefined }>) =>
    void navigate({ search: (s) => ({ ...s, ...cambio }), replace: true })
  const paso = vista === 'semana' ? 7 : 1

  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Agenda de reuniones</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Las reuniones por día, con los datos del cliente y de quienes participan. Desde aquí cambias la hora, pones el enlace de la videollamada o cancelas con un motivo.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label={vista === 'semana' ? 'Semana anterior' : 'Día anterior'} onClick={() => ir({ dia: sumarDias(dia, -paso) })}>
            <ChevronLeft />
          </Button>
          {vista === 'semana' ? (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium whitespace-nowrap">
              <CalendarRange className="size-4" />
              Semana del {formatearFecha(desde)} al {formatearFecha(hasta)}
            </span>
          ) : (
            <Input type="date" aria-label="Día" className="w-40" value={dia} onChange={(e) => e.target.value && ir({ dia: e.target.value })} />
          )}
          <Button variant="outline" size="icon" aria-label={vista === 'semana' ? 'Semana siguiente' : 'Día siguiente'} onClick={() => ir({ dia: sumarDias(dia, paso) })}>
            <ChevronRight />
          </Button>
          <Button variant="outline" onClick={() => ir({ dia: undefined })} disabled={dia === hoy}>
            Hoy
          </Button>
        </div>
        <ToggleGroup type="single" variant="outline" value={vista} onValueChange={(v) => v && ir({ vista: v === 'semana' ? 'semana' : undefined })}>
          <ToggleGroupItem value="dia">Día</ToggleGroupItem>
          <ToggleGroupItem value="semana">Semana</ToggleGroupItem>
        </ToggleGroup>
        <Select value={filtros.responsableId ?? TODOS} onValueChange={(v) => ir({ responsableId: v === TODOS ? undefined : v })}>
          <SelectTrigger aria-label="Asistente administrativa" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas las asistentes administrativas</SelectItem>
            {asistentes.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {nombreCompleto(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtros.estado ?? TODOS} onValueChange={(v) => ir({ estado: v === TODOS ? undefined : (v as (typeof ESTADOS)[number]) })}>
          <SelectTrigger aria-label="Estado" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los estados</SelectItem>
            {ESTADOS.map((e) => (
              <SelectItem key={e} value={e}>
                {NOMBRE_ESTADO_TAREA[e]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <Skeleton className="h-64" />
      ) : vista === 'dia' && porDia.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarRange />
            </EmptyMedia>
            <EmptyTitle>No hay reuniones este día</EmptyTitle>
            <EmptyDescription>Prueba con otro día o quita los filtros.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        porDia.map(([fecha, filas]) => (
          <section key={fecha} className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">
              {tituloDia(fecha)} <span className="text-sm font-normal text-muted-foreground">· {filas.length} {filas.length === 1 ? 'reunión' : 'reuniones'}</span>
            </h2>
            {filas.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">Sin reuniones este día.</p>
            ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table className="min-w-[96rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Reunión</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Celular</TableHead>
                    <TableHead>Nivel académico</TableHead>
                    <TableHead>Carrera</TableHead>
                    <TableHead>Universidad</TableHead>
                    <TableHead>Link de la reunión</TableHead>
                    <TableHead>Jefe de producción</TableHead>
                    <TableHead>Auxiliar de apoyo</TableHead>
                    <TableHead>Asistente administrativa</TableHead>
                    <TableHead>Condición</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((f) => (
                    <Fila key={f.tarea.id} fila={f} />
                  ))}
                </TableBody>
              </Table>
            </div>
            )}
          </section>
        ))
      )}
    </div>
  )
}

const SIN = <span className="text-muted-foreground">—</span>

function Fila({ fila: f }: { fila: ReunionFila }) {
  const t = f.tarea
  const puedeEditar = usePermiso('tareas.editar')
  const puedeAsignar = usePermiso('tareas.asignar')
  const activa = ESTADOS_ACTIVOS.includes(t.estado)
  const [dialogo, setDialogo] = useState<'hora' | 'enlace' | 'cancelar' | 'equipo' | null>(null)
  const nombre = nombreCompleto(f.cliente)

  return (
    <Fragment>
      <TableRow className={activa ? undefined : 'text-muted-foreground'}>
        <TableCell className="whitespace-nowrap">{formatearFecha(t.fecha)}</TableCell>
        <TableCell className="whitespace-nowrap">
          <div className="flex items-center gap-1">
            <span className="font-medium">{t.inicio ? formatearHora(t.inicio) : '—'}</span>
            <span className="text-xs text-muted-foreground">· {duracion(t.minutosEstimados)}</span>
            {puedeEditar && activa && (
              <Button variant="ghost" size="icon-xs" aria-label="Cambiar la hora" onClick={() => setDialogo('hora')}>
                <CalendarClock />
              </Button>
            )}
          </div>
          {t.vecesReprogramada > 0 && <Badge variant="outline">Movida {t.vecesReprogramada} {t.vecesReprogramada === 1 ? 'vez' : 'veces'}</Badge>}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.actividad.color }} aria-hidden="true" />
            <span className="font-medium">{t.actividad.nombre}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {t.modalidad && NOMBRE_MODALIDAD[t.modalidad]}
            {t.estado !== 'pendiente' && <Badge variant={t.estado === 'cancelada' || t.estado === 'no_asistio' ? 'destructive' : 'secondary'}>{NOMBRE_ESTADO_TAREA[t.estado]}</Badge>}
          </div>
        </TableCell>
        <TableCell className="min-w-44">
          {t.prospecto ? (
            <Link to="/prospectos/$id" params={{ id: t.prospecto.id }} className="font-medium hover:underline">
              {nombre ?? 'Sin nombre'}
            </Link>
          ) : t.trabajo ? (
            <Link to="/trabajos/$id" params={{ id: t.trabajo.id }} className="font-medium hover:underline">
              {nombre ?? t.trabajo.codigo}
            </Link>
          ) : (
            (nombre ?? SIN)
          )}
          {(t.prospecto ?? t.trabajo) && <div className="font-mono text-xs text-muted-foreground">{t.prospecto?.codigo ?? t.trabajo?.codigo}</div>}
        </TableCell>
        <TableCell className="whitespace-nowrap">
          {f.cliente ? (
            <span className="inline-flex items-center gap-1">
              <span className="font-mono text-xs">{formatearCelular(f.cliente.celular)}</span>
              <Button variant="ghost" size="icon-xs" asChild>
                <a href={enlaceWhatsapp(f.cliente.celular)} target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp del cliente">
                  <MessageCircle />
                </a>
              </Button>
            </span>
          ) : (
            SIN
          )}
        </TableCell>
        <TableCell>{f.nivelAcademico ?? SIN}</TableCell>
        <TableCell className="min-w-40">{f.carrera ?? SIN}</TableCell>
        <TableCell className="min-w-40">{f.universidad ?? SIN}</TableCell>
        <TableCell className="whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            {f.enlace ? (
              <Button variant="link" size="sm" className="h-auto p-0" asChild>
                <a href={f.enlace} target="_blank" rel="noreferrer">
                  <Video />
                  Abrir <ExternalLink className="size-3" />
                </a>
              </Button>
            ) : (
              SIN
            )}
            {puedeEditar && (
              <Button variant="ghost" size="icon-xs" aria-label={f.enlace ? 'Cambiar el enlace' : 'Poner el enlace'} onClick={() => setDialogo('enlace')}>
                <Pencil />
              </Button>
            )}
          </span>
        </TableCell>
        <TableCell className="whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            {nombreCompleto(f.jefe) ?? SIN}
            {puedeAsignar && activa && (
              <Button variant="ghost" size="icon-xs" aria-label="Elegir el jefe de producción y el auxiliar de apoyo" onClick={() => setDialogo('equipo')}>
                <UserRoundPen />
              </Button>
            )}
          </span>
        </TableCell>
        <TableCell className="whitespace-nowrap">{nombreCompleto(f.auxiliar) ?? SIN}</TableCell>
        <TableCell>{nombreCompleto(f.asistente) ?? SIN}</TableCell>
        <TableCell>
          <Badge variant={f.condicion === 'cliente' ? 'default' : 'secondary'}>{f.condicion === 'cliente' ? 'Cliente' : 'Potencial cliente'}</Badge>
        </TableCell>
        <TableCell className="min-w-48 whitespace-normal">{f.motivo ?? SIN}</TableCell>
        <TableCell className="text-right">
          {puedeEditar && activa && (
            <Button variant="ghost" size="sm" onClick={() => setDialogo('cancelar')}>
              <XCircle />
              Cancelar
            </Button>
          )}
        </TableCell>
      </TableRow>
      {dialogo === 'hora' && <DialogoReprogramar tarea={t} abierto onAbiertoChange={(v) => !v && setDialogo(null)} />}
      {dialogo === 'cancelar' && <DialogoCancelar tarea={t} abierto onAbiertoChange={(v) => !v && setDialogo(null)} />}
      {dialogo === 'equipo' && <DialogoEquipoReunion tareaId={t.id} actividad={t.actividad.nombre} jefeId={f.jefe?.id ?? null} auxiliarId={f.auxiliar?.id ?? null} onCerrar={() => setDialogo(null)} />}
      {dialogo === 'enlace' && <DialogoEnlaceReunion tareaId={t.id} enlace={f.enlace} onCerrar={() => setDialogo(null)} />}
    </Fragment>
  )
}
