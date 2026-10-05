import { type ProveedorItem } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Handshake, Pencil, Plus, Power, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { proveedoresQuery, useCambiarActivo } from '@/features/proveedores/api'
import { DialogoProveedor } from '@/features/proveedores/components/dialogo-proveedor'
import { useDebounce } from '@/hooks/use-debounce'
import { ApiError } from '@/lib/api'
import { formatearCelular } from '@grupoes/shared'
import { exigirPermiso } from '@/lib/guardas'
import { usePermiso } from '@/lib/permisos'

export const Route = createFileRoute('/_app/proveedores/')({
  validateSearch: z.object({
    q: z.string().optional(),
    estado: z.enum(['activos', 'inactivos', 'todos']).optional().catch(undefined),
    pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  }),
  beforeLoad: () => exigirPermiso('proveedores.ver'),
  component: Proveedores,
})

function Proveedores() {
  const filtros = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const puedeCrear = usePermiso('proveedores.crear')
  const puedeEditar = usePermiso('proveedores.editar')
  const puedeDesactivar = usePermiso('proveedores.desactivar')
  const puedeRegistrar = usePermiso('trabajos.registrar_de_proveedor')
  const { data, isPending } = useQuery(proveedoresQuery(filtros))
  const cambiar = useCambiarActivo()
  const [texto, setTexto] = useState(filtros.q ?? '')
  const q = useDebounce(texto.trim(), 350)
  const [editando, setEditando] = useState<ProveedorItem | 'nuevo' | null>(null)

  useEffect(() => {
    if ((filtros.q ?? '') !== q) void navigate({ search: (s) => ({ ...s, q: q || undefined, pagina: undefined }), replace: true })
  }, [q, filtros.q, navigate])

  const pagina = data?.pagina ?? 1
  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.porPagina)) : 1

  const alternar = async (p: ProveedorItem) => {
    try {
      await cambiar.mutateAsync({ id: p.id, activo: !p.activo })
      toast.success(p.activo ? `${p.nombres} ${p.apellidos} desactivado` : `${p.nombres} ${p.apellidos} activado`)
    } catch (err) {
      toast.error(err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo cambiar')
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">Quienes entregan trabajos sin pasar por el seguimiento comercial. Un proveedor puede tener varios trabajos.</p>
        </div>
        <div className="flex gap-2">
          {puedeRegistrar && (
            <Button variant="outline" asChild>
              <Link to="/trabajos/de-proveedor">Registrar trabajo</Link>
            </Button>
          )}
          {puedeCrear && (
            <Button onClick={() => setEditando('nuevo')}>
              <Plus />
              Nuevo proveedor
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar proveedor" placeholder="Nombre, apellidos, celular o correo" className="pl-8" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <Select value={filtros.estado ?? 'todos'} onValueChange={(v) => void navigate({ search: (s) => ({ ...s, estado: v === 'todos' ? undefined : (v as 'activos' | 'inactivos'), pagina: undefined }), replace: true })}>
          <SelectTrigger aria-label="Estado" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="activos">Activos</SelectItem>
            <SelectItem value="inactivos">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <Skeleton className="h-64" />
      ) : data && data.total === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Handshake />
            </EmptyMedia>
            <EmptyTitle>No hay proveedores</EmptyTitle>
            <EmptyDescription>{filtros.q || filtros.estado ? 'Ninguno coincide con la búsqueda.' : 'Registra al primero para empezar a recibir sus trabajos.'}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <Table className="min-w-[36rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead className="w-24 text-right">Trabajos</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.datos.map((p) => (
                  <TableRow key={p.id} className={p.activo ? '' : 'opacity-60'}>
                    <TableCell className="whitespace-normal">
                      <Link to="/proveedores/$id" params={{ id: p.id }} className="font-medium hover:underline">
                        {p.nombres} {p.apellidos}
                      </Link>
                      {!p.activo && (
                        <Badge variant="secondary" className="ml-2">
                          Inactivo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.celular && <div className="font-mono">{formatearCelular(p.celular)}</div>}
                      {p.email && <div>{p.email}</div>}
                      {!p.celular && !p.email && '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.trabajos}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {puedeEditar && (
                          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${p.nombres} ${p.apellidos}`} onClick={() => setEditando(p)}>
                            <Pencil />
                          </Button>
                        )}
                        {puedeDesactivar && (
                          <Button variant="ghost" size="icon-sm" aria-label={p.activo ? `Desactivar ${p.nombres}` : `Activar ${p.nombres}`} title={p.activo ? 'Desactivar' : 'Activar'} onClick={() => void alternar(p)}>
                            <Power />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data && (
              <div className="flex items-center justify-between gap-4 border-t px-4 py-3 text-sm text-muted-foreground">
                <span>
                  {data.total} {data.total === 1 ? 'proveedor' : 'proveedores'}
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
          </CardContent>
        </Card>
      )}

      {editando && <DialogoProveedor key={editando === 'nuevo' ? 'nuevo' : editando.id} proveedor={editando === 'nuevo' ? null : editando} abierto onAbiertoChange={(a) => !a && setEditando(null)} />}
    </div>
  )
}
