import { diaEnLima, formatearCelular, formatearSoles, NOMBRE_SEGUIMIENTO, SEGUIMIENTOS } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { BriefcaseBusiness, ChevronLeft, ChevronRight, Info, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { InsigniaPrioridad } from '@/features/prospectos/components/insignias'
import { asistentesQuery, trabajosQuery } from '@/features/trabajos/api'
import { MarcaFechasFijas } from '@/features/trabajos/components/fechas-fijas'
import { EtiquetasSeguimiento, LeyendaSeguimiento } from '@/features/trabajos/components/insignias'
import { useDebounce } from '@/hooks/use-debounce'
import { diasHasta, formatearFecha, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { useAlcance, usePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/trabajos/')({
  validateSearch: z.object({
    q: z.string().optional(),
    seguimiento: z.enum(SEGUIMIENTOS).optional().catch(undefined),
    origen: z.enum(['cliente', 'proveedor']).optional().catch(undefined),
    proveedorId: z.uuid().optional().catch(undefined),
    responsableId: z.uuid().optional().catch(undefined),
    pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  }),
  beforeLoad: () => exigirPermiso('trabajos.ver'),
  component: ListadoTrabajos,
})

const TODOS = 'todos'

function ListadoTrabajos() {
  const filtros = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const alcance = useAlcance('trabajos.ver')
  const verMontos = usePermiso('contratos.ver_montos')
  const puedeClienteDirecto = usePermiso('trabajos.registrar_cliente_directo')
  const puedeProveedor = usePermiso('trabajos.registrar_de_proveedor')
  const { data, isPending } = useQuery(trabajosQuery(filtros))
  const { data: asistentes = [] } = useQuery(asistentesQuery)
  const [texto, setTexto] = useState(filtros.q ?? '')
  const q = useDebounce(texto.trim(), 350)
  const hoy = diaEnLima()

  useEffect(() => {
    if ((filtros.q ?? '') !== q) void navigate({ search: (s) => ({ ...s, q: q || undefined, pagina: undefined }), replace: true })
  }, [q, filtros.q, navigate])

  const pagina = data?.pagina ?? 1
  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.porPagina)) : 1

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Trabajos</h1>
        <p className="text-sm text-muted-foreground">
          {alcance === 'todos' ? 'Todos los trabajos de clientes.' : 'Los trabajos donde participas.'} Ordenados por fecha de entrega.
        </p>
        </div>
        <div className="flex gap-2">
          {puedeClienteDirecto && (
            <Button variant="outline" asChild>
              <Link to="/trabajos/cliente-directo">Registrar cliente existente</Link>
            </Button>
          )}
          {puedeProveedor && (
            <Button variant="outline" asChild>
              <Link to="/trabajos/de-proveedor">Registrar trabajo de proveedor</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar trabajo" placeholder="Código, título, integrante o DNI" className="pl-8" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <Select
          value={filtros.seguimiento ?? TODOS}
          onValueChange={(v) => void navigate({ search: (s) => ({ ...s, seguimiento: v === TODOS ? undefined : (v as (typeof SEGUIMIENTOS)[number]), pagina: undefined }), replace: true })}
        >
          <SelectTrigger aria-label="Seguimiento" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos</SelectItem>
            {/* El pago pendiente solo se ofrece a quien puede ver montos. */}
            {SEGUIMIENTOS.filter((e) => e !== 'pendiente_pago' || verMontos).map((e) => (
              <SelectItem key={e} value={e}>
                {NOMBRE_SEGUIMIENTO[e]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filtros.origen ?? TODOS}
          onValueChange={(v) => void navigate({ search: (s) => ({ ...s, origen: v === TODOS ? undefined : (v as 'cliente' | 'proveedor'), proveedorId: undefined, pagina: undefined }), replace: true })}
        >
          <SelectTrigger aria-label="Origen" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Clientes y proveedores</SelectItem>
            <SelectItem value="cliente">Solo clientes</SelectItem>
            <SelectItem value="proveedor">Solo proveedores</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filtros.responsableId ?? TODOS}
          onValueChange={(v) => void navigate({ search: (s) => ({ ...s, responsableId: v === TODOS ? undefined : v, pagina: undefined }), replace: true })}
        >
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
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <Info />
              Leyenda de colores
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(32rem,calc(100vw-2rem))]">
            <LeyendaSeguimiento />
          </PopoverContent>
        </Popover>
      </div>

      {!isPending && data?.total === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BriefcaseBusiness />
            </EmptyMedia>
            <EmptyTitle>Sin trabajos</EmptyTitle>
            <EmptyDescription>Los trabajos se crean al convertir un prospecto en cliente.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Código</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Trabajo</TableHead>
                <TableHead>Seguimiento</TableHead>
                <TableHead className="hidden lg:table-cell">Equipo</TableHead>
                <TableHead>Entrega</TableHead>
                {verMontos && <TableHead className="hidden sm:table-cell text-right">Saldo</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending
                ? Array.from({ length: 5 }, (_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-9 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : data?.datos.map((t) => {
                    const dias = diasHasta(t.fechaLimite, hoy)
                    return (
                      <TableRow key={t.id} className="relative">
                        <TableCell>
                          <Link to="/trabajos/$id" params={{ id: t.id }} className="font-mono text-xs font-medium after:absolute after:inset-0 hover:underline">
                            {t.codigo}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            {t.proveedor ? (
                              <>
                                <span className="font-medium">{t.titular ? (nombreCompleto(t.titular) ?? '—') : `${t.proveedor.nombres} ${t.proveedor.apellidos}`}</span>
                                <span className="text-xs text-muted-foreground">
                                  {t.titular ? `Proveedor: ${t.proveedor.nombres} ${t.proveedor.apellidos}` : 'Proveedor'}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="font-medium">
                                  {nombreCompleto(t.titular) ?? '—'}
                                  {t.totalIntegrantes > 1 && <span className="text-muted-foreground"> +{t.totalIntegrantes - 1}</span>}
                                </span>
                                {t.titular && <span className="font-mono text-xs text-muted-foreground">{formatearCelular(t.titular.celular)}</span>}
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex max-w-72 flex-col">
                            <span className="truncate">
                              {t.tipoTrabajo}
                              {t.nivelAcademico && <span className="text-muted-foreground"> · {t.nivelAcademico}</span>}
                            </span>
                            <span className="flex items-center gap-2 truncate text-xs text-muted-foreground">
                              <InsigniaPrioridad nombre={t.prioridad.nombre} color={t.prioridad.color} />
                              {t.universidad && `· ${t.universidad}`}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <EtiquetasSeguimiento seguimiento={t.seguimiento} />
                            {t.fechasFijas && <MarcaFechasFijas />}
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-sm lg:table-cell">
                          {t.auxiliarPrincipal ? (
                            <div className="flex flex-col">
                              <span>{nombreCompleto(t.auxiliarPrincipal)}</span>
                              {t.jefeResponsable && <span className="text-xs text-muted-foreground">Jefe: {nombreCompleto(t.jefeResponsable)}</span>}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Sin equipo</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col text-sm">
                            <span>{formatearFecha(t.fechaLimite)}</span>
                            <span className={cn('text-xs', dias < 0 ? 'text-red-700 dark:text-red-400' : dias <= 7 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
                              {dias < 0 ? `Venció hace ${-dias} d` : dias === 0 ? 'Vence hoy' : `En ${dias} d`}
                            </span>
                          </div>
                        </TableCell>
                        {verMontos && (
                          <TableCell className="hidden text-right tabular-nums sm:table-cell">
                            {t.saldo === null ? '—' : t.saldo === 0 ? <span className="text-green-700 dark:text-green-400">Pagado</span> : formatearSoles(t.saldo)}
                            {t.vencido ? <div className="text-xs text-red-700 dark:text-red-400">{formatearSoles(t.vencido)} vencido</div> : null}
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
            </TableBody>
          </Table>
          {data && data.total > 0 && (
            <div className="flex items-center justify-between gap-4 border-t px-4 py-3 text-sm text-muted-foreground">
              <span>
                {data.total} {data.total === 1 ? 'trabajo' : 'trabajos'}
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
