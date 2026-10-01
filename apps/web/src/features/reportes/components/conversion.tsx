import { formatearSoles, type FilaConversion, type ReporteConversion } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { Filter, Info } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { conversionQuery } from '../api'
import { Barra, Cargando, Indicador, pct, SinDatos } from './comunes'

const mesLargo = new Intl.DateTimeFormat('es-PE', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const etiquetaMes = (mes: string) => mesLargo.format(new Date(`${mes}-15T12:00:00Z`))
const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-PE')} ${n === 1 ? uno : varios}`

/** Tono de la tasa de conversión: referencia de 30 % (bien) y 15 % (atención). */
const tonoTasa = (v: number | null) => (v === null ? undefined : v >= 0.3 ? 'bien' : v >= 0.15 ? 'atencion' : 'mal')

const configMes = {
  convertidos: { label: 'Convertidos', color: 'var(--color-green-600)' },
  abiertos: { label: 'Abiertos', color: 'var(--color-sky-500)' },
  perdidos: { label: 'Perdidos', color: 'var(--color-zinc-400)' },
} satisfies ChartConfig

function Embudo({ etapas }: { etapas: ReporteConversion['embudo'] }) {
  const avance = etapas.filter((e) => e.clase !== 'perdida')
  const perdidas = etapas.filter((e) => e.clase === 'perdida')
  const base = avance[0]?.alcanzaron || 1
  return (
    <div className="flex flex-col gap-1.5">
      {avance.map((e, i) => {
        const siguiente = avance[i + 1]
        return (
          <div key={e.id} className="flex flex-col gap-1.5">
            <div className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
              <span className="truncate">{e.nombre}</span>
              <span className="h-6 overflow-hidden rounded-md bg-muted">
                <span className="block h-full rounded-md" style={{ width: `${(e.alcanzaron / base) * 100}%`, backgroundColor: e.color }} />
              </span>
              <span className="w-28 text-right tabular-nums">
                {e.alcanzaron.toLocaleString('es-PE')} <span className="text-xs text-muted-foreground">({pct(e.alcanzaron / base)})</span>
              </span>
            </div>
            {siguiente && e.alcanzaron > 0 && (
              <span className="grid grid-cols-[minmax(0,9rem)_1fr] gap-3 text-xs text-muted-foreground">
                <span />
                <span>
                  ↓ pasa el {pct(siguiente.alcanzaron / e.alcanzaron)}
                  {e.actuales > 0 && ` · ${plural(e.actuales, 'sigue aquí', 'siguen aquí')}`}
                </span>
              </span>
            )}
          </div>
        )
      })}
      {perdidas.map((e) => (
        <p key={e.id} className="mt-2 border-t pt-2 text-sm text-muted-foreground">
          {e.nombre}: <span className="font-medium text-foreground tabular-nums">{e.actuales.toLocaleString('es-PE')}</span> ({pct(e.actuales / base)} de los prospectos)
        </p>
      ))}
    </div>
  )
}

function TablaConversion({ titulo, descripcion, filas, columna }: { titulo: string; descripcion?: string; filas: FilaConversion[]; columna: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        {descripcion && <CardDescription>{descripcion}</CardDescription>}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{columna}</TableHead>
              <TableHead className="text-right">Prospectos</TableHead>
              <TableHead className="text-right">Convertidos</TableHead>
              <TableHead className="text-right">Perdidos</TableHead>
              <TableHead className="text-right">Abiertos</TableHead>
              <TableHead>Conversión</TableHead>
              <TableHead className="text-right">Vendido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => (
              <TableRow key={f.clave}>
                <TableCell className="font-medium">{f.nombre}</TableCell>
                <TableCell className="text-right tabular-nums">{f.prospectos}</TableCell>
                <TableCell className="text-right tabular-nums">{f.convertidos}</TableCell>
                <TableCell className="text-right tabular-nums">{f.perdidos}</TableCell>
                <TableCell className="text-right tabular-nums">{f.abiertos}</TableCell>
                <TableCell>
                  <Barra valor={f.tasa} tono={tonoTasa(f.tasa)} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatearSoles(f.monto)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function ReporteConversionVista({ desde, hasta }: { desde: string; hasta: string }) {
  const { data } = useQuery(conversionQuery(desde, hasta))
  if (!data) return <Cargando />
  const t = data.total
  if (t.prospectos === 0) return <SinDatos icono={<Filter />} titulo="Sin prospectos registrados en el periodo" descripcion="La conversión se mide sobre los prospectos registrados en el periodo elegido." />
  const porMes = data.porMes.map((m) => ({ ...m, mes: etiquetaMes(m.clave) }))

  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <Info />
        <AlertDescription>
          Se toman los prospectos registrados en el periodo y se ve en qué terminaron hasta hoy: convertidos en cliente, perdidos o aún abiertos. Los periodos recientes
          tienen más prospectos abiertos porque aún están en seguimiento.
        </AlertDescription>
      </Alert>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Indicador etiqueta="Prospectos" valor={t.prospectos.toLocaleString('es-PE')} detalle={plural(t.abiertos, 'abierto', 'abiertos')} />
        <Indicador etiqueta="Conversión" valor={pct(t.tasa, 1)} detalle={plural(t.convertidos, 'convertido', 'convertidos')} tono={tonoTasa(t.tasa)} />
        <Indicador etiqueta="Perdidos" valor={pct(t.prospectos ? t.perdidos / t.prospectos : null, 1)} detalle={plural(t.perdidos, 'prospecto', 'prospectos')} />
        <Indicador etiqueta="Vendido" valor={formatearSoles(t.monto)} detalle={t.ticketPromedio === null ? 'sin ventas' : `${formatearSoles(t.ticketPromedio)} por cliente`} />
        <Indicador
          etiqueta="Tiempo de cierre"
          valor={t.diasPromedio === null ? '—' : plural(t.diasPromedio, 'día', 'días')}
          detalle="del registro a la conversión"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Embudo por etapa</CardTitle>
            <CardDescription>Prospectos que llegaron a cada etapa (o a una posterior) y cuántos pasan a la siguiente.</CardDescription>
          </CardHeader>
          <CardContent>
            <Embudo etapas={data.embudo} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Motivos de pérdida</CardTitle>
          </CardHeader>
          <CardContent>
            {data.motivosPerdida.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ningún prospecto del periodo se ha perdido.</p>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {data.motivosPerdida.map((m) => (
                  <li key={m.nombre} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span>{m.nombre}</span>
                    <span className="tabular-nums">
                      {m.cantidad} <span className="text-xs text-muted-foreground">({pct(m.cantidad / t.perdidos)})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <TablaConversion titulo="Por asistente administrativo" descripcion="Según quién captó al prospecto." filas={data.porAsistente} columna="Asistente" />
      <div className="grid gap-6 xl:grid-cols-2">
        <TablaConversion titulo="Por origen" filas={data.porOrigen} columna="Origen" />
        <TablaConversion titulo="Por tipo de trabajo" filas={data.porTipo} columna="Tipo" />
      </div>

      {porMes.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Por mes de registro</CardTitle>
            <CardDescription>En qué terminaron los prospectos registrados cada mes.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={configMes} className="h-64 w-full">
              <BarChart data={porMes}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="convertidos" stackId="a" fill="var(--color-convertidos)" />
                <Bar dataKey="abiertos" stackId="a" fill="var(--color-abiertos)" />
                <Bar dataKey="perdidos" stackId="a" fill="var(--color-perdidos)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
