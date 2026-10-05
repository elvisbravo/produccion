import { formatearCelular, NOMBRE_ESTADO_TRABAJO } from '@grupoes/shared'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { proveedorQuery } from '@/features/proveedores/api'
import { DialogoProveedor } from '@/features/proveedores/components/dialogo-proveedor'
import { trabajosQuery } from '@/features/trabajos/api'
import { EtiquetasSeguimiento } from '@/features/trabajos/components/insignias'
import { ApiError } from '@/lib/api'
import { formatearFecha } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { usePermiso } from '@/lib/permisos'

export const Route = createFileRoute('/_app/proveedores/$id')({
  beforeLoad: () => exigirPermiso('proveedores.ver'),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(proveedorQuery(params.id))
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 400)) throw notFound()
      throw error
    }
  },
  component: FichaProveedor,
})

function FichaProveedor() {
  const { id } = Route.useParams()
  const { data: p } = useSuspenseQuery(proveedorQuery(id))
  const puedeVerTrabajos = usePermiso('trabajos.ver')
  const puedeEditar = usePermiso('proveedores.editar')
  const puedeRegistrar = usePermiso('trabajos.registrar_de_proveedor')
  const { data: trabajos, isPending } = useQuery({ ...trabajosQuery({ proveedorId: id, porPagina: 100 }), enabled: puedeVerTrabajos })
  const [editando, setEditando] = useState(false)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col gap-3">
        <Link to="/proveedores" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Proveedores
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {p.nombres} {p.apellidos}
              {!p.activo && (
                <Badge variant="secondary" className="ml-2 align-middle">
                  Inactivo
                </Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              {[p.celular && formatearCelular(p.celular), p.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
            </p>
            {p.notas && <p className="max-w-2xl text-sm">{p.notas}</p>}
          </div>
          <div className="flex gap-2">
            {puedeEditar && (
              <Button variant="outline" onClick={() => setEditando(true)}>
                <Pencil />
                Editar
              </Button>
            )}
            {puedeRegistrar && p.activo && (
              <Button asChild>
                <Link to="/trabajos/de-proveedor" search={{ proveedor: p.id }}>
                  <Plus />
                  Registrar trabajo
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trabajos</CardTitle>
          <CardDescription>{p.trabajos === 0 ? 'Aún no entregó trabajos.' : `${p.trabajos} ${p.trabajos === 1 ? 'trabajo' : 'trabajos'} registrados.`}</CardDescription>
        </CardHeader>
        {puedeVerTrabajos && p.trabajos > 0 && (
          <CardContent className="p-0">
            {isPending ? (
              <Skeleton className="m-4 h-32" />
            ) : (
              <Table className="min-w-[36rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Trabajo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Entrega</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trabajos?.datos.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Link to="/trabajos/$id" params={{ id: t.id }} className="font-mono text-xs font-medium hover:underline">
                          {t.codigo}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="font-medium">{t.titulo ?? t.tipoTrabajo}</div>
                        <div className="text-xs text-muted-foreground">{[t.tipoTrabajo, t.universidad, t.carrera].filter(Boolean).join(' · ')}</div>
                      </TableCell>
                      <TableCell>
                        <span className="sr-only">{NOMBRE_ESTADO_TRABAJO[t.estado]}</span>
                        <EtiquetasSeguimiento seguimiento={t.seguimiento} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatearFecha(t.fechaLimite)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        )}
      </Card>

      {editando && <DialogoProveedor proveedor={p} abierto onAbiertoChange={setEditando} />}
    </div>
  )
}
