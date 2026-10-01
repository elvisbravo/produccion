import type { AuditoriaItem } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronDown, ChevronLeft, ChevronRight, History } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { auditoriaQuery } from '@/features/administracion/api'
import { formatearFechaHora, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { cn } from '@/lib/utils'

const TODAS = 'todas'

export const Route = createFileRoute('/_app/auditoria/')({
  validateSearch: z.object({
    entidad: z.string().optional().catch(undefined),
    desde: z.iso.date().optional().catch(undefined),
    hasta: z.iso.date().optional().catch(undefined),
    pagina: z.number().int().min(1).optional().catch(undefined),
  }),
  beforeLoad: () => exigirPermiso('auditoria.ver'),
  component: Auditoria,
})

function Auditoria() {
  const filtros = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data, isPending } = useQuery(auditoriaQuery(filtros))
  const ir = (cambio: Partial<typeof filtros>) => void navigate({ search: (x) => ({ ...x, pagina: undefined, ...cambio }), replace: true })
  const paginas = data ? Math.max(1, Math.ceil(data.total / data.porPagina)) : 1
  const pagina = filtros.pagina ?? 1

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Auditoría</h1>
        <p className="text-sm text-muted-foreground">Quién hizo qué y cuándo, con los valores de antes y después.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-52">
          <FieldLabel htmlFor="aud-entidad">Qué</FieldLabel>
          <Select value={filtros.entidad ?? TODAS} onValueChange={(v) => ir({ entidad: v === TODAS ? undefined : v })}>
            <SelectTrigger id="aud-entidad">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todo</SelectItem>
              {data?.entidades.map((e) => (
                <SelectItem key={e} value={e}>
                  {e.replaceAll('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-40">
          <FieldLabel htmlFor="aud-desde">Desde</FieldLabel>
          <Input id="aud-desde" type="date" value={filtros.desde ?? ''} onChange={(ev) => ir({ desde: ev.target.value || undefined })} />
        </Field>
        <Field className="w-40">
          <FieldLabel htmlFor="aud-hasta">Hasta</FieldLabel>
          <Input id="aud-hasta" type="date" value={filtros.hasta ?? ''} onChange={(ev) => ir({ hasta: ev.target.value || undefined })} />
        </Field>
      </div>

      {isPending || !data ? (
        <Skeleton className="h-96" />
      ) : data.datos.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <History />
            </EmptyMedia>
            <EmptyTitle>Sin registros con estos filtros</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ul className="divide-y rounded-xl border bg-card">
            {data.datos.map((a) => (
              <Registro key={a.id} a={a} />
            ))}
          </ul>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{data.total} registros</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" disabled={pagina <= 1} onClick={() => void navigate({ search: (x) => ({ ...x, pagina: pagina - 1 }) })} aria-label="Anterior">
                <ChevronLeft />
              </Button>
              <span className="tabular-nums">
                {pagina} de {paginas}
              </span>
              <Button variant="outline" size="icon" disabled={pagina >= paginas} onClick={() => void navigate({ search: (x) => ({ ...x, pagina: pagina + 1 }) })} aria-label="Siguiente">
                <ChevronRight />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Registro({ a }: { a: AuditoriaItem }) {
  const [abierto, setAbierto] = useState(false)
  const conDetalle = a.antes !== null || a.despues !== null
  return (
    <li>
      <button
        type="button"
        onClick={() => conDetalle && setAbierto((v) => !v)}
        className={cn('flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left text-sm', conDetalle && 'hover:bg-muted/50')}
      >
        <span className="w-36 shrink-0 text-xs text-muted-foreground tabular-nums">{formatearFechaHora(a.fecha)}</span>
        <span className="font-medium">{nombreCompleto(a.usuario) ?? 'Sistema'}</span>
        <Badge variant="secondary">{a.accion.replaceAll('_', ' ')}</Badge>
        <span className="text-muted-foreground">{a.entidad.replaceAll('_', ' ')}</span>
        {a.entidadId && <span className="font-mono text-xs text-muted-foreground">{a.entidadId.slice(0, 8)}</span>}
        {conDetalle && <ChevronDown className={cn('ml-auto size-4 text-muted-foreground transition-transform', abierto && 'rotate-180')} />}
      </button>
      {abierto && (
        <div className="grid gap-3 border-t bg-muted/30 px-3 py-3 md:grid-cols-2">
          {(['antes', 'despues'] as const).map((k) => (
            <div key={k} className="min-w-0">
              <p className="mb-1 text-xs font-medium text-muted-foreground">{k === 'antes' ? 'Antes' : 'Después'}</p>
              <pre className="max-h-72 overflow-auto rounded-md border bg-background p-2 text-xs whitespace-pre-wrap">{a[k] === null ? '—' : JSON.stringify(a[k], null, 2)}</pre>
            </div>
          ))}
        </div>
      )}
    </li>
  )
}
