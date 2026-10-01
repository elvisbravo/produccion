import { formatearSoles } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { tableroQuery } from '../api'
import { Cargando, Indicador, pct, tonoPorcentaje } from './comunes'

const mesCorto = new Intl.DateTimeFormat('es-PE', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const etiquetaMes = (mes: string) => mesCorto.format(new Date(`${mes}-15T12:00:00Z`))

const configPuntualidad = { porcentaje: { label: 'A tiempo', color: 'var(--chart-2)' } } satisfies ChartConfig
const configCobranza = { monto: { label: 'Saldo', color: 'var(--chart-1)' } } satisfies ChartConfig
const configOcupacion = { porcentaje: { label: 'Ocupación', color: 'var(--chart-3)' } } satisfies ChartConfig

export function ResumenTablero({ desde, hasta }: { desde: string; hasta: string }) {
  const { data } = useQuery(tableroQuery(desde, hasta))
  if (!data) return <Cargando />
  const puntualidad = data.puntualidadPorMes.map((m) => ({ mes: etiquetaMes(m.clave), porcentaje: m.porcentaje === null ? 0 : Math.round(m.porcentaje * 100), total: m.total }))
  const ocupacion = data.ocupacionPorPersona.map((o) => ({ nombre: o.nombre, porcentaje: o.porcentaje === null ? 0 : Math.round(o.porcentaje * 100) }))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Indicador etiqueta="Puntualidad" valor={pct(data.puntualidad)} detalle={`${data.entregables} entregables evaluados`} tono={tonoPorcentaje(data.puntualidad)} />
        <Indicador
          etiqueta="Retrabajo"
          valor={data.retrabajo.toLocaleString('es-PE', { maximumFractionDigits: 2 })}
          detalle="observaciones por entregable"
          tono={data.retrabajo <= 1 ? 'bien' : data.retrabajo <= 2 ? 'atencion' : 'mal'}
        />
        <Indicador etiqueta="Ocupación del equipo" valor={pct(data.ocupacion)} detalle="horas registradas sobre las disponibles" />
        <Indicador etiqueta="Cobrado en el periodo" valor={formatearSoles(data.cobrado)} />
        <Indicador
          etiqueta="Vencido por cobrar"
          valor={formatearSoles(data.vencido)}
          detalle={`de ${formatearSoles(data.porCobrar)} por cobrar`}
          tono={data.vencido > 0 ? 'mal' : 'bien'}
        />
        {data.margen !== null && (
          <Indicador
            etiqueta="Margen de los trabajos firmados"
            valor={formatearSoles(data.margen)}
            detalle={`${pct(data.margenPorcentaje)} de los ingresos`}
            tono={tonoPorcentaje(data.margenPorcentaje, 0.5, 0.25)}
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Puntualidad por mes</CardTitle>
            <CardDescription>% de entregables entregados hasta su fecha límite.</CardDescription>
          </CardHeader>
          <CardContent>
            {puntualidad.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin entregables con fecha límite en el periodo.</p>
            ) : (
              <ChartContainer config={configPuntualidad} className="h-56 w-full">
                <BarChart data={puntualidad}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="mes" tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v} %`} tickLine={false} axisLine={false} width={44} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v} % a tiempo`} />} />
                  <Bar dataKey="porcentaje" fill="var(--color-porcentaje)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saldo por antigüedad</CardTitle>
            <CardDescription>Cuotas por cobrar según los días de atraso.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={configCobranza} className="h-56 w-full">
              <BarChart data={data.antiguedad}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="tramo" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `S/ ${Number(v).toLocaleString('es-PE')}`} tickLine={false} axisLine={false} width={72} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatearSoles(Number(v))} />} />
                <Bar dataKey="monto" fill="var(--color-monto)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ocupación por persona</CardTitle>
            <CardDescription>Horas registradas (cronómetro o manual) sobre las disponibles según su horario.</CardDescription>
          </CardHeader>
          <CardContent>
            {ocupacion.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin personal de producción.</p>
            ) : (
              <ChartContainer config={configOcupacion} className="w-full" style={{ height: Math.max(160, ocupacion.length * 36) }}>
                <BarChart data={ocupacion} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" domain={[0, (max: number) => Math.max(100, max)]} tickFormatter={(v) => `${v} %`} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="nombre" tickLine={false} axisLine={false} width={90} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v} %`} />} />
                  <Bar dataKey="porcentaje" fill="var(--color-porcentaje)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
