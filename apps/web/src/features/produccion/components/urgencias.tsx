import { diaEnLima, NOMBRE_ESTADO_URGENTE, type ImpactoItem, type ResultadoPlan, type SolicitudUrgenteItem } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertCircle, ArrowRight, Flame, Loader2, PauseCircle, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { candidatosEquipoQuery } from '@/features/trabajos/api'
import { ApiError } from '@/lib/api'
import { diasHasta, duracion, formatearFecha, formatearFechaHora, haceCuanto, nombreCompleto } from '@/lib/formato'
import { usePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { impactoQuery, urgentesDeTrabajoQuery, urgentesQuery, useEjecutarUrgente, useRechazarUrgente, useSolicitarUrgente } from '../api-contingencias'
import { PuntoSemaforo } from './insignias'

const mensaje = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo completar la acción')

/** En el trabajo: botón para que la asistente administrativa autorice la urgencia, y el estado de la última solicitud. */
export function UrgenciaDelTrabajo({ trabajoId, cerrado }: { trabajoId: string; cerrado: boolean }) {
  const puedeSolicitar = usePermiso('programacion.solicitar_urgente')
  const { data } = useQuery(urgentesDeTrabajoQuery(trabajoId))
  const solicitar = useSolicitarUrgente(trabajoId)
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const pendiente = data?.find((s) => s.estado === 'pendiente')
  const ultima = data?.[0]

  const enviar = async () => {
    setError(null)
    try {
      await solicitar.mutateAsync(motivo)
      toast.success('Urgencia autorizada: producción la insertará en la cola')
      setAbierto(false)
      setMotivo('')
    } catch (err) {
      setError(mensaje(err))
    }
  }

  return (
    <>
      {ultima && (ultima.estado === 'pendiente' || diasHasta(diaEnLima(new Date(ultima.resueltaEn ?? ultima.solicitadaEn)), diaEnLima()) > -7) && (
        <Alert className={cn(ultima.estado === 'pendiente' && 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40')}>
          <Flame />
          <AlertTitle>
            {ultima.estado === 'pendiente'
              ? 'Urgencia autorizada, por insertar en producción'
              : ultima.estado === 'ejecutada'
                ? `Insertado como urgente en la cola de ${nombreCompleto(ultima.usuarioAsignado)}`
                : 'La urgencia no se ejecutó'}
          </AlertTitle>
          <AlertDescription>
            {ultima.motivo} · {nombreCompleto(ultima.solicitadaPor)} {haceCuanto(ultima.solicitadaEn)}
            {ultima.observacion && ` · ${ultima.observacion}`}
          </AlertDescription>
        </Alert>
      )}
      {puedeSolicitar && !cerrado && !pendiente && (
        <Button variant="outline" size="sm" className="w-fit" onClick={() => setAbierto(true)}>
          <Flame />
          Marcar como urgente
        </Button>
      )}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Autorizar urgencia</DialogTitle>
            <DialogDescription>
              El trabajo pasa a prioridad urgente y el asistente de producción lo inserta primero en la cola de un auxiliar. Puede atrasar otros trabajos.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor="urg-motivo">¿Por qué es urgente?</FieldLabel>
            <Textarea id="urg-motivo" rows={3} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Ej.: el cliente adelantó su sustentación al 15 de octubre" />
            <FieldDescription>Lo verá producción al ejecutarla.</FieldDescription>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void enviar()} disabled={motivo.trim().length < 5 || solicitar.isPending}>
              {solicitar.isPending && <Loader2 className="animate-spin" />}
              Autorizar urgencia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Bandeja de urgencias para producción. */
export function VistaUrgentes() {
  const { data, isPending } = useQuery(urgentesQuery)
  const puedeInsertar = usePermiso('programacion.insertar_urgente')
  const [ejecutando, setEjecutando] = useState<SolicitudUrgenteItem | null>(null)
  const [rechazando, setRechazando] = useState<SolicitudUrgenteItem | null>(null)

  if (isPending || !data) return <Skeleton className="h-40" />
  const pendientes = data.filter((s) => s.estado === 'pendiente')
  const resueltas = data.filter((s) => s.estado !== 'pendiente').slice(0, 10)

  return (
    <div className="flex flex-col gap-6">
      {pendientes.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Flame />
            </EmptyMedia>
            <EmptyTitle>No hay urgencias por insertar</EmptyTitle>
            <EmptyDescription>La asistente administrativa las autoriza desde el trabajo.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {pendientes.map((s) => (
            <li key={s.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-red-200 bg-card p-3 dark:border-red-900">
              <Flame className="mt-0.5 size-4 text-red-600" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Link to="/trabajos/$id" params={{ id: s.trabajo.id }} className="font-medium hover:underline">
                  <span className="font-mono text-sm">{s.trabajo.codigo}</span> {s.trabajo.titulo}
                </Link>
                <span className="text-sm">{s.motivo}</span>
                <span className="text-xs text-muted-foreground">
                  {nombreCompleto(s.solicitadaPor)} {haceCuanto(s.solicitadaEn)} · entrega final {formatearFecha(s.trabajo.fechaLimite)} · {s.tareasPendientes} tareas ({duracion(s.minutosPendientes)})
                </span>
              </div>
              {puedeInsertar && (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setRechazando(s)}>
                    No ejecutar
                  </Button>
                  <Button size="sm" onClick={() => setEjecutando(s)}>
                    Insertar en una cola
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {resueltas.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">Resueltas recientemente</h3>
          <ul className="divide-y rounded-lg border text-sm">
            {resueltas.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <Badge variant="outline">{NOMBRE_ESTADO_URGENTE[s.estado]}</Badge>
                <span className="font-mono">{s.trabajo.codigo}</span>
                <span className="text-muted-foreground">
                  {s.estado === 'ejecutada' ? `en la cola de ${nombreCompleto(s.usuarioAsignado)}` : s.observacion} · {haceCuanto(s.resueltaEn ?? s.solicitadaEn)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {ejecutando && <DialogoEjecutarUrgente solicitud={ejecutando} onCerrar={() => setEjecutando(null)} />}
      {rechazando && <DialogoRechazarUrgente solicitud={rechazando} onCerrar={() => setRechazando(null)} />}
    </div>
  )
}

const enRiesgo = (r: ResultadoPlan | null) => r?.semaforo === 'rojo' || r?.semaforo === 'sin_plan'

function DialogoEjecutarUrgente({ solicitud: s, onCerrar }: { solicitud: SolicitudUrgenteItem; onCerrar: () => void }) {
  const { data: candidatos } = useQuery(candidatosEquipoQuery)
  const [usuarioId, setUsuarioId] = useState('')
  const [observacion, setObservacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const impacto = useQuery({ ...impactoQuery(s.id, usuarioId), enabled: Boolean(usuarioId) })
  const ejecutar = useEjecutarUrgente(s.id)

  const confirmar = async () => {
    setError(null)
    try {
      await ejecutar.mutateAsync({ usuarioId, observacion: observacion || undefined })
      toast.success(`${s.trabajo.codigo} insertado primero en la cola`)
      onCerrar()
    } catch (err) {
      setError(mensaje(err))
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Insertar {s.trabajo.codigo} como urgente</DialogTitle>
          <DialogDescription>
            Sus tareas pendientes pasan primero en la cola del auxiliar elegido. Revisa el impacto antes de confirmar.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="urg-aux">Auxiliar</FieldLabel>
          <Select value={usuarioId} onValueChange={setUsuarioId}>
            <SelectTrigger id="urg-aux" className="w-full sm:w-80">
              <SelectValue placeholder={candidatos ? 'Elegir…' : 'Cargando…'} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Auxiliares</SelectLabel>
                {candidatos?.auxiliares.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {nombreCompleto(u)}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Jefes de producción</SelectLabel>
                {candidatos?.jefes.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {nombreCompleto(u)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        {usuarioId &&
          (impacto.isPending ? (
            <Skeleton className="h-40" />
          ) : impacto.error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{mensaje(impacto.error)}</AlertDescription>
            </Alert>
          ) : impacto.data ? (
            <div className="flex flex-col gap-3">
              {(impacto.data.pasanARojo > 0 || impacto.data.pausada) && (
                <Alert>
                  <TriangleAlert />
                  <AlertTitle>Impacto</AlertTitle>
                  <AlertDescription>
                    {impacto.data.pasanARojo > 0 && (
                      <p>
                        {impacto.data.pasanARojo} {impacto.data.pasanARojo === 1 ? 'tarea dejaría' : 'tareas dejarían'} de llegar a su fecha. Puedes aceptar el retraso (y avisar al
                        cliente), pasarlas a otra persona o cubrirlas con horas extra.
                      </p>
                    )}
                    {impacto.data.pausada && (
                      <p className="flex items-center gap-1">
                        <PauseCircle className="size-3.5" /> Se pausa «{impacto.data.pausada.titulo}» (vuelve a la cola).
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              <ol className="divide-y rounded-lg border text-sm">
                {impacto.data.items.map((i) => (
                  <FilaImpacto key={i.tareaId} item={i} />
                ))}
              </ol>
            </div>
          ) : null)}

        <Field>
          <FieldLabel htmlFor="urg-obs">Nota (opcional)</FieldLabel>
          <Input id="urg-obs" value={observacion} onChange={(ev) => setObservacion(ev.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void confirmar()} disabled={!impacto.data || ejecutar.isPending}>
            {ejecutar.isPending && <Loader2 className="animate-spin" />}
            Confirmar inserción
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FilaImpacto({ item: i }: { item: ImpactoItem }) {
  const empeora = !enRiesgo(i.antes) && enRiesgo(i.despues)
  return (
    <li className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2', i.esUrgente && 'bg-red-50/60 dark:bg-red-950/30', empeora && 'bg-amber-50/70 dark:bg-amber-950/30')}>
      <span className="min-w-0 flex-1">
        {i.esUrgente && <Flame className="mr-1 inline size-3.5 text-red-600" />}
        {i.titulo} <span className="font-mono text-xs text-muted-foreground">{i.trabajo.codigo}</span>
      </span>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
        {i.antes ? (
          <>
            <PuntoSemaforo semaforo={i.antes.semaforo} dias={i.antes.holguraDias} fin={i.antes.fin} />
            {i.antes.fin ? formatearFechaHora(i.antes.fin) : 'sin fecha'}
          </>
        ) : (
          '—'
        )}
        <ArrowRight className="size-3" />
        <PuntoSemaforo semaforo={i.despues.semaforo} dias={i.despues.holguraDias} fin={i.despues.fin} />
        <span className={cn(empeora && 'font-medium text-amber-800 dark:text-amber-300')}>{i.despues.fin ? formatearFechaHora(i.despues.fin) : 'sin fecha'}</span>
      </span>
    </li>
  )
}

function DialogoRechazarUrgente({ solicitud: s, onCerrar }: { solicitud: SolicitudUrgenteItem; onCerrar: () => void }) {
  const rechazar = useRechazarUrgente(s.id)
  const [observacion, setObservacion] = useState('')
  const confirmar = async () => {
    try {
      await rechazar.mutateAsync(observacion)
      toast.success('Urgencia marcada como no ejecutada')
      onCerrar()
    } catch (err) {
      toast.error(mensaje(err))
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>No ejecutar la urgencia de {s.trabajo.codigo}</DialogTitle>
          <DialogDescription>Queda en la línea de tiempo del trabajo con tu motivo.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="urg-rech">Motivo</FieldLabel>
          <Textarea id="urg-rech" rows={2} value={observacion} onChange={(ev) => setObservacion(ev.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Volver
          </Button>
          <Button variant="destructive" onClick={() => void confirmar()} disabled={observacion.trim().length < 3 || rechazar.isPending}>
            No ejecutar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
