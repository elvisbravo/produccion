import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Lock, Plus, Search, UserCog } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { rolesQuery, usuariosQuery } from '@/features/administracion/api'
import { DialogoNuevoUsuario } from '@/features/administracion/components/dialogos-usuario'
import { useDebounce } from '@/hooks/use-debounce'
import { haceCuanto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { usePermiso } from '@/lib/permisos'

const TODOS = 'todos'

export const Route = createFileRoute('/_app/usuarios/')({
  validateSearch: z.object({
    q: z.string().optional().catch(undefined),
    rol: z.string().optional().catch(undefined),
    estado: z.enum(['activos', 'inactivos', 'todos']).optional().catch(undefined),
  }),
  beforeLoad: () => exigirPermiso('usuarios.ver'),
  component: Usuarios,
})

function Usuarios() {
  const { q, rol, estado } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [texto, setTexto] = useState(q ?? '')
  const busqueda = useDebounce(texto, 300)
  const { data, isPending } = useQuery(usuariosQuery({ q: busqueda || undefined, rol, estado: estado ?? 'activos' }))
  const puedeVerRoles = usePermiso('roles.ver')
  const { data: roles } = useQuery({ ...rolesQuery, enabled: puedeVerRoles })
  const puedeCrear = usePermiso('usuarios.crear')
  const [creando, setCreando] = useState(false)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
          <p className="text-sm text-muted-foreground">Quién ingresa al sistema, con qué roles y qué puede hacer.</p>
        </div>
        {puedeCrear && (
          <Button onClick={() => setCreando(true)}>
            <Plus />
            Nuevo usuario
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <InputGroup className="w-full sm:w-72">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput placeholder="Buscar por nombre o correo" value={texto} onChange={(ev) => setTexto(ev.target.value)} aria-label="Buscar usuarios" />
        </InputGroup>
        {puedeVerRoles && (
          <Select value={rol ?? TODOS} onValueChange={(v) => void navigate({ search: (x) => ({ ...x, rol: v === TODOS ? undefined : v }), replace: true })}>
            <SelectTrigger className="w-52" aria-label="Filtrar por rol">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos los roles</SelectItem>
              {roles?.map((r) => (
                <SelectItem key={r.id} value={r.codigo}>
                  {r.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <ToggleGroup
          type="single"
          variant="outline"
          value={estado ?? 'activos'}
          onValueChange={(v) => v && void navigate({ search: (x) => ({ ...x, estado: v === 'activos' ? undefined : (v as 'inactivos' | 'todos') }), replace: true })}
        >
          <ToggleGroupItem value="activos">Activos</ToggleGroupItem>
          <ToggleGroupItem value="inactivos">Inactivos</ToggleGroupItem>
          <ToggleGroupItem value="todos">Todos</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {isPending || !data ? (
        <Skeleton className="h-64" />
      ) : data.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UserCog />
            </EmptyMedia>
            <EmptyTitle>Sin usuarios en esta vista</EmptyTitle>
            <EmptyDescription>Prueba con otro filtro.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="hidden md:table-cell">Último ingreso</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <Link to="/usuarios/$id" params={{ id: u.id }} className="flex flex-col hover:underline">
                      <span className="font-medium">
                        {u.nombres} {u.apellidos}
                      </span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r.id} variant="secondary">
                          {r.nombre}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{u.ultimoAcceso ? haceCuanto(u.ultimoAcceso) : 'Nunca'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.activo ? <Badge variant="outline">Activo</Badge> : <Badge variant="outline" className="text-muted-foreground">Inactivo</Badge>}
                      {u.bloqueado && (
                        <Badge variant="destructive">
                          <Lock />
                          Bloqueado
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {creando && <DialogoNuevoUsuario onCerrar={() => setCreando(false)} />}
    </div>
  )
}
