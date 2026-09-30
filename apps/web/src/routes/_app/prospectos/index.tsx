import { formatearCelular, NOMBRE_TEMPERATURA, TEMPERATURAS } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Plus, Search, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { Can } from '@/components/can'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { catalogosProspectoQuery, prospectosQuery } from '@/features/prospectos/api'
import { InsigniaEtapa, InsigniaPrioridad, InsigniaTemperatura } from '@/features/prospectos/components/insignias'
import { useDebounce } from '@/hooks/use-debounce'
import { haceCuanto, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { useAlcance } from '@/lib/permisos'

/** Filtros en la URL: todos opcionales y sin valores por defecto, para que la URL quede limpia. */
const busquedaSchema = z.object({
  q: z.string().optional(),
  etapaId: z.uuid().optional().catch(undefined),
  temperatura: z.enum(TEMPERATURAS).optional().catch(undefined),
  tipoTrabajoId: z.uuid().optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
})

export const Route = createFileRoute('/_app/prospectos/')({
  validateSearch: busquedaSchema,
  beforeLoad: () => exigirPermiso('prospectos.ver'),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogosProspectoQuery),
  component: ListadoProspectos,
})

const TODOS = 'todos'

function ListadoProspectos() {
  const filtros = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const alcance = useAlcance('prospectos.ver')
  const { data: catalogos } = useQuery(catalogosProspectoQuery)
  const { data, isPending, isFetching } = useQuery(prospectosQuery(filtros))

  const [texto, setTexto] = useState(filtros.q ?? '')
  const q = useDebounce(texto.trim(), 350)
  useEffect(() => {
    if ((filtros.q ?? '') !== q) void navigate({ search: (s) => ({ ...s, q: q || undefined, pagina: undefined }), replace: true })
  }, [q, filtros.q, navigate])

  const filtrar = (cambios: Partial<typeof filtros>) =>
    void navigate({ search: (s) => ({ ...s, ...cambios, pagina: undefined }), replace: true })

  const pagina = data?.pagina ?? 1
  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.porPagina)) : 1
  const hayFiltros = Boolean(filtros.q || filtros.etapaId || filtros.temperatura || filtros.tipoTrabajoId)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Prospectos</h1>
          <p className="text-sm text-muted-foreground">
            {alcance === 'todos' ? 'Todos los prospectos.' : 'Los prospectos que tienes a cargo.'}
          </p>
        </div>
        <Can permiso="prospectos.crear">
          <Button asChild className="ml-auto">
            <Link to="/prospectos/nuevo">
              <Plus />
              Nuevo prospecto
            </Link>
          </Button>
        </Can>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar prospecto"
            placeholder="Celular, nombre, DNI o código"
            className="pl-8"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>
        <Select value={filtros.etapaId ?? TODOS} onValueChange={(v) => filtrar({ etapaId: v === TODOS ? undefined : v })}>
          <SelectTrigger aria-label="Etapa" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas las etapas</SelectItem>
            {catalogos?.etapas.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                <span className="size-2 rounded-full" style={{ backgroundColor: e.color }} aria-hidden="true" />
                {e.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filtros.temperatura ?? TODOS}
          onValueChange={(v) => filtrar({ temperatura: v === TODOS ? undefined : (v as (typeof TEMPERATURAS)[number]) })}
        >
          <SelectTrigger aria-label="Temperatura" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Toda temperatura</SelectItem>
            {TEMPERATURAS.map((t) => (
              <SelectItem key={t} value={t}>
                {NOMBRE_TEMPERATURA[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtros.tipoTrabajoId ?? TODOS} onValueChange={(v) => filtrar({ tipoTrabajoId: v === TODOS ? undefined : v })}>
          <SelectTrigger aria-label="Tipo de trabajo" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todo tipo de trabajo</SelectItem>
            {catalogos?.tiposTrabajo.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hayFiltros && (
          <Button
            variant="ghost"
            onClick={() => {
              setTexto('')
              void navigate({ search: {}, replace: true })
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      {!isPending && data?.total === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>{hayFiltros ? 'Sin resultados' : 'Aún no hay prospectos'}</EmptyTitle>
            <EmptyDescription>
              {hayFiltros ? 'Prueba con otra búsqueda o quita los filtros.' : 'Registra el primero con solo su número de WhatsApp.'}
            </EmptyDescription>
          </EmptyHeader>
          {!hayFiltros && (
            <Can permiso="prospectos.crear">
              <EmptyContent>
                <Button asChild>
                  <Link to="/prospectos/nuevo">
                    <Plus />
                    Nuevo prospecto
                  </Link>
                </Button>
              </EmptyContent>
            </Can>
          )}
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table aria-busy={isFetching}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Código</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead className="hidden md:table-cell">Trabajo</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead className="hidden lg:table-cell">Temperatura</TableHead>
                <TableHead className="hidden lg:table-cell">Prioridad</TableHead>
                <TableHead className="hidden xl:table-cell">Responsable</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Registro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending
                ? Array.from({ length: 6 }, (_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}>
                        <Skeleton className="h-9 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : data?.datos.map((p) => {
                    const contacto = p.contactoPrincipal
                    return (
                      <TableRow key={p.id} className="group relative">
                        <TableCell>
                          <Link
                            to="/prospectos/$id"
                            params={{ id: p.id }}
                            className="font-mono text-xs font-medium after:absolute after:inset-0 hover:underline"
                          >
                            {p.codigo}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {nombreCompleto(contacto) ?? <span className="text-muted-foreground italic">Sin nombre</span>}
                              {p.totalContactos > 1 && <span className="ml-1 text-muted-foreground">+{p.totalContactos - 1}</span>}
                            </span>
                            {contacto && <span className="font-mono text-xs text-muted-foreground">{formatearCelular(contacto.celular)}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex max-w-72 flex-col">
                            <span className="truncate">
                              {p.tipoTrabajo}
                              {p.nivelAcademico && <span className="text-muted-foreground"> · {p.nivelAcademico}</span>}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {[p.universidad, p.carrera].filter(Boolean).join(' · ') || p.titulo || '—'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <InsigniaEtapa nombre={p.etapa.nombre} color={p.etapa.color} />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <InsigniaTemperatura temperatura={p.temperatura} />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <InsigniaPrioridad nombre={p.prioridad.nombre} color={p.prioridad.color} />
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-muted-foreground">
                          {p.responsable.nombres} {p.responsable.apellidos}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-right text-muted-foreground">{haceCuanto(p.creadoEn)}</TableCell>
                      </TableRow>
                    )
                  })}
            </TableBody>
          </Table>

          {data && data.total > 0 && (
            <div className="flex items-center justify-between gap-4 border-t px-4 py-3 text-sm text-muted-foreground">
              <span>
                {data.total} {data.total === 1 ? 'prospecto' : 'prospectos'}
              </span>
              <div className="flex items-center gap-2">
                <span>
                  Página {pagina} de {totalPaginas}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Página anterior"
                  disabled={pagina <= 1}
                  onClick={() => void navigate({ search: (s) => ({ ...s, pagina: pagina - 1 }) })}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Página siguiente"
                  disabled={pagina >= totalPaginas}
                  onClick={() => void navigate({ search: (s) => ({ ...s, pagina: pagina + 1 }) })}
                >
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
