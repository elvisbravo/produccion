import { NOMBRE_APLICA_A, NOMBRE_MODO_ASIGNACION, type ActividadAdmin } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Pencil, Plus, Power, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { actividadesAdminQuery, useCambiarActiva } from '@/features/catalogos/api'
import { DialogoActividad } from '@/features/catalogos/components/dialogo-actividad'
import { ApiError } from '@/lib/api'
import { exigirPermiso } from '@/lib/guardas'
import { duracion } from '@/lib/formato'
import { usePermiso } from '@/lib/permisos'

export const Route = createFileRoute('/_app/catalogos/')({
  beforeLoad: () => exigirPermiso('catalogos.ver'),
  component: Catalogos,
})

const POR_PAGINA = 10
const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function Catalogos() {
  const { data } = useQuery(actividadesAdminQuery)
  const puedeCrear = usePermiso('catalogos.crear')
  const puedeEditar = usePermiso('catalogos.editar')
  const puedeDesactivar = usePermiso('catalogos.desactivar')
  const cambiar = useCambiarActiva()
  const [editando, setEditando] = useState<ActividadAdmin | 'nueva' | null>(null)
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<'todas' | 'activas' | 'inactivas'>('todas')
  const [pagina, setPagina] = useState(1)

  // Se busca por nombre, tipo, participación o rol (sin distinguir tildes ni mayúsculas).
  const filtradas = useMemo(() => {
    const palabras = plano(texto).split(/s+/).filter(Boolean)
    return (data?.actividades ?? []).filter((a) => {
      if (estado === 'activas' && !a.activa) return false
      if (estado === 'inactivas' && a.activa) return false
      const paja = plano([a.nombre, a.tipo.nombre, ...a.participaciones.flatMap((p) => [p.nombre, ...p.roles.map((r) => r.rol)])].join(' '))
      return palabras.every((w) => paja.includes(w))
    })
  }, [data, texto, estado])
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const visibles = filtradas.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA)

  const alternar = async (a: ActividadAdmin) => {
    try {
      await cambiar.mutateAsync({ id: a.id, activa: !a.activa })
      toast.success(a.activa ? `${a.nombre} desactivada: ya no se ofrece al programar` : `${a.nombre} activada`)
    } catch (err) {
      toast.error(err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo cambiar')
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Actividades</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Lo que se puede programar: su tiempo estimado, quién puede hacerla (roles) y con qué prioridad se sugiere cada rol. Los cambios rigen para las tareas que se programen desde ahora.
          </p>
        </div>
        {puedeCrear && data && (
          <Button onClick={() => setEditando('nueva')}>
            <Plus />
            Nueva actividad
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar actividad"
            placeholder="Nombre, tipo, participación o rol"
            className="pl-8"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value)
              setPagina(1)
            }}
          />
        </div>
        <Select
          value={estado}
          onValueChange={(v) => {
            setEstado(v as typeof estado)
            setPagina(1)
          }}
        >
          <SelectTrigger aria-label="Estado" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="activas">Activas</SelectItem>
            <SelectItem value="inactivas">Inactivas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <Table className="min-w-[44rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[26%]">Actividad</TableHead>
                  <TableHead className="w-24">Tiempo</TableHead>
                  <TableHead className="w-[22%]">Se usa con · Asignación</TableHead>
                  <TableHead>Quién la hace (prioridad)</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((a) => (
                  <TableRow key={a.id} className={a.activa ? 'align-top' : 'align-top opacity-60'}>
                    <TableCell className="whitespace-normal">
                      <div className="flex items-start gap-2 font-medium">
                        <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: a.tipo.color }} aria-hidden="true" />
                        <span className="break-words">{a.nombre}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-[11px]">
                          {a.tipo.nombre}
                        </Badge>
                        {!a.activa && <Badge variant="secondary">Inactiva</Badge>}
                        {a.deSistema && (
                          <Badge variant="outline" className="text-[11px]">
                            Del sistema
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{duracion(a.minutosEstimados)}</TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      <div>{NOMBRE_APLICA_A[a.aplicaA]}</div>
                      <div className="text-xs text-muted-foreground">{NOMBRE_MODO_ASIGNACION[a.modoAsignacion]}</div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <ul className="flex flex-col gap-2 text-sm">
                        {a.participaciones.map((p) => (
                          <li key={p.id} className="flex flex-col gap-1">
                            <span>
                              <span className="font-medium">{p.nombre}</span>
                              <span className="text-xs text-muted-foreground">
                                {' '}
                                · {p.cantidad} {p.cantidad === 1 ? 'persona' : 'personas'}
                                {p.obligatoria ? '' : ' · opcional'}
                              </span>
                            </span>
                            <span className="flex flex-wrap gap-1">
                              {p.roles.map((r) => (
                                <Badge key={r.rolId} variant={r.prioridad.nivel === 1 ? 'secondary' : 'outline'} className="text-[11px]">
                                  {r.rol} · {r.prioridad.nombre}
                                </Badge>
                              ))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {puedeEditar && (
                          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${a.nombre}`} onClick={() => setEditando(a)}>
                            <Pencil />
                          </Button>
                        )}
                        {puedeDesactivar && !a.deSistema && (
                          <Button variant="ghost" size="icon-sm" aria-label={a.activa ? `Desactivar ${a.nombre}` : `Activar ${a.nombre}`} title={a.activa ? 'Desactivar' : 'Activar'} onClick={() => void alternar(a)}>
                            <Power />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtradas.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">Ninguna actividad coincide con la búsqueda.</p>}
            {filtradas.length > 0 && (
              <div className="flex items-center justify-between gap-4 border-t px-4 py-3 text-sm text-muted-foreground">
                <span>
                  {filtradas.length} {filtradas.length === 1 ? 'actividad' : 'actividades'}
                </span>
                <div className="flex items-center gap-2">
                  <span>
                    Página {paginaActual} de {totalPaginas}
                  </span>
                  <Button variant="outline" size="icon-sm" aria-label="Página anterior" disabled={paginaActual <= 1} onClick={() => setPagina(paginaActual - 1)}>
                    <ChevronLeft />
                  </Button>
                  <Button variant="outline" size="icon-sm" aria-label="Página siguiente" disabled={paginaActual >= totalPaginas} onClick={() => setPagina(paginaActual + 1)}>
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {editando && data && (
        <DialogoActividad
          key={editando === 'nueva' ? 'nueva' : editando.id}
          catalogo={data}
          actividad={editando === 'nueva' ? null : editando}
          abierto
          onAbiertoChange={(abierto) => !abierto && setEditando(null)}
        />
      )}
    </div>
  )
}
