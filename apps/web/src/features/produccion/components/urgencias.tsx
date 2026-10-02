import { diaEnLima, MAX_PERSONAS_URGENTE, NOMBRE_ESTADO_URGENTE, type ImpactoItem, type ResultadoPlan, type SolicitudUrgenteItem } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertCircle, ArrowRight, Flame, Loader2, PauseCircle, Pin, TriangleAlert, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { diasHasta, duracion, formatearFecha, formatearFechaHora, haceCuanto, nombreCompleto } from '@/lib/formato'
import { usePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { propuestaQuery, repartoQuery, urgentesDeTrabajoQuery, urgentesQuery, useEjecutarUrgente, useRechazarUrgente, useSolicitarUrgente } from '../api-contingencias'
import { PuntoSemaforo } from './insignias'

/** "la cola de Ana" o "las colas de Ana y Luis". */
const colasDe = (s: SolicitudUrgenteItem) => {
  const nombres = s.asignaciones.length > 0 ? s.asignaciones.map((a) => nombreCompleto(a.usuario)) : [nombreCompleto(s.usuarioAsignado)]
  return `${nombres.length > 1 ? 'las colas de' : 'la cola de'} ${nombres.join(', ').replace(/, ([^,]*)$/, ' y $1')}`
}

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
                ? `Insertado como urgente en ${colasDe(ultima)}`
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
                  {s.estado === 'ejecutada' ? `en ${colasDe(s)}` : s.observacion} · {haceCuanto(s.resueltaEn ?? s.solicitadaEn)}
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

const CLAVE_SIN_ENTREGABLE = 'sin-entregable'
const claveDe = (entregableId: string | null) => entregableId ?? CLAVE_SIN_ENTREGABLE

function DialogoEjecutarUrgente({ solicitud: s, onCerrar }: { solicitud: SolicitudUrgenteItem; onCerrar: () => void }) {
  const { data: propuesta } = useQuery(propuestaQuery(s.id))
  const [observacion, setObservacion] = useState('')
  const [forzar, setForzar] = useState(false)
  const puedeForzar = usePermiso('trabajos.fijar_fechas')
  const [error, setError] = useState<string | null>(null)
  // Mientras no se cambie nada a mano, se usa el reparto sugerido.
  const [manual, setManual] = useState<Record<string, string> | null>(null)
  const sugerido = Object.fromEntries((propuesta?.sugerencia ?? []).map((r) => [claveDe(r.entregableId), r.usuarioId]))
  const asignado = manual ?? sugerido
  const bloques = propuesta?.bloques ?? []
  const completo = bloques.length > 0 && bloques.every((b) => asignado[claveDe(b.entregableId)])
  const reparto = completo ? bloques.map((b) => ({ entregableId: b.entregableId, usuarioId: asignado[claveDe(b.entregableId)] })) : null
  const impacto = useQuery({ ...repartoQuery(s.id, reparto ?? []), enabled: Boolean(reparto) })
  const ejecutar = useEjecutarUrgente(s.id)
  const personas = new Set(Object.values(asignado))
  // Quienes pueden tomar todo el trabajo (para "todo a una persona").
  const paraTodo = bloques.length ? bloques[0].elegibles.filter((u) => bloques.every((b) => b.elegibles.some((e) => e.id === u.id))) : []

  const confirmar = async () => {
    if (!reparto) return
    setError(null)
    try {
      await ejecutar.mutateAsync({ reparto, observacion: observacion || undefined, forzarFechasFijas: forzar || undefined })
      toast.success(personas.size > 1 ? `${s.trabajo.codigo} repartido entre ${personas.size} personas` : `${s.trabajo.codigo} insertado primero en la cola`)
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
            Cada entregable pasa primero en la cola de la persona que elijas; puedes repartirlos entre hasta {MAX_PERSONAS_URGENTE} personas para terminar antes. Revisa el impacto antes de confirmar.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!propuesta ? (
          <Skeleton className="h-32" />
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setManual(null)} disabled={manual === null}>
                <Wand2 />
                Usar el reparto sugerido
              </Button>
              <Field className="w-56">
                <FieldLabel htmlFor="urg-todo" className="text-xs text-muted-foreground">
                  O todo a una sola persona
                </FieldLabel>
                <Select value="" onValueChange={(uid) => setManual(Object.fromEntries(bloques.map((b) => [claveDe(b.entregableId), uid])))}>
                  <SelectTrigger id="urg-todo" size="sm" className="w-full">
                    <SelectValue placeholder="Elegir…" />
                  </SelectTrigger>
                  <SelectContent>
                    {paraTodo.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {nombreCompleto(u)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <span className="ml-auto text-xs text-muted-foreground">
                {personas.size} {personas.size === 1 ? 'persona' : 'personas'} (máximo {MAX_PERSONAS_URGENTE})
              </span>
            </div>

            <ul className="divide-y rounded-lg border text-sm">
              {bloques.map((b) => {
                const clave = claveDe(b.entregableId)
                const otros = new Set(Object.entries(asignado).filter(([k]) => k !== clave).map(([, v]) => v))
                return (
                  <li key={clave} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{b.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.tareas} {b.tareas === 1 ? 'tarea' : 'tareas'} · {duracion(b.minutos)}
                        {b.fechaLimite && ` · vence el ${formatearFecha(b.fechaLimite)}`}
                        {b.responsableActual && ` · hoy: ${nombreCompleto(b.responsableActual)}`}
                      </p>
                    </div>
                    {b.elegibles.length === 0 ? (
                      <span className="text-xs text-destructive">Nadie puede tomarlo</span>
                    ) : (
                      <Select value={asignado[clave] ?? ''} onValueChange={(uid) => setManual({ ...asignado, [clave]: uid })}>
                        <SelectTrigger aria-label={`Quién toma ${b.nombre}`} className="w-56">
                          <SelectValue placeholder="Elegir…" />
                        </SelectTrigger>
                        <SelectContent>
                          {b.elegibles.map((u) => (
                            <SelectItem key={u.id} value={u.id} disabled={!otros.has(u.id) && otros.size >= MAX_PERSONAS_URGENTE}>
                              {nombreCompleto(u)}
                              {!otros.has(u.id) && otros.size >= MAX_PERSONAS_URGENTE && <span className="text-muted-foreground"> · ya son {MAX_PERSONAS_URGENTE}</span>}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {reparto &&
          (impacto.isPending ? (
            <Skeleton className="h-40" />
          ) : impacto.error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{mensaje(impacto.error)}</AlertDescription>
            </Alert>
          ) : impacto.data ? (
            <div className="flex flex-col gap-4">
              <Alert>
                <TriangleAlert />
                <AlertTitle>Impacto</AlertTitle>
                <AlertDescription>
                  <p>{impacto.data.terminaEl ? `Con este reparto, lo urgente termina el ${formatearFechaHora(impacto.data.terminaEl)}.` : 'Con este reparto, parte de lo urgente no alcanza a planificarse.'}</p>
                  {impacto.data.pasanARojo > 0 && (
                    <p>
                      {impacto.data.pasanARojo} {impacto.data.pasanARojo === 1 ? 'tarea dejaría' : 'tareas dejarían'} de llegar a su fecha. Puedes aceptar el retraso (y avisar al cliente), pasarlas a otra persona o
                      cubrirlas con horas extra.
                    </p>
                  )}
                  {impacto.data.personas.some((p) => p.pausada) && (
                    <p className="flex items-center gap-1">
                      <PauseCircle className="size-3.5" /> Se pausa lo que estaba en proceso (vuelve a la cola).
                    </p>
                  )}
                </AlertDescription>
              </Alert>
              {impacto.data.pasanFijasARojo > 0 && (
                <Alert variant="destructive">
                  <Pin />
                  <AlertTitle>Atrasaría trabajos con fechas inamovibles</AlertTitle>
                  <AlertDescription className="flex flex-col gap-2">
                    <p>
                      {impacto.data.pasanFijasARojo} {impacto.data.pasanFijasARojo === 1 ? 'tarea' : 'tareas'} de {impacto.data.trabajosFijosAfectados.join(', ')} dejarían de llegar a su fecha, y esas fechas no se pueden mover. Cambia el reparto
                      {puedeForzar ? ' o acéptalo de forma expresa:' : ' o pídele a quien pueda fijar fechas que lo autorice.'}
                    </p>
                    {puedeForzar && (
                      <Label className="flex items-center gap-2 font-normal">
                        <Checkbox checked={forzar} onCheckedChange={(v) => setForzar(v === true)} />
                        Entiendo que se atrasarán y lo acepto
                      </Label>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              {impacto.data.personas.map((p) => (
                <section key={p.usuario.id} className="flex flex-col gap-1.5">
                  <h3 className="text-sm font-medium">
                    Cola de {nombreCompleto(p.usuario)} <span className="font-normal text-muted-foreground">· {p.entregables.join(', ')} · {duracion(p.minutos)}</span>
                  </h3>
                  <ol className="divide-y rounded-lg border text-sm">
                    {p.items.map((i) => (
                      <FilaImpacto key={i.tareaId} item={i} />
                    ))}
                  </ol>
                </section>
              ))}
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
          <Button onClick={() => void confirmar()} disabled={!impacto.data || ejecutar.isPending || (impacto.data.pasanFijasARojo > 0 && !forzar)}>
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
        {i.fija && <Pin className="mr-1 inline size-3.5 text-blue-700 dark:text-blue-400" aria-label="Fechas inamovibles" />}
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
