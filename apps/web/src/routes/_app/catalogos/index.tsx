import { NOMBRE_APLICA_A, NOMBRE_MODO_ASIGNACION, type ActividadAdmin } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Pencil, Plus, Power } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

function Catalogos() {
  const { data } = useQuery(actividadesAdminQuery)
  const puedeCrear = usePermiso('catalogos.crear')
  const puedeEditar = usePermiso('catalogos.editar')
  const puedeDesactivar = usePermiso('catalogos.desactivar')
  const cambiar = useCambiarActiva()
  const [editando, setEditando] = useState<ActividadAdmin | 'nueva' | null>(null)

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

      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Actividad</TableHead>
                  <TableHead>Tiempo</TableHead>
                  <TableHead>Se usa con</TableHead>
                  <TableHead>Asignación</TableHead>
                  <TableHead>Quién la hace (prioridad)</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.actividades.map((a) => (
                  <TableRow key={a.id} className={a.activa ? '' : 'opacity-60'}>
                    <TableCell className="align-top">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: a.tipo.color }} aria-hidden="true" />
                        {a.nombre}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-[11px]">
                          {a.tipo.nombre}
                        </Badge>
                        {!a.activa && <Badge variant="secondary">Inactiva</Badge>}
                        {a.deSistema && <Badge variant="outline" className="text-[11px]">Del sistema</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="align-top whitespace-nowrap">{duracion(a.minutosEstimados)}</TableCell>
                    <TableCell className="align-top">{NOMBRE_APLICA_A[a.aplicaA]}</TableCell>
                    <TableCell className="align-top text-sm text-muted-foreground">{NOMBRE_MODO_ASIGNACION[a.modoAsignacion]}</TableCell>
                    <TableCell className="align-top">
                      <ul className="flex flex-col gap-1.5 text-sm">
                        {a.participaciones.map((p) => (
                          <li key={p.id}>
                            <span className="font-medium">{p.nombre}</span>
                            <span className="text-muted-foreground">
                              {' '}
                              ({p.cantidad}
                              {p.obligatoria ? '' : ', opcional'})
                            </span>
                            <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
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
                    <TableCell className="align-top">
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
