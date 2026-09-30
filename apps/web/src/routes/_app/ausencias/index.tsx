import { ESTADOS_AUSENCIA, type AusenciaItem, type EstadoAusencia } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CalendarOff, Check, MoreHorizontal, Plus, Stethoscope, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ausenciasQuery } from '@/features/agenda/api'
import { describirAusencia } from '@/features/agenda/components/ausencias-formato'
import { DialogoAusencia, DialogoResolverAusencia } from '@/features/agenda/components/dialogos-ausencia'
import { InsigniaEstadoAusencia, InsigniaTipoAusencia } from '@/features/agenda/components/insignias'
import { formatearFecha, haceCuanto, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { useAlcance, usePermiso } from '@/lib/permisos'
import { useSesion } from '@/stores/sesion'

export const Route = createFileRoute('/_app/ausencias/')({
  validateSearch: z.object({
    estado: z.enum([...ESTADOS_AUSENCIA, 'todas']).optional().catch(undefined),
    nueva: z.boolean().optional().catch(undefined),
  }),
  beforeLoad: () => exigirPermiso('ausencias.ver'),
  component: PaginaAusencias,
})

type Accion = 'aprobar' | 'rechazar' | 'anular'

function PaginaAusencias() {
  const { estado, nueva } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const usuarioId = useSesion((s) => s.usuario?.id)
  const puedeAprobar = usePermiso('ausencias.aprobar')
  const puedeRegistrar = usePermiso('ausencias.crear')
  const puedeSolicitar = usePermiso('ausencias.solicitar')
  const veTodas = useAlcance('ausencias.ver') === 'todos'

  const vista = estado ?? (puedeAprobar ? 'solicitada' : 'todas')
  const { data, isPending } = useQuery(ausenciasQuery({ estado: vista === 'todas' ? undefined : (vista as EstadoAusencia) }))
  const [registrando, setRegistrando] = useState(false)
  const [resolviendo, setResolviendo] = useState<{ ausencia: AusenciaItem; accion: Accion } | null>(null)

  const puede = (a: AusenciaItem, accion: Accion) => {
    if (accion !== 'anular') return puedeAprobar && a.estado === 'solicitada'
    if (a.estado !== 'solicitada' && a.estado !== 'aprobada') return false
    return puedeAprobar || (a.estado === 'solicitada' && a.solicitadaPor.id === usuarioId) || (a.tipo === 'descanso_medico' && puedeRegistrar)
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Ausencias</h1>
          <p className="text-sm text-muted-foreground">
            Vacaciones, permisos y descansos médicos. Una ausencia aprobada bloquea la agenda: ese día no se puede programar a la persona.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeRegistrar && (
            <Button variant="outline" onClick={() => setRegistrando(true)}>
              {puedeAprobar ? <Plus /> : <Stethoscope />}
              {puedeAprobar ? 'Registrar ausencia' : 'Registrar descanso médico'}
            </Button>
          )}
          {puedeSolicitar && (
            <Button onClick={() => void navigate({ search: (x) => ({ ...x, nueva: true }) })}>
              <CalendarOff />
              Solicitar
            </Button>
          )}
        </div>
      </div>

      <ToggleGroup
        type="single"
        variant="outline"
        value={vista}
        onValueChange={(v) => v && void navigate({ search: (x) => ({ ...x, estado: v as EstadoAusencia | 'todas' }), replace: true })}
        className="w-fit"
      >
        <ToggleGroupItem value="solicitada">Por aprobar</ToggleGroupItem>
        <ToggleGroupItem value="aprobada">Aprobadas</ToggleGroupItem>
        <ToggleGroupItem value="todas">Todas</ToggleGroupItem>
      </ToggleGroup>

      {isPending || !data ? (
        <Skeleton className="h-64" />
      ) : data.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarOff />
            </EmptyMedia>
            <EmptyTitle>Sin ausencias en esta vista</EmptyTitle>
            <EmptyDescription>Se muestran las que terminan desde hace 30 días.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {veTodas && <TableHead>Persona</TableHead>}
                <TableHead>Tipo</TableHead>
                <TableHead>Fechas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden md:table-cell">Solicitud</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((a) => {
                const acciones = (['aprobar', 'rechazar', 'anular'] as const).filter((x) => puede(a, x))
                return (
                  <TableRow key={a.id}>
                    {veTodas && <TableCell className="font-medium">{nombreCompleto(a.usuario)}</TableCell>}
                    <TableCell>
                      <InsigniaTipoAusencia tipo={a.tipo} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{describirAusencia(a)}</span>
                        {a.motivo && <span className="max-w-72 truncate text-xs text-muted-foreground">{a.motivo}</span>}
                        {a.tareasAfectadas.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex w-fit items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                                <TriangleAlert className="size-3.5" />
                                {a.tareasAfectadas.length} {a.tareasAfectadas.length === 1 ? 'actividad programada' : 'actividades programadas'}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {a.tareasAfectadas.map((t) => (
                                <p key={t.id}>
                                  {t.actividad} · {formatearFecha(t.fecha)}
                                  {t.hora && `, ${t.hora}`}
                                </p>
                              ))}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <InsigniaEstadoAusencia estado={a.estado} />
                        {a.observacion && <span className="max-w-56 truncate text-xs text-muted-foreground">{a.observacion}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {a.solicitadaPor.id === a.usuario.id ? 'Solicitada' : `Registrada por ${nombreCompleto(a.solicitadaPor)}`} {haceCuanto(a.solicitadaEn)}
                      {a.resueltaPor && a.solicitadaPor.id !== a.resueltaPor.id && (
                        <div>
                          {a.estado === 'aprobada' ? 'Aprobada' : a.estado === 'rechazada' ? 'Rechazada' : 'Anulada'} por {nombreCompleto(a.resueltaPor)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {acciones.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Acciones">
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {acciones.includes('aprobar') && (
                              <DropdownMenuItem onSelect={() => setResolviendo({ ausencia: a, accion: 'aprobar' })}>
                                <Check /> Aprobar
                              </DropdownMenuItem>
                            )}
                            {acciones.includes('rechazar') && (
                              <DropdownMenuItem onSelect={() => setResolviendo({ ausencia: a, accion: 'rechazar' })}>
                                <X /> Rechazar
                              </DropdownMenuItem>
                            )}
                            {acciones.includes('anular') && (
                              <DropdownMenuItem variant="destructive" onSelect={() => setResolviendo({ ausencia: a, accion: 'anular' })}>
                                Anular
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {puedeSolicitar && (
        <DialogoAusencia
          modo="solicitar"
          abierto={Boolean(nueva)}
          onAbiertoChange={(v) => !v && void navigate({ search: (x) => ({ ...x, nueva: undefined }), replace: true })}
        />
      )}
      {puedeRegistrar && (
        <DialogoAusencia
          modo="registrar"
          tiposPermitidos={puedeAprobar ? undefined : ['descanso_medico']}
          abierto={registrando}
          onAbiertoChange={setRegistrando}
        />
      )}
      {resolviendo && (
        <DialogoResolverAusencia
          key={`${resolviendo.ausencia.id}-${resolviendo.accion}`}
          ausencia={resolviendo.ausencia}
          accion={resolviendo.accion}
          abierto
          onAbiertoChange={(v) => !v && setResolviendo(null)}
        />
      )}
    </div>
  )
}
