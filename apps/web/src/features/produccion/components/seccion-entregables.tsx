import { NOMBRE_ESTADO_TAREA, type EntregableItem, type TrabajoDetalle } from '@grupoes/shared'
import { CalendarClock, ClipboardCheck, EllipsisVertical, Loader2, PackageCheck, Pencil, Plus, Send, Sparkles, Trash2, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BotonComentarios } from '@/features/comentarios/components/boton-comentarios'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ApiError } from '@/lib/api'
import { duracion, formatearFecha, formatearFechaHora, haceCuanto, nombreCompleto } from '@/lib/formato'
import { usePermiso } from '@/lib/permisos'
import { useSesion } from '@/stores/sesion'
import { cn } from '@/lib/utils'
import { useEliminarEntregable, useEnviarRevision, useGenerarPlan } from '../api'
import { DialogoEntregable, DialogoEntregar, DialogoRespuestaCliente, DialogoRevisar, DialogoTareaEntregable } from './dialogos-entregable'
import { InsigniaEstadoEntregable, PuntoSemaforo } from './insignias'

const mensaje = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo completar la acción')

export function SeccionEntregables({ t }: { t: TrabajoDetalle }) {
  const puedeCrear = usePermiso('entregables.crear')
  const generar = useGenerarPlan(t.id)
  const [nuevo, setNuevo] = useState(false)
  const cerrado = ['finalizado', 'cancelado'].includes(t.estado)
  const sinEquipo = !t.equipo.some((m) => m.funcion === 'auxiliar_principal')

  const generarPlan = async () => {
    try {
      const r = await generar.mutateAsync(undefined)
      toast.success(`Plan generado: ${r.entregables.length} entregables en la cola del auxiliar principal`)
    } catch (err) {
      toast.error(mensaje(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackageCheck className="size-4" />
          Entregables
        </CardTitle>
        <CardDescription>
          {t.entregables.length === 0
            ? 'Avances parciales y entrega final, cada uno con su fecha límite.'
            : `${t.entregables.filter((e) => e.estado === 'cerrado').length} de ${t.entregables.length} cerrados`}
        </CardDescription>
        {puedeCrear && !cerrado && t.entregables.length > 0 && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setNuevo(true)}>
              <Plus />
              Entregable
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {t.entregables.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageCheck />
              </EmptyMedia>
              <EmptyTitle>Sin plan de producción</EmptyTitle>
              <EmptyDescription>
                {sinEquipo
                  ? 'Arma el equipo primero: las tareas van a la cola del auxiliar principal.'
                  : t.hayPlantilla
                    ? `Genera los entregables y tareas de la plantilla de "${t.tipoTrabajo.nombre}" y luego ajústalos.`
                    : 'Este tipo de trabajo no tiene plantilla: agrega los entregables a mano.'}
              </EmptyDescription>
            </EmptyHeader>
            {puedeCrear && !cerrado && (
              <EmptyContent className="flex-row justify-center">
                {t.hayPlantilla && (
                  <Button onClick={() => void generarPlan()} disabled={sinEquipo || generar.isPending}>
                    {generar.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    Generar desde la plantilla
                  </Button>
                )}
                <Button variant="outline" onClick={() => setNuevo(true)}>
                  <Plus />
                  Agregar a mano
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <ol className="flex flex-col gap-3">
            {t.entregables.map((e) => (
              <Entregable key={e.id} t={t} e={e} />
            ))}
          </ol>
        )}
      </CardContent>
      {nuevo && <DialogoEntregable trabajo={t} entregable={null} abierto onAbiertoChange={setNuevo} />}
    </Card>
  )
}

type Dialogo = 'editar' | 'tarea' | 'revisar' | 'entregar' | 'respuesta' | null

function Entregable({ t, e }: { t: TrabajoDetalle; e: EntregableItem }) {
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const [verHistorial, setVerHistorial] = useState(false)
  const usuarioId = useSesion((s) => s.usuario?.id)
  const puedeEditar = usePermiso('entregables.editar')
  const puedeCrear = usePermiso('entregables.crear')
  const puedeProgramar = usePermiso('programacion.programar')
  const puedeEnviar = usePermiso('entregables.enviar_revision')
  const puedeAprobar = usePermiso('entregables.aprobar')
  const puedeObservar = usePermiso('entregables.observar')
  const puedeRevisar = puedeAprobar || puedeObservar
  const puedeEntregar = usePermiso('entregables.registrar_entrega')
  const enviar = useEnviarRevision(e.id)
  const eliminar = useEliminarEntregable(e.id)

  const activas = e.tareas.filter((x) => ['por_asignar', 'pendiente', 'en_proceso'].includes(x.estado))
  const enElaboracion = ['pendiente', 'en_proceso', 'observado', 'observado_cliente'].includes(e.estado)
  const esDelEquipo = t.equipo.some((m) => m.usuario.id === usuarioId)
  const cerrar = (abierto: boolean) => !abierto && setDialogo(null)

  const enviarRevision = async () => {
    try {
      await enviar.mutateAsync(undefined)
      toast.success(`${e.nombre} enviado a revisión`)
    } catch (err) {
      toast.error(mensaje(err))
    }
  }
  const borrar = async () => {
    try {
      await eliminar.mutateAsync(undefined)
      toast.success('Entregable eliminado')
    } catch (err) {
      toast.error(mensaje(err))
    }
  }

  const accion = (() => {
    if (enElaboracion && puedeEnviar && (esDelEquipo || puedeEditar)) {
      return (
        <Button size="sm" variant="outline" onClick={() => void enviarRevision()} disabled={activas.length > 0 || enviar.isPending} title={activas.length ? 'Completa primero las tareas pendientes' : undefined}>
          {enviar.isPending ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar a revisión
        </Button>
      )
    }
    if (e.estado === 'en_revision' && puedeRevisar) {
      return (
        <Button size="sm" onClick={() => setDialogo('revisar')}>
          <ClipboardCheck />
          Revisar
        </Button>
      )
    }
    if (e.estado === 'aprobado' && puedeEntregar) {
      return (
        <Button size="sm" onClick={() => setDialogo('entregar')}>
          <Send />
          Registrar entrega
        </Button>
      )
    }
    if (e.estado === 'entregado' && puedeEntregar) {
      return (
        <Button size="sm" variant="outline" onClick={() => setDialogo('respuesta')}>
          <UserCheck />
          Respuesta del cliente
        </Button>
      )
    }
    return null
  })()

  const menu = e.estado !== 'cerrado' && (puedeEditar || puedeProgramar || puedeCrear)

  return (
    <li className={cn('rounded-lg border', e.estado === 'cerrado' && 'bg-muted/30')}>
      <div className="flex flex-wrap items-start gap-3 p-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{e.nombre}</span>
            {e.esFinal && <Badge variant="secondary">Final</Badge>}
            <InsigniaEstadoEntregable estado={e.estado} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" />
              Vence el {formatearFecha(e.fechaLimite)}
            </span>
            {e.semaforo && (
              <span className="inline-flex items-center gap-1.5">
                <PuntoSemaforo semaforo={e.semaforo} fin={e.finPlan} />
                {e.finPlan ? `Termina ${formatearFechaHora(e.finPlan)}` : 'Sin fecha en la cola'}
              </span>
            )}
            {(e.similitud !== null || e.ia !== null) && (
              <span>
                Similitud {e.similitud ?? '—'} % · IA {e.ia ?? '—'} %
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {accion}
          <BotonComentarios entidad="entregable" entidadId={e.id} titulo={e.nombre} />
          {menu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${e.nombre}`}>
                  <EllipsisVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {puedeProgramar && (
                  <DropdownMenuItem onSelect={() => setDialogo('tarea')}>
                    <Plus />
                    Agregar tarea
                  </DropdownMenuItem>
                )}
                {puedeEditar && (
                  <DropdownMenuItem onSelect={() => setDialogo('editar')}>
                    <Pencil />
                    Editar
                  </DropdownMenuItem>
                )}
                {puedeCrear && e.estado === 'pendiente' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => void borrar()}>
                      <Trash2 />
                      Eliminar
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {e.tareas.length > 0 && (
        <ul className="divide-y border-t">
          {e.tareas.map((x) => {
            const activa = ['por_asignar', 'pendiente', 'en_proceso'].includes(x.estado)
            return (
              <li key={x.id} className={cn('flex items-start gap-2.5 px-3 py-2 text-sm', !activa && 'text-muted-foreground')}>
                <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: x.actividad.color }} aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className={cn(x.estado === 'completada' && 'line-through')}>{x.titulo ?? x.actividad.nombre}</span>
                  <span className="text-xs text-muted-foreground">
                    {nombreCompleto(x.responsable) ?? 'Sin responsable'} · {duracion(x.minutos)}
                    {x.estado !== 'pendiente' && ` · ${NOMBRE_ESTADO_TAREA[x.estado]}`}
                  </span>
                  {x.notas && activa && <span className="mt-1 text-xs whitespace-pre-line text-foreground">{x.notas}</span>}
                </div>
                {x.plan && x.semaforo && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <PuntoSemaforo semaforo={x.semaforo} dias={x.holguraDias} fin={x.plan.fin} />
                    {formatearFechaHora(x.plan.fin)}
                  </span>
                )}
                {x.semaforo === 'sin_plan' && <PuntoSemaforo semaforo="sin_plan" />}
              </li>
            )
          })}
        </ul>
      )}

      {(e.revisiones.length > 0 || e.entregas.length > 0) && (
        <div className="border-t px-3 py-2">
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => setVerHistorial((v) => !v)}>
            {verHistorial ? 'Ocultar historial' : `Revisiones y entregas (${e.revisiones.length + e.entregas.length})`}
          </Button>
          {verHistorial && (
            <ul className="mt-1 flex flex-col gap-2 text-sm">
              {[
                ...e.revisiones.map((r) => ({
                  fecha: r.fecha,
                  texto: `${r.resultado === 'aprobado' ? 'Aprobado' : 'Observado'} por ${nombreCompleto(r.revisor)}`,
                  detalle: r.observaciones,
                })),
                ...e.entregas.map((x) => ({
                  fecha: x.fecha,
                  texto: `Entregado al cliente por ${nombreCompleto(x.enviadoPor)}${x.respuesta === 'conforme' ? ' · conforme' : x.respuesta === 'observado' ? ' · con observaciones' : ''}`,
                  detalle: x.observacionesCliente ?? x.notas,
                })),
              ]
                .sort((a, b) => b.fecha.localeCompare(a.fecha))
                .map((h) => (
                  <li key={`${h.fecha}${h.texto}`} className="flex flex-col">
                    <span>
                      {h.texto} <span className="text-xs text-muted-foreground">{haceCuanto(h.fecha)}</span>
                    </span>
                    {h.detalle && <span className="text-xs whitespace-pre-line text-muted-foreground">{h.detalle}</span>}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {dialogo === 'editar' && <DialogoEntregable trabajo={t} entregable={e} abierto onAbiertoChange={cerrar} />}
      {dialogo === 'tarea' && <DialogoTareaEntregable trabajo={t} entregable={e} abierto onAbiertoChange={cerrar} />}
      {dialogo === 'revisar' && <DialogoRevisar entregable={e} abierto onAbiertoChange={cerrar} />}
      {dialogo === 'entregar' && <DialogoEntregar entregable={e} trabajo={t} abierto onAbiertoChange={cerrar} />}
      {dialogo === 'respuesta' && <DialogoRespuestaCliente entregable={e} abierto onAbiertoChange={cerrar} />}
    </li>
  )
}
