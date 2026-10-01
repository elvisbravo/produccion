import { formatearSoles, NOMBRE_ESTADO_TRABAJO, type EstadoTrabajo, type FilaRentabilidad } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Lock, TrendingUp, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { rentabilidadQuery } from '../api'
import { Cargando, Indicador, pct, SinDatos, tonoPorcentaje } from './comunes'

const Margen = ({ f }: { f: FilaRentabilidad }) => (
  <span className={cn('font-medium tabular-nums', f.margen < 0 && 'text-red-700 dark:text-red-400')}>
    {formatearSoles(f.margen)} <span className="text-xs font-normal text-muted-foreground">({pct(f.margenPorcentaje)})</span>
  </span>
)

function Agrupado({ titulo, filas }: { titulo: string; filas: (FilaRentabilidad & { nombre: string; trabajos: number })[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border text-sm">
          {filas.map((f) => (
            <li key={f.nombre} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>
                {f.nombre} <span className="text-xs text-muted-foreground">· {f.trabajos} {f.trabajos === 1 ? 'trabajo' : 'trabajos'}</span>
              </span>
              <Margen f={f} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export function ReporteRentabilidadVista({ desde, hasta }: { desde: string; hasta: string }) {
  const { data } = useQuery(rentabilidadQuery(desde, hasta))
  if (!data) return <Cargando />
  if (data.trabajos.length === 0) return <SinDatos icono={<TrendingUp />} titulo="Sin contratos firmados en el periodo" descripcion="La rentabilidad se calcula para los trabajos cuyo contrato se firmó en el periodo." />
  const horasSinCosto = data.trabajos.reduce((s, t) => s + t.horasSinCosto, 0)
  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <Lock />
        <AlertDescription>
          Información confidencial. Margen = monto del contrato − horas registradas × costo por hora de cada persona − horas extra (a su costo por hora más el recargo de Parámetros) − bonos. Los trabajos en
          curso aún acumulan horas.
        </AlertDescription>
      </Alert>
      {horasSinCosto > 0 && (
        <Alert>
          <TriangleAlert />
          <AlertDescription>
            Hay {horasSinCosto.toLocaleString('es-PE')} h registradas por personas sin costo por hora vigente: no suman costo. Asígnalo en Usuarios → Datos.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador etiqueta="Ingresos (contratos)" valor={formatearSoles(data.total.ingresos)} />
        <Indicador etiqueta="Costo del personal" valor={formatearSoles(data.total.costoPersonal)} detalle={`${data.total.horas.toLocaleString('es-PE')} h registradas`} />
        <Indicador etiqueta="Horas extra y bonos" valor={formatearSoles(data.total.costoExtras + data.total.bonos)} />
        <Indicador etiqueta="Margen" valor={formatearSoles(data.total.margen)} detalle={pct(data.total.margenPorcentaje)} tono={tonoPorcentaje(data.total.margenPorcentaje, 0.5, 0.25)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Agrupado titulo="Por tipo de trabajo" filas={data.porTipo} />
        <Agrupado titulo="Por nivel" filas={data.porNivel} />
        <Agrupado titulo="Por universidad" filas={data.porUniversidad} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Por trabajo</CardTitle>
          <CardDescription>Del menor al mayor margen.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trabajo</TableHead>
                <TableHead className="text-right">Ingresos</TableHead>
                <TableHead className="text-right">Personal</TableHead>
                <TableHead className="text-right">Extras y bonos</TableHead>
                <TableHead className="text-right">Horas</TableHead>
                <TableHead className="text-right">Margen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.trabajos.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link to="/trabajos/$id" params={{ id: t.id }} className="flex flex-col hover:underline">
                      <span className="font-mono text-xs font-medium">{t.codigo}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.tipoTrabajo} · {NOMBRE_ESTADO_TRABAJO[t.estado as EstadoTrabajo] ?? t.estado}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatearSoles(t.ingresos)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatearSoles(t.costoPersonal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatearSoles(t.costoExtras + t.bonos)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {t.horas.toLocaleString('es-PE')}
                    {t.horasSinCosto > 0 && <span className="text-xs text-amber-700 dark:text-amber-400"> ({t.horasSinCosto} sin costo)</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Margen f={t} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
