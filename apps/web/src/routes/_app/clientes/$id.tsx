import { enlaceWhatsapp, formatearCelular, NOMBRE_TIPO_DOCUMENTO } from '@grupoes/shared'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { personaQuery } from '@/features/prospectos/api'
import { trabajosQuery } from '@/features/trabajos/api'
import { EtiquetasSeguimiento } from '@/features/trabajos/components/insignias'
import { ApiError } from '@/lib/api'
import { formatearFecha, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'

export const Route = createFileRoute('/_app/clientes/$id')({
  beforeLoad: () => exigirPermiso('trabajos.ver'),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(personaQuery(params.id))
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 400)) throw notFound()
      throw error
    }
  },
  component: FichaCliente,
})

/** Un cliente con todos sus trabajos: los suyos y los que le entregó un proveedor. */
function FichaCliente() {
  const { id } = Route.useParams()
  const { data: p } = useSuspenseQuery(personaQuery(id))
  const { data: trabajos, isPending } = useQuery(trabajosQuery({ personaId: id, porPagina: 100 }))

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col gap-3">
        <Link to="/trabajos" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Trabajos
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{nombreCompleto(p) ?? formatearCelular(p.celular)}</h1>
          <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <dt className="sr-only">Celular</dt>
              <dd className="font-mono">{formatearCelular(p.celular)}</dd>
              <Button variant="ghost" size="icon-xs" asChild>
                <a href={enlaceWhatsapp(p.celular)} target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp">
                  <MessageCircle />
                </a>
              </Button>
            </div>
            {p.tipoDocumento && p.numeroDocumento && (
              <div>
                {NOMBRE_TIPO_DOCUMENTO[p.tipoDocumento]} {p.numeroDocumento}
              </div>
            )}
            {p.email && <div>{p.email}</div>}
          </dl>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trabajos</CardTitle>
          <CardDescription>{isPending ? 'Cargando…' : `${trabajos?.total ?? 0} ${trabajos?.total === 1 ? 'trabajo' : 'trabajos'}, propios y entregados por proveedores.`}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isPending ? (
            <Skeleton className="m-4 h-32" />
          ) : (
            <Table className="min-w-[38rem]">
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
                      {t.proveedor && (
                        <Badge variant="outline" className="mt-1 text-[11px]">
                          Entregado por el proveedor {t.proveedor.nombres} {t.proveedor.apellidos}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <EtiquetasSeguimiento seguimiento={t.seguimiento} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatearFecha(t.fechaLimite)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
