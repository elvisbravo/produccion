import { formatearCelular, NOMBRE_TEMPERATURA, TEMPERATURAS, type TableroSeguimiento, type TarjetaSeguimiento } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { LayoutList, Plus, Search, SquareKanban } from 'lucide-react'
import { useMemo, useState } from 'react'
import { z } from 'zod'
import { Can } from '@/components/can'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { InsigniaEtapa } from '@/features/prospectos/components/insignias'
import { Kanban } from '@/features/seguimiento/components/kanban'
import { estadoSeguimiento, ProximoPaso, type EstadoSeguimiento } from '@/features/seguimiento/components/tarjeta-seguimiento'
import { tableroQuery, useCatalogosSeguimiento } from '@/features/tareas/api'
import { useDebounce } from '@/hooks/use-debounce'
import { nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { useAlcance } from '@/lib/permisos'
import { cn } from '@/lib/utils'

const FILTROS = ['vencido', 'hoy', 'proximo', 'sin'] as const
const NOMBRE_FILTRO: Record<EstadoSeguimiento, string> = { vencido: 'Vencidos', hoy: 'Hoy', proximo: 'Próximos', sin: 'Sin seguimiento' }

export const Route = createFileRoute('/_app/seguimiento/')({
  validateSearch: z.object({
    vista: z.enum(['tablero', 'lista']).optional().catch(undefined),
    filtro: z.enum(FILTROS).optional().catch(undefined),
    temperatura: z.enum(TEMPERATURAS).optional().catch(undefined),
  }),
  beforeLoad: () => exigirPermiso('seguimiento.ver'),
  component: PaginaSeguimiento,
})

const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

function PaginaSeguimiento() {
  const busqueda = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const alcance = useAlcance('seguimiento.ver')
  const { data: tablero, isPending } = useQuery(tableroQuery)
  const { motivosPerdida } = useCatalogosSeguimiento()
  const [texto, setTexto] = useState('')
  const q = normalizar(useDebounce(texto.trim(), 200))
  const vista = busqueda.vista ?? 'tablero'

  const actualizar = (cambios: Partial<typeof busqueda>) => void navigate({ search: (s) => ({ ...s, ...cambios }), replace: true })

  // Búsqueda y temperatura se aplican en el navegador: el tablero ya trae todos los prospectos abiertos.
  const filtrados = useMemo(() => {
    if (!tablero) return []
    return tablero.prospectos.filter((p) => {
      if (busqueda.temperatura && p.temperatura !== busqueda.temperatura) return false
      if (!q) return true
      const c = p.contactoPrincipal
      const texto = normalizar([p.codigo, p.titulo, c?.nombres, c?.apellidos, c?.celular, p.universidad, p.carrera].filter(Boolean).join(' '))
      return q.split(' ').every((palabra) => texto.includes(palabra))
    })
  }, [tablero, busqueda.temperatura, q])

  const conteo = useMemo(() => {
    const base: Record<EstadoSeguimiento, number> = { vencido: 0, hoy: 0, proximo: 0, sin: 0 }
    if (tablero) for (const p of filtrados) base[estadoSeguimiento(p, tablero.hoy)]++
    return base
  }, [filtrados, tablero])

  const visibles = busqueda.filtro && tablero ? filtrados.filter((p) => estadoSeguimiento(p, tablero.hoy) === busqueda.filtro) : filtrados

  return (
    <div className="flex w-full flex-col gap-5 p-4 md:p-8">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{alcance === 'todos' ? 'Seguimiento' : 'Mis seguimientos'}</h1>
          <p className="text-sm text-muted-foreground">Todo prospecto activo debe tener un próximo paso.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ToggleGroup type="single" variant="outline" value={vista} onValueChange={(v) => v && actualizar({ vista: v === 'tablero' ? undefined : 'lista' })} aria-label="Vista">
            <ToggleGroupItem value="tablero" aria-label="Tablero">
              <SquareKanban />
              <span className="hidden sm:inline">Tablero</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="lista" aria-label="Lista">
              <LayoutList />
              <span className="hidden sm:inline">Lista</span>
            </ToggleGroupItem>
          </ToggleGroup>
          <Can permiso="prospectos.crear">
            <Button asChild>
              <Link to="/prospectos/nuevo">
                <Plus />
                Nuevo prospecto
              </Link>
            </Button>
          </Can>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={busqueda.filtro === f}
            onClick={() => actualizar({ filtro: busqueda.filtro === f ? undefined : f, vista: vista === 'tablero' && busqueda.filtro !== f ? 'lista' : busqueda.vista })}
            className={cn(
              'flex min-w-32 flex-col items-start rounded-xl border bg-card px-4 py-2.5 text-left transition-colors hover:border-foreground/30',
              busqueda.filtro === f && 'border-foreground ring-1 ring-foreground',
            )}
          >
            <span className={cn('text-xs', f === 'vencido' ? 'text-red-700 dark:text-red-400' : f === 'sin' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
              {NOMBRE_FILTRO[f]}
            </span>
            <span className="text-xl font-semibold tabular-nums">{tablero ? conteo[f] : '–'}</span>
          </button>
        ))}
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Buscar" placeholder="Celular, nombre o código" className="w-60 pl-8" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
          <Select value={busqueda.temperatura ?? 'todas'} onValueChange={(v) => actualizar({ temperatura: v === 'todas' ? undefined : (v as (typeof TEMPERATURAS)[number]) })}>
            <SelectTrigger aria-label="Temperatura" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Toda temperatura</SelectItem>
              {TEMPERATURAS.map((t) => (
                <SelectItem key={t} value={t}>
                  {NOMBRE_TEMPERATURA[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isPending || !tablero ? (
        <div className="flex gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-96 w-72 shrink-0" />
          ))}
        </div>
      ) : vista === 'tablero' ? (
        <Kanban tablero={tablero} prospectos={visibles} motivos={motivosPerdida} />
      ) : (
        <Lista prospectos={visibles} tablero={tablero} />
      )}
    </div>
  )
}

function Lista({ prospectos, tablero }: { prospectos: TarjetaSeguimiento[]; tablero: TableroSeguimiento }) {
  // Primero lo más urgente: vencidos, sin seguimiento, y luego por fecha del próximo paso.
  const orden: Record<EstadoSeguimiento, number> = { vencido: 0, sin: 1, hoy: 2, proximo: 3 }
  const ordenados = [...prospectos].sort(
    (a, b) =>
      orden[estadoSeguimiento(a, tablero.hoy)] - orden[estadoSeguimiento(b, tablero.hoy)] ||
      (a.proxima?.inicio ?? a.proxima?.fecha ?? '').localeCompare(b.proxima?.inicio ?? b.proxima?.fecha ?? ''),
  )

  if (ordenados.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nada por aquí</EmptyTitle>
          <EmptyDescription>No hay prospectos con este filtro.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {ordenados.map((p) => {
        const etapa = tablero.etapas.find((e) => e.id === p.etapaId)
        return (
          <li key={p.id} className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-muted/40">
            <div className="flex min-w-56 flex-1 flex-col">
              <Link to="/prospectos/$id" params={{ id: p.id }} className="font-medium after:absolute after:inset-0">
                {nombreCompleto(p.contactoPrincipal) ?? (p.contactoPrincipal ? formatearCelular(p.contactoPrincipal.celular) : p.codigo)}
              </Link>
              <span className="text-xs text-muted-foreground">
                <span className="font-mono">{p.codigo}</span> · {p.tipoTrabajo}
                {p.universidad && ` · ${p.universidad}`}
              </span>
            </div>
            {etapa && <InsigniaEtapa nombre={etapa.nombre} color={etapa.color} />}
            <div className="w-full sm:w-80">
              <ProximoPaso p={p} hoy={tablero.hoy} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
