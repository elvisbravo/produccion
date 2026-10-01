import { diaEnLima, type VistaBandeja } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { PackageCheck } from 'lucide-react'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { bandejaQuery } from '@/features/produccion/api'
import { InsigniaEstadoEntregable, PuntoSemaforo } from '@/features/produccion/components/insignias'
import { InsigniaPrioridad } from '@/features/prospectos/components/insignias'
import { diasHasta, formatearFecha, haceCuanto, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { usePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'

const VISTAS: { valor: VistaBandeja; nombre: string; vacio: string }[] = [
  { valor: 'revision', nombre: 'En revisión', vacio: 'Nada espera revisión interna.' },
  { valor: 'por_entregar', nombre: 'Por entregar', vacio: 'No hay entregables aprobados pendientes de enviar al cliente.' },
  { valor: 'con_cliente', nombre: 'Con el cliente', vacio: 'No hay entregables esperando respuesta del cliente.' },
  { valor: 'activos', nombre: 'Todos los abiertos', vacio: 'No hay entregables abiertos.' },
]

export const Route = createFileRoute('/_app/entregables/')({
  validateSearch: z.object({ vista: z.enum(['revision', 'por_entregar', 'con_cliente', 'activos']).optional().catch(undefined) }),
  beforeLoad: () => exigirPermiso('entregables.ver'),
  component: Bandeja,
})

function Bandeja() {
  const { vista: buscada } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const revisa = usePermiso('entregables.aprobar')
  const entrega = usePermiso('entregables.registrar_entrega')
  // Cada rol abre en lo que le toca: el jefe en revisión; la asistente administrativa en lo que hay que enviar.
  const vista: VistaBandeja = buscada ?? (revisa ? 'revision' : entrega ? 'por_entregar' : 'activos')
  const { data, isPending } = useQuery(bandejaQuery(vista))
  const hoy = diaEnLima()

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Entregables</h1>
        <p className="text-sm text-muted-foreground">Avances y entregas finales de los trabajos, de la fecha límite más cercana a la más lejana.</p>
      </div>

      <ToggleGroup
        type="single"
        variant="outline"
        value={vista}
        onValueChange={(v) => v && void navigate({ search: { vista: v as VistaBandeja }, replace: true })}
        className="w-fit flex-wrap"
      >
        {VISTAS.map((v) => (
          <ToggleGroupItem key={v.valor} value={v.valor}>
            {v.nombre}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {isPending || !data ? (
        <Skeleton className="h-64" />
      ) : data.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageCheck />
            </EmptyMedia>
            <EmptyTitle>Todo al día</EmptyTitle>
            <EmptyDescription>{VISTAS.find((v) => v.valor === vista)!.vacio}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entregable</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden md:table-cell">Equipo</TableHead>
                <TableHead className="hidden lg:table-cell">Último movimiento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((e) => {
                const dias = diasHasta(e.fechaLimite, hoy)
                const ultimo = [e.ultimaRevision && { fecha: e.ultimaRevision.fecha, texto: `${e.ultimaRevision.resultado === 'aprobado' ? 'Aprobado' : 'Observado'} por ${nombreCompleto(e.ultimaRevision.revisor)}` }, e.ultimaEntrega && { fecha: e.ultimaEntrega.fecha, texto: 'Enviado al cliente' }]
                  .filter((x): x is { fecha: string; texto: string } => Boolean(x))
                  .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
                return (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-normal">
                      <Link to="/trabajos/$id" params={{ id: e.trabajo.id }} className="flex flex-col hover:underline">
                        <span className="flex items-center gap-2 font-medium">
                          {e.nombre}
                          {e.esFinal && <Badge variant="secondary">Final</Badge>}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="shrink-0 font-mono whitespace-nowrap">{e.trabajo.codigo}</span>
                          {e.trabajo.titulo && <span className="line-clamp-1">{e.trabajo.titulo}</span>}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1.5">
                          {e.semaforo && <PuntoSemaforo semaforo={e.semaforo} fin={e.finPlan} />}
                          {formatearFecha(e.fechaLimite)}
                        </span>
                        <span className={cn('text-xs', dias < 0 ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground')}>
                          {dias < 0 ? `venció hace ${-dias} d` : dias === 0 ? 'hoy' : `en ${dias} d`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <InsigniaEstadoEntregable estado={e.estado} />
                        <InsigniaPrioridad nombre={e.trabajo.prioridad.nombre} color={e.trabajo.prioridad.color} />
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      <div className="flex flex-col">
                        <span>{nombreCompleto(e.auxiliarPrincipal) ?? '—'}</span>
                        <span className="text-xs text-muted-foreground">Revisa: {nombreCompleto(e.jefeResponsable) ?? '—'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {ultimo ? `${ultimo.texto} ${haceCuanto(ultimo.fecha)}` : '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
