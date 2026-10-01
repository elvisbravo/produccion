import { formatearSoles } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, FileText, Printer, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { Can } from '@/components/can'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cotizacionesQuery } from '@/features/documentos/api'
import { InsigniaEstadoCotizacion } from '@/features/documentos/components/insignias'
import { useDebounce } from '@/hooks/use-debounce'
import { formatearFecha, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { useAlcance } from '@/lib/permisos'

const ESTADOS = { vigente: 'Vigentes', vencida: 'Vencidas', anulada: 'Anuladas' } as const
const TODOS = 'todos'

export const Route = createFileRoute('/_app/cotizaciones/')({
  validateSearch: z.object({
    q: z.string().optional(),
    estado: z.enum(['vigente', 'vencida', 'anulada']).optional().catch(undefined),
    pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  }),
  beforeLoad: () => exigirPermiso('cotizaciones.ver'),
  component: ListadoCotizaciones,
})

function ListadoCotizaciones() {
  const filtros = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const alcance = useAlcance('cotizaciones.ver')
  const { data, isPending } = useQuery(cotizacionesQuery(filtros))
  const [texto, setTexto] = useState(filtros.q ?? '')
  const q = useDebounce(texto.trim(), 350)

  useEffect(() => {
    if ((filtros.q ?? '') !== q) void navigate({ search: (s) => ({ ...s, q: q || undefined, pagina: undefined }), replace: true })
  }, [q, filtros.q, navigate])

  const pagina = data?.pagina ?? 1
  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.porPagina)) : 1

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Cotizaciones</h1>
        <p className="text-sm text-muted-foreground">
          {alcance === 'todos' ? 'Todas las cotizaciones emitidas.' : 'Las cotizaciones de tus prospectos.'} Se emiten desde el detalle de cada prospecto.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar cotización" placeholder="Número, prospecto o cliente" className="pl-8" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <Select
          value={filtros.estado ?? TODOS}
          onValueChange={(v) => void navigate({ search: (s) => ({ ...s, estado: v === TODOS ? undefined : (v as keyof typeof ESTADOS), pagina: undefined }), replace: true })}
        >
          <SelectTrigger aria-label="Estado" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas</SelectItem>
            {Object.entries(ESTADOS).map(([valor, nombre]) => (
              <SelectItem key={valor} value={valor}>
                {nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!isPending && data?.total === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>Sin cotizaciones</EmptyTitle>
            <EmptyDescription>{filtros.q || filtros.estado ? 'Ninguna cotización coincide con la búsqueda.' : 'Emite la primera desde el detalle de un prospecto.'}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Emitida</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending
                ? Array.from({ length: 5 }, (_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-9 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : data?.datos.map((c) => (
                    <TableRow key={c.id} className="relative">
                      <TableCell>
                        <Link to="/prospectos/$id" params={{ id: c.prospecto.id }} className="font-mono text-xs font-medium after:absolute after:inset-0 hover:underline">
                          {c.numero}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{c.prospecto.cliente}</span>
                          <span className="text-xs text-muted-foreground">
                            <span className="font-mono">{c.prospecto.codigo}</span> · {c.prospecto.tipoTrabajo}
                            {c.prospecto.convertido && ' · ya es cliente'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-col text-sm">
                          <span>{formatearFecha(c.fecha)}</span>
                          <span className="text-xs text-muted-foreground">{nombreCompleto(c.creadoPor)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-0.5">
                          <InsigniaEstadoCotizacion cotizacion={c} />
                          {c.estado === 'emitida' && <span className="text-xs text-muted-foreground">hasta el {formatearFecha(c.validaHasta)}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatearSoles(c.total)}</TableCell>
                      <TableCell className="text-right">
                        <Can permiso="cotizaciones.imprimir">
                          <Button variant="ghost" size="sm" className="relative z-10" asChild>
                            <Link to="/imprimir/cotizacion/$id" params={{ id: c.id }} target="_blank">
                              <Printer />
                              Imprimir
                            </Link>
                          </Button>
                        </Can>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
          {data && data.total > 0 && (
            <div className="flex items-center justify-between gap-4 border-t px-4 py-3 text-sm text-muted-foreground">
              <span>
                {data.total} {data.total === 1 ? 'cotización' : 'cotizaciones'}
              </span>
              <div className="flex items-center gap-2">
                <span>
                  Página {pagina} de {totalPaginas}
                </span>
                <Button variant="outline" size="icon-sm" aria-label="Página anterior" disabled={pagina <= 1} onClick={() => void navigate({ search: (s) => ({ ...s, pagina: pagina - 1 }) })}>
                  <ChevronLeft />
                </Button>
                <Button variant="outline" size="icon-sm" aria-label="Página siguiente" disabled={pagina >= totalPaginas} onClick={() => void navigate({ search: (s) => ({ ...s, pagina: pagina + 1 }) })}>
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
