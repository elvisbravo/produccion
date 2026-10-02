import { type PanelInicio, type TonoIndicador } from '@grupoes/shared'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, CalendarOff, CircleCheck, Clock, History } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { duracion, haceCuanto } from '@/lib/formato'
import { cn } from '@/lib/utils'

/** Enlace interno que navega sin recargar (admite rutas con filtros, como /trabajos?seguimiento=urgente). */
function Enlace({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  const navigate = useNavigate()
  const ir = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return
    e.preventDefault()
    void navigate({ href: to })
  }
  return (
    <a href={to} onClick={ir} className={cn('rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50', className)}>
      {children}
    </a>
  )
}

const TONO: Record<TonoIndicador, string> = {
  normal: '',
  ok: 'text-green-700 dark:text-green-400',
  alerta: 'text-red-700 dark:text-red-400',
}

export function Pendientes({ panel }: { panel: PanelInicio }) {
  if (panel.pendientes.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
          <CircleCheck className="size-5 text-green-600" />
          No tienes nada pendiente por ahora.
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Requiere tu acción</CardTitle>
        <CardDescription>Lo que está esperando que lo atiendas.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2">
          {panel.pendientes.map((p) => (
            <li key={p.clave}>
              <Enlace to={p.enlace} className="group flex items-center gap-3 border bg-background px-3 py-2.5 hover:bg-accent/60">
                <Badge className="min-w-8 justify-center tabular-nums">{p.cantidad}</Badge>
                <span className="flex-1 text-sm">{p.titulo}</span>
                <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Enlace>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export function Indicadores({ panel }: { panel: PanelInicio }) {
  if (panel.indicadores.length === 0) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {panel.indicadores.map((i) => {
        const cuerpo = (
          <div className="flex h-full flex-col gap-0.5 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-accent/40">
            <span className="text-xs text-muted-foreground">{i.titulo}</span>
            <span className={cn('text-2xl font-semibold tabular-nums', TONO[i.tono])}>{i.valor}</span>
            {i.detalle && <span className="text-xs text-muted-foreground">{i.detalle}</span>}
          </div>
        )
        return i.enlace ? (
          <Enlace key={i.clave} to={i.enlace} className="rounded-xl">
            {cuerpo}
          </Enlace>
        ) : (
          <div key={i.clave}>{cuerpo}</div>
        )
      })}
    </div>
  )
}

export function MiCola({ panel }: { panel: PanelInicio }) {
  const c = panel.miCola
  if (!c) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-4" />
          Mi cola
        </CardTitle>
        <CardDescription>
          {c.total === 0
            ? 'No tienes tareas pendientes.'
            : `${c.total} ${c.total === 1 ? 'tarea' : 'tareas'} · ${c.deHoy} para hoy o atrasadas · ${duracion(c.minutos)} estimadas`}
        </CardDescription>
      </CardHeader>
      {c.siguiente && (
        <CardContent>
          <Enlace to={c.siguiente.enlace} className="group flex items-center gap-3 border bg-background px-3 py-2.5 hover:bg-accent/60">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Sigue</p>
              <p className="truncate text-sm font-medium">{c.siguiente.titulo}</p>
              <p className="truncate text-xs text-muted-foreground">
                {c.siguiente.actividad}
                {c.siguiente.trabajo ? ` · ${c.siguiente.trabajo}` : ''}
              </p>
            </div>
            <ArrowRight className="size-4 text-muted-foreground" />
          </Enlace>
        </CardContent>
      )}
    </Card>
  )
}

const mesCorto = new Intl.DateTimeFormat('es-PE', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const etiquetaMes = (mes: string) => mesCorto.format(new Date(`${mes}-15T12:00:00Z`))

const configOcupacion = { porcentaje: { label: 'Ocupación', color: 'var(--color-sky-600)' } } satisfies ChartConfig
const configPuntualidad = { porcentaje: { label: 'A tiempo', color: 'var(--color-green-600)' } } satisfies ChartConfig
const configCobranza = { monto: { label: 'Saldo', color: 'var(--color-red-500)' } } satisfies ChartConfig
const configEmbudo = { cantidad: { label: 'Prospectos', color: 'var(--color-violet-500)' } } satisfies ChartConfig
const COLOR_TRAMO = ['var(--color-zinc-400)', 'var(--color-amber-500)', 'var(--color-red-400)', 'var(--color-red-500)', 'var(--color-red-700)']

function Grafico({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function Graficos({ panel }: { panel: PanelInicio }) {
  const g = panel.graficos
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {g.ocupacion && g.ocupacion.length > 0 && (
        <Grafico titulo="Ocupación del equipo" descripcion="Horas registradas sobre las disponibles, últimos 7 días">
          <ChartContainer config={configOcupacion} className="h-56 w-full">
            <BarChart data={g.ocupacion} margin={{ left: -16 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="nombre" tickLine={false} axisLine={false} interval={0} />
              <YAxis tickLine={false} axisLine={false} unit=" %" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="porcentaje" radius={4}>
                {g.ocupacion.map((o) => (
                  <Cell key={o.nombre} fill={o.porcentaje > 100 ? 'var(--color-red-500)' : 'var(--color-sky-600)'} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </Grafico>
      )}
      {g.embudo && g.embudo.length > 0 && (
        <Grafico titulo="Prospectos por etapa" descripcion="Los que siguen abiertos">
          <ChartContainer config={configEmbudo} className="h-56 w-full">
            <BarChart data={g.embudo} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="nombre" tickLine={false} axisLine={false} width={96} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="cantidad" radius={4}>
                {g.embudo.map((e) => (
                  <Cell key={e.nombre} fill={e.color.startsWith('#') || e.color.startsWith('var') ? e.color : 'var(--color-violet-500)'} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </Grafico>
      )}
      {g.cobranza && g.cobranza.some((c) => c.monto > 0) && (
        <Grafico titulo="Cobranza por antigüedad" descripcion="Saldo por cobrar según los días de atraso">
          <ChartContainer config={configCobranza} className="h-56 w-full">
            <BarChart data={g.cobranza} margin={{ left: -8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="tramo" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="monto" radius={4}>
                {g.cobranza.map((c, i) => (
                  <Cell key={c.tramo} fill={COLOR_TRAMO[i]} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </Grafico>
      )}
      {g.puntualidad && g.puntualidad.length > 0 && (
        <Grafico titulo="Puntualidad por mes" descripcion="Entregables entregados dentro de su fecha límite">
          <ChartContainer config={configPuntualidad} className="h-56 w-full">
            <BarChart data={g.puntualidad.map((m) => ({ ...m, mes: etiquetaMes(m.mes) }))} margin={{ left: -16 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} domain={[0, 100]} unit=" %" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="porcentaje" fill="var(--color-green-600)" radius={4} />
            </BarChart>
          </ChartContainer>
        </Grafico>
      )}
    </div>
  )
}

export function AusenciasHoy({ panel }: { panel: PanelInicio }) {
  if (!panel.ausenciasHoy) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarOff className="size-4" />
          Ausentes hoy
        </CardTitle>
      </CardHeader>
      <CardContent>
        {panel.ausenciasHoy.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nadie falta hoy.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {panel.ausenciasHoy.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span>{a.nombre}</span>
                <Badge variant="outline">{a.tipo}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function ActividadReciente({ panel }: { panel: PanelInicio }) {
  if (!panel.actividad) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" />
          Actividad reciente
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1.5 text-sm">
          {panel.actividad.map((a) => (
            <li key={a.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">
                <span className="font-medium">{a.usuario ?? 'Sistema'}</span> <span className="text-muted-foreground">{a.accion} · {a.entidad}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{haceCuanto(a.fecha)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
