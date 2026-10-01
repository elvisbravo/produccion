import { formatearSoles, NOMBRE_METODO_PAGO, type FilaPuntualidad, type FilaRetrabajo, type MetodoPago } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ClipboardCheck, PackageCheck, Users, Wallet } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { duracion, formatearFecha, nombreCompleto } from '@/lib/formato'
import { cobranzaReporteQuery, ocupacionQuery, puntualidadQuery, retrabajoQuery } from '../api'
import { Barra, Cargando, Indicador, pct, SinDatos, tonoPorcentaje } from './comunes'

interface Props {
  desde: string
  hasta: string
}

function TablaPuntualidad({ titulo, filas }: { titulo: string; filas: FilaPuntualidad[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{titulo.replace('Por ', '').replace(/^\w/, (c) => c.toUpperCase())}</TableHead>
              <TableHead className="text-right">Entregables</TableHead>
              <TableHead className="text-right">A tiempo</TableHead>
              <TableHead>Puntualidad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => (
              <TableRow key={f.clave}>
                <TableCell className="font-medium">{f.nombre}</TableCell>
                <TableCell className="text-right tabular-nums">{f.total}</TableCell>
                <TableCell className="text-right tabular-nums">{f.aTiempo}</TableCell>
                <TableCell>
                  <Barra valor={f.porcentaje} tono={tonoPorcentaje(f.porcentaje)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function ReportePuntualidadVista({ desde, hasta }: Props) {
  const { data } = useQuery(puntualidadQuery(desde, hasta))
  if (!data) return <Cargando />
  if (data.total.total === 0) {
    return <SinDatos icono={<PackageCheck />} titulo="Sin entregables para evaluar" descripcion="Se evalúan los que vencen en el periodo y ya se entregaron o ya vencieron." />
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador etiqueta="Puntualidad" valor={pct(data.total.porcentaje)} tono={tonoPorcentaje(data.total.porcentaje)} />
        <Indicador etiqueta="Entregados a tiempo" valor={data.total.aTiempo} detalle={`de ${data.total.total} evaluados`} />
        <Indicador etiqueta="Tarde o vencidos" valor={data.total.total - data.total.aTiempo} tono={data.total.total - data.total.aTiempo > 0 ? 'atencion' : 'bien'} />
      </div>
      <p className="text-sm text-muted-foreground">
        A tiempo = la primera entrega al cliente fue hasta la fecha límite. Los que aún no vencen y no se entregaron no cuentan todavía.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <TablaPuntualidad titulo="Por auxiliar" filas={data.porAuxiliar} />
        <TablaPuntualidad titulo="Por tipo de trabajo" filas={data.porTipo} />
      </div>
      {data.atrasados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Atrasados</CardTitle>
            <CardDescription>Entregados después de su fecha o vencidos sin entregar.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border text-sm">
              {data.atrasados.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{a.nombre}</span>{' '}
                    <Link to="/trabajos/$id" params={{ id: a.trabajo.id }} className="font-mono text-xs text-muted-foreground hover:underline">
                      {a.trabajo.codigo}
                    </Link>
                    <span className="text-muted-foreground"> · {nombreCompleto(a.auxiliar) ?? 'Sin auxiliar'}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Vencía el {formatearFecha(a.fechaLimite)} · {a.entregadoEl ? `entregado el ${formatearFecha(a.entregadoEl)}` : 'sin entregar'}
                  </span>
                  <span className="text-xs font-medium text-red-700 dark:text-red-400">
                    {a.diasAtraso} {a.diasAtraso === 1 ? 'día' : 'días'}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function TablaRetrabajo({ titulo, filas }: { titulo: string; filas: FilaRetrabajo[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead className="text-right">Entregables</TableHead>
              <TableHead className="text-right">Internas</TableHead>
              <TableHead className="text-right">Del cliente</TableHead>
              <TableHead className="text-right">Por entregable</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => (
              <TableRow key={f.clave}>
                <TableCell className="font-medium">{f.nombre}</TableCell>
                <TableCell className="text-right tabular-nums">{f.entregables}</TableCell>
                <TableCell className="text-right tabular-nums">{f.observacionesInternas}</TableCell>
                <TableCell className="text-right tabular-nums">{f.observacionesCliente}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{f.promedio.toLocaleString('es-PE')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function ReporteRetrabajoVista({ desde, hasta }: Props) {
  const { data } = useQuery(retrabajoQuery(desde, hasta))
  if (!data) return <Cargando />
  if (data.total.entregables === 0) {
    return <SinDatos icono={<ClipboardCheck />} titulo="Sin revisiones ni entregas en el periodo" descripcion="El retrabajo se mide con las observaciones de la revisión interna y del cliente." />
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador etiqueta="Observaciones por entregable" valor={data.total.promedio.toLocaleString('es-PE')} tono={data.total.promedio <= 1 ? 'bien' : data.total.promedio <= 2 ? 'atencion' : 'mal'} />
        <Indicador etiqueta="Observaciones internas" valor={data.total.observacionesInternas} detalle="en la revisión del jefe" />
        <Indicador etiqueta="Observaciones del cliente" valor={data.total.observacionesCliente} detalle="después de la entrega" tono={data.total.observacionesCliente > 0 ? 'atencion' : 'bien'} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <TablaRetrabajo titulo="Por auxiliar" filas={data.porAuxiliar} />
        <TablaRetrabajo titulo="Por tipo de trabajo" filas={data.porTipo} />
      </div>
      {data.masObservados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Entregables más observados</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border text-sm">
              {data.masObservados.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{e.nombre}</span>{' '}
                    <Link to="/trabajos/$id" params={{ id: e.trabajo.id }} className="font-mono text-xs text-muted-foreground hover:underline">
                      {e.trabajo.codigo}
                    </Link>
                    <span className="text-muted-foreground"> · {nombreCompleto(e.auxiliar) ?? 'Sin auxiliar'}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {e.internas} internas · {e.cliente} del cliente
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export function ReporteOcupacionVista({ desde, hasta }: Props) {
  const { data, error } = useQuery(ocupacionQuery(desde, hasta))
  if (error) return <p className="text-sm text-destructive">{error.message}</p>
  if (!data) return <Cargando />
  if (data.personas.length === 0) return <SinDatos icono={<Users />} titulo="Sin personal de producción" descripcion="Se muestran los auxiliares y jefes de producción activos." />
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Indicador etiqueta="Ocupación del equipo" valor={pct(data.total.porcentaje)} />
        <Indicador etiqueta="Horas disponibles" valor={duracion(data.total.capacidad)} />
        <Indicador etiqueta="Horas registradas" valor={duracion(data.total.trabajado)} />
        <Indicador etiqueta="Horas extra y bonos" valor={duracion(data.total.minutosExtra)} detalle={`bonos: ${formatearSoles(data.total.bonos)}`} />
      </div>
      <p className="text-sm text-muted-foreground">
        Disponible = su horario menos feriados, cumpleaños y ausencias. Registrado = cronómetro o tiempo manual. Si nadie usa el cronómetro, la ocupación sale baja.
      </p>
      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead className="text-right">Disponible</TableHead>
                <TableHead className="text-right">Registrado</TableHead>
                <TableHead>Ocupación</TableHead>
                <TableHead className="text-right">Horas extra</TableHead>
                <TableHead className="text-right">Bonos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.personas.map((p) => (
                <TableRow key={p.usuario.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{nombreCompleto(p.usuario)}</span>
                      <span className="text-xs text-muted-foreground">{p.roles.join(', ')}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{duracion(p.capacidad)}</TableCell>
                  <TableCell className="text-right tabular-nums">{duracion(p.trabajado)}</TableCell>
                  <TableCell>
                    <Barra valor={p.porcentaje} tono={p.porcentaje !== null && p.porcentaje > 1 ? 'mal' : 'bien'} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.minutosExtra ? duracion(p.minutosExtra) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.bonos ? formatearSoles(p.bonos) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export function ReporteCobranzaVista({ desde, hasta }: Props) {
  const { data } = useQuery(cobranzaReporteQuery(desde, hasta))
  if (!data) return <Cargando />
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Indicador etiqueta="Por cobrar" valor={formatearSoles(data.porCobrar)} detalle={`al ${formatearFecha(data.hasta)}`} />
        <Indicador etiqueta="Vencido" valor={formatearSoles(data.vencido)} tono={data.vencido > 0 ? 'mal' : 'bien'} />
        <Indicador etiqueta="Morosidad" valor={pct(data.morosidad, 1)} detalle="vencido sobre lo por cobrar" />
        <Indicador etiqueta="Cobrado en el periodo" valor={formatearSoles(data.cobradoEnPeriodo)} tono="bien" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por antigüedad</CardTitle>
            <CardDescription>Saldo de cuotas según los días de atraso.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border text-sm">
              {data.antiguedad.map((a) => (
                <li key={a.tramo} className="flex items-center justify-between px-3 py-2">
                  <span>{a.tramo}</span>
                  <span className="tabular-nums">
                    <span className="font-medium">{formatearSoles(a.monto)}</span>
                    <span className="text-muted-foreground"> · {a.cuotas} {a.cuotas === 1 ? 'cuota' : 'cuotas'}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Vencido por responsable</CardTitle>
            <CardDescription>Quien sigue al cliente es quien cobra.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.vencidoPorResponsable.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay cuotas vencidas.</p>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {data.vencidoPorResponsable.map((v) => (
                  <li key={v.usuario.id} className="flex items-center justify-between px-3 py-2">
                    <span>{nombreCompleto(v.usuario)}</span>
                    <span className="tabular-nums">
                      <span className="font-medium text-red-700 dark:text-red-400">{formatearSoles(v.monto)}</span>
                      <span className="text-muted-foreground"> · {v.cuotas} {v.cuotas === 1 ? 'cuota' : 'cuotas'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cobrado por mes</CardTitle>
          </CardHeader>
          <CardContent>
            {data.cobradoPorMes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin pagos en el periodo.</p>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {data.cobradoPorMes.map((m) => (
                  <li key={m.mes} className="flex items-center justify-between px-3 py-2">
                    <span>{m.mes}</span>
                    <span className="font-medium tabular-nums">{formatearSoles(m.monto)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cobrado por medio de pago</CardTitle>
          </CardHeader>
          <CardContent>
            {data.cobradoPorMetodo.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin pagos en el periodo.</p>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {data.cobradoPorMetodo.map((m) => (
                  <li key={m.metodo} className="flex items-center justify-between px-3 py-2">
                    <span className="flex items-center gap-2">
                      <Wallet className="size-3.5 text-muted-foreground" />
                      {NOMBRE_METODO_PAGO[m.metodo as MetodoPago] ?? m.metodo}
                    </span>
                    <span className="font-medium tabular-nums">{formatearSoles(m.monto)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
