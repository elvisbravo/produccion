import {
  diaEnLima,
  horaEnLima,
  NOMBRE_ESTADO_OBSERVACION,
  type ConsultaPlazo,
  type EstadoObservacion,
  type ObservacionItem,
  type PlazoEvaluado,
} from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { AlertCircle, CheckCircle2, Loader2, MessageSquareWarning, Plus, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  candidatosCorreccionQuery,
  observacionesQuery,
  plazoQuery,
  useConfirmarObservacion,
  useProgramarObservacion,
  useSoltarObservacion,
  useTomarObservacion,
  useValorarObservacion,
} from '@/features/observaciones/api'
import { ApiError } from '@/lib/api'
import { duracion, formatearFechaHora, haceCuanto, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { usePermiso } from '@/lib/permisos'
import { useSesion } from '@/stores/sesion'

const VISTAS: { valor: EstadoObservacion | 'abiertas'; texto: string }[] = [
  { valor: 'abiertas', texto: 'Abiertas' },
  { valor: 'por_valorar', texto: 'Por valorar' },
  { valor: 'valorada', texto: 'Por confirmar' },
  { valor: 'confirmada', texto: 'Por programar' },
  { valor: 'programada', texto: 'Programadas' },
  { valor: 'resuelta', texto: 'Resueltas' },
]

export const Route = createFileRoute('/_app/observaciones/')({
  validateSearch: z.object({ vista: z.enum(['abiertas', 'por_valorar', 'valorada', 'confirmada', 'programada', 'resuelta']).optional().catch(undefined) }),
  beforeLoad: () => exigirPermiso('observaciones.ver'),
  component: Observaciones,
})

const mensajeDe = (err: unknown) => (err instanceof ApiError ? err.message : 'No se pudo completar la acción')

function Observaciones() {
  const { vista: buscada } = Route.useSearch()
  const vista = buscada ?? 'abiertas'
  const navigate = useNavigate({ from: Route.fullPath })
  const { data, isPending } = useQuery(observacionesQuery(vista))
  const puedeValorar = usePermiso('observaciones.valorar')
  const puedeConfirmar = usePermiso('observaciones.confirmar')
  const puedeProgramar = usePermiso('observaciones.programar')
  const yo = useSesion((s) => s.usuario?.id)
  const tomar = useTomarObservacion()
  const soltar = useSoltarObservacion()
  const [valorando, setValorando] = useState<ObservacionItem | null>(null)
  const [confirmando, setConfirmando] = useState<ObservacionItem | null>(null)
  const [programando, setProgramando] = useState<ObservacionItem | null>(null)

  const accion = async (hacer: () => Promise<unknown>, ok: string) => {
    try {
      await hacer()
      toast.success(ok)
    } catch (err) {
      toast.error(mensajeDe(err))
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Observaciones del cliente</h1>
        <p className="text-sm text-muted-foreground">
          Lo que el cliente observó tras la entrega: se valora (tiempo, lista y hora de entrega), la asistente administrativa lo confirma con el cliente y producción programa la corrección.
        </p>
      </div>
      <ToggleGroup type="single" variant="outline" value={vista} onValueChange={(v) => v && void navigate({ search: { vista: v as typeof vista } })} className="flex-wrap justify-start">
        {VISTAS.map((v) => (
          <ToggleGroupItem key={v.valor} value={v.valor}>
            {v.texto}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {isPending || !data ? (
        <Skeleton className="h-40" />
      ) : data.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquareWarning />
            </EmptyMedia>
            <EmptyTitle>Nada por aquí</EmptyTitle>
            <EmptyDescription>Cuando un cliente observe un entregable, aparecerá en esta bandeja.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((o) => (
            <li key={o.id} className="flex flex-col gap-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link to="/trabajos/$id" params={{ id: o.trabajo.id }} className="font-medium hover:underline">
                    {o.trabajo.codigo} · {o.entregable.nombre}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {o.trabajo.titulo ? `${o.trabajo.titulo} · ` : ''}Ronda {o.ronda} · registrada {haceCuanto(o.creadaEn)} por {nombreCompleto(o.creadaPor)}
                  </div>
                </div>
                <Badge variant={o.estado === 'por_valorar' ? 'default' : 'outline'}>{NOMBRE_ESTADO_OBSERVACION[o.estado]}</Badge>
              </div>

              <p className="whitespace-pre-line text-sm">{o.observaciones}</p>

              {o.items.length > 0 && (
                <ol className="list-decimal pl-5 text-sm">
                  {o.items.map((it) => (
                    <li key={it.id} className={it.resuelto ? 'text-muted-foreground line-through' : ''}>
                      {it.texto}
                    </li>
                  ))}
                </ol>
              )}

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                {o.tomadaPor && o.estado === 'por_valorar' && <span>La valora {nombreCompleto(o.tomadaPor)}</span>}
                {o.minutosEstimados && <span>Tiempo estimado: {duracion(o.minutosEstimados)}{o.valoradaPor ? ` (${nombreCompleto(o.valoradaPor)})` : ''}</span>}
                {o.entregaPropuesta && <span>Entrega propuesta: {formatearFechaHora(o.entregaPropuesta)}</span>}
                {o.entregaConfirmada && <span>Acordada con el cliente: {formatearFechaHora(o.entregaConfirmada)}</span>}
                {o.asistente && <span>Asistente: {nombreCompleto(o.asistente)}</span>}
                {o.auxiliarOriginal && <span>Lo hizo: {nombreCompleto(o.auxiliarOriginal)}</span>}
              </div>
              {(o.notaValoracion || o.notaConfirmacion) && (
                <p className="text-xs text-muted-foreground">
                  {[o.notaValoracion && `Valoración: ${o.notaValoracion}`, o.notaConfirmacion && `Confirmación: ${o.notaConfirmacion}`].filter(Boolean).join(' · ')}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {o.estado === 'por_valorar' && puedeValorar && (
                  <>
                    {!o.tomadaPor && (
                      <Button size="sm" variant="outline" disabled={tomar.isPending} onClick={() => accion(() => tomar.mutateAsync(o.id), 'La tomaste para valorarla')}>
                        Tomarla
                      </Button>
                    )}
                    {o.tomadaPor && o.tomadaPor.id === yo && (
                      <Button size="sm" variant="ghost" disabled={soltar.isPending} onClick={() => accion(() => soltar.mutateAsync(o.id), 'La soltaste')}>
                        Soltarla
                      </Button>
                    )}
                    {(!o.tomadaPor || o.tomadaPor.id === yo) && (
                      <Button size="sm" onClick={() => setValorando(o)}>
                        Valorar
                      </Button>
                    )}
                  </>
                )}
                {o.estado === 'valorada' && puedeConfirmar && (
                  <Button size="sm" onClick={() => setConfirmando(o)}>
                    Confirmar con el cliente
                  </Button>
                )}
                {o.estado === 'confirmada' && puedeProgramar && (
                  <Button size="sm" onClick={() => setProgramando(o)}>
                    Programar la corrección
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {valorando && <DialogoValorar observacion={valorando} onCerrar={() => setValorando(null)} />}
      {confirmando && <DialogoConfirmar observacion={confirmando} onCerrar={() => setConfirmando(null)} />}
      {programando && <DialogoProgramar observacion={programando} onCerrar={() => setProgramando(null)} />}
    </div>
  )
}

/** Resultado de comprobar si el tiempo cabe antes de la hora de entrega. */
function AvisoPlazo({ plazo, cargando }: { plazo: PlazoEvaluado | undefined; cargando: boolean }) {
  if (cargando && !plazo) return <Skeleton className="h-12" />
  if (!plazo) return null
  return (
    <Alert variant={plazo.cabe ? 'default' : 'destructive'}>
      {plazo.cabe ? <CheckCircle2 /> : <TriangleAlert />}
      <AlertDescription>
        <p>{plazo.mensaje}</p>
        {!plazo.cabe && plazo.sugerenciaEntrega && (
          <p className="mt-1">
            Propuesta para el cliente: entregar el {formatearFechaHora(plazo.sugerenciaEntrega)}.
          </p>
        )}
        {!plazo.cabe && plazo.extra && (
          <p className="mt-1">
            Horas extra o bono: el {plazo.extra.fecha} de {plazo.extra.horaInicio} a {plazo.extra.horaFin}
            {plazo.extra.cubreTodo ? '' : ' (no cubre todo)'}. La asistente de producción puede proponerlo desde Horas extra.
          </p>
        )}
      </AlertDescription>
    </Alert>
  )
}

function AvisoError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  )
}

function DialogoValorar({ observacion, onCerrar }: { observacion: ObservacionItem; onCerrar: () => void }) {
  const valorar = useValorarObservacion(observacion.id)
  const [horas, setHoras] = useState('2')
  const [fecha, setFecha] = useState(diaEnLima())
  const [hora, setHora] = useState('17:00')
  const [items, setItems] = useState<string[]>([''])
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const minutos = Math.round(Number(horas) * 60)
  const consulta: ConsultaPlazo | null = minutos >= 15 && fecha && /^\d{2}:\d{2}$/.test(hora) ? { minutos, fecha, hora } : null
  const { data: plazo, isFetching } = useQuery(plazoQuery(observacion.id, consulta))

  const guardar = async () => {
    setError(null)
    try {
      await valorar.mutateAsync({ minutos, fecha, hora, items: items.map((i) => i.trim()).filter(Boolean), nota: nota.trim() || undefined })
      toast.success('Valoración enviada a la asistente administrativa y a producción')
      onCerrar()
    } catch (err) {
      setError(mensajeDe(err))
    }
  }

  return (
    <Dialog open onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Valorar observaciones</DialogTitle>
          <DialogDescription>
            {observacion.trabajo.codigo} · {observacion.entregable.nombre}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <AvisoError error={error} />
          <p className="whitespace-pre-line rounded-md bg-muted p-3 text-sm">{observacion.observaciones}</p>

          <Field>
            <FieldLabel>Lista de observaciones</FieldLabel>
            <div className="flex flex-col gap-2">
              {items.map((it, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={it} placeholder="Ej.: falta la estructura del marco teórico" onChange={(ev) => setItems(items.map((x, j) => (j === i ? ev.target.value : x)))} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Quitar" disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setItems([...items, ''])}>
                <Plus /> Agregar observación
              </Button>
            </div>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field>
              <FieldLabel htmlFor="val-h">Tiempo (horas)</FieldLabel>
              <Input id="val-h" type="number" min={0.25} step={0.25} value={horas} onChange={(ev) => setHoras(ev.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="val-f">Entrega</FieldLabel>
              <Input id="val-f" type="date" min={diaEnLima()} value={fecha} onChange={(ev) => setFecha(ev.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="val-t">Hora</FieldLabel>
              <Input id="val-t" type="time" value={hora} onChange={(ev) => setHora(ev.target.value)} />
            </Field>
          </div>
          <AvisoPlazo plazo={plazo} cargando={isFetching} />

          <Field>
            <FieldLabel htmlFor="val-n">Nota (opcional)</FieldLabel>
            <Textarea id="val-n" rows={2} value={nota} onChange={(ev) => setNota(ev.target.value)} />
            <FieldDescription>La verán la asistente administrativa y la de producción.</FieldDescription>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={valorar.isPending || !consulta || items.every((i) => !i.trim())} onClick={guardar}>
            {valorar.isPending && <Loader2 className="animate-spin" />}
            Enviar valoración
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogoConfirmar({ observacion, onCerrar }: { observacion: ObservacionItem; onCerrar: () => void }) {
  const confirmar = useConfirmarObservacion(observacion.id)
  const propuesta = observacion.entregaPropuesta!
  const [cambiar, setCambiar] = useState(false)
  const [fecha, setFecha] = useState(diaEnLima(new Date(propuesta)))
  const [hora, setHora] = useState(horaEnLima(new Date(propuesta)))
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const consulta: ConsultaPlazo | null = observacion.minutosEstimados ? { minutos: observacion.minutosEstimados, fecha: cambiar ? fecha : diaEnLima(new Date(propuesta)), hora: cambiar ? hora : horaEnLima(new Date(propuesta)) } : null
  const { data: plazo, isFetching } = useQuery(plazoQuery(observacion.id, consulta))

  const guardar = async () => {
    setError(null)
    try {
      await confirmar.mutateAsync({ ...(cambiar && { fecha, hora }), nota: nota.trim() || undefined })
      toast.success('Plazo confirmado: pasa a producción para programarlo')
      onCerrar()
    } catch (err) {
      setError(mensajeDe(err))
    }
  }

  return (
    <Dialog open onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirmar con el cliente</DialogTitle>
          <DialogDescription>
            {observacion.trabajo.codigo} · {observacion.entregable.nombre}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <AvisoError error={error} />
          <p className="text-sm">
            Quien valoró estima <strong>{duracion(observacion.minutosEstimados ?? 0)}</strong> y propone entregar el <strong>{formatearFechaHora(propuesta)}</strong>.
          </p>
          {plazo && <AvisoPlazo plazo={plazo} cargando={isFetching} />}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={cambiar} onChange={(ev) => setCambiar(ev.target.checked)} />
            Acordé otra fecha y hora con el cliente
          </label>
          {cambiar && (
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="conf-f">Entrega</FieldLabel>
                <Input id="conf-f" type="date" min={diaEnLima()} value={fecha} onChange={(ev) => setFecha(ev.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="conf-t">Hora</FieldLabel>
                <Input id="conf-t" type="time" value={hora} onChange={(ev) => setHora(ev.target.value)} />
              </Field>
            </div>
          )}
          <Field>
            <FieldLabel htmlFor="conf-n">Nota (opcional)</FieldLabel>
            <Textarea id="conf-n" rows={2} value={nota} onChange={(ev) => setNota(ev.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={confirmar.isPending} onClick={guardar}>
            {confirmar.isPending && <Loader2 className="animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogoProgramar({ observacion, onCerrar }: { observacion: ObservacionItem; onCerrar: () => void }) {
  const programar = useProgramarObservacion(observacion.id)
  const { data: candidatos, isPending } = useQuery(candidatosCorreccionQuery(observacion.id))
  const puedeFijas = usePermiso('trabajos.fijar_fechas')
  const [elegido, setElegido] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const [fijas, setFijas] = useState(false)
  const [cubrir, setCubrir] = useState<'no' | 'horas_extra' | 'bono'>('no')
  const [monto, setMonto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const entrega = observacion.entregaConfirmada ?? observacion.entregaPropuesta
  const quien = elegido || candidatos?.find((c) => c.recomendado)?.usuario.id || observacion.auxiliarOriginal?.id || ''
  const c = candidatos?.find((x) => x.usuario.id === quien)
  const ventana = c?.plazo.extra ?? null
  const hayProblema = c ? !c.plazo.cabe || c.pasanARojo > 0 : false

  const guardar = async () => {
    setError(null)
    try {
      const r = await programar.mutateAsync({
        usuarioId: quien,
        confirmarImpacto: confirmado || undefined,
        forzarFechasFijas: fijas || undefined,
        ...(cubrir === 'horas_extra' && ventana && { extra: { modalidad: 'horas_extra' as const, fecha: ventana.fecha, horaInicio: ventana.horaInicio, horaFin: ventana.horaFin } }),
        ...(cubrir === 'bono' && { extra: { modalidad: 'bono' as const, monto: Number(monto) } }),
      })
      toast.success('Corrección programada: quedó primera en la cola')
      const aviso = (r as { avisoExtra?: string | null }).avisoExtra
      if (aviso) toast.warning(aviso)
      onCerrar()
    } catch (err) {
      setError(mensajeDe(err))
    }
  }

  return (
    <Dialog open onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Programar la corrección</DialogTitle>
          <DialogDescription>
            {observacion.trabajo.codigo} · {observacion.entregable.nombre}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <AvisoError error={error} />
          <p className="text-sm">
            <strong>{duracion(observacion.minutosEstimados ?? 0)}</strong>, a entregar el <strong>{entrega ? formatearFechaHora(entrega) : '—'}</strong>.
          </p>
          <Field>
            <FieldLabel>Quién la hará</FieldLabel>
            {isPending || !candidatos ? (
              <Skeleton className="h-24" />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {candidatos.map((x) => (
                  <li key={x.usuario.id}>
                    <label className={`flex cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2 text-sm ${x.usuario.id === quien ? 'border-primary' : ''}`}>
                      <span className="flex items-center gap-2">
                        <input type="radio" name="quien" checked={x.usuario.id === quien} onChange={() => setElegido(x.usuario.id)} />
                        <span className="font-medium">{nombreCompleto(x.usuario)}</span>
                        {x.esOriginal && <Badge variant="outline">Lo hizo</Badge>}
                        {x.recomendado && <Badge>Recomendado</Badge>}
                      </span>
                      <span className="pl-6 text-xs text-muted-foreground">
                        {x.plazo.cabe ? 'Llega a tiempo' : `No alcanza (faltan ${duracion(x.plazo.faltanMinutos)})`}
                        {x.pasanARojo > 0 ? ` · atrasaría ${x.pasanARojo} ${x.pasanARojo === 1 ? 'tarea suya' : 'tareas suyas'} más allá de su fecha` : ' · no atrasa a nadie'}
                        {x.fijasAfectadas.length > 0 ? ` · fechas inamovibles: ${x.fijasAfectadas.join(', ')}` : ''}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </Field>

          {c && <AvisoPlazo plazo={c.plazo} cargando={false} />}

          {c && !c.plazo.cabe && (
            <Field>
              <FieldLabel>Cubrir lo que falta</FieldLabel>
              <Select value={cubrir} onValueChange={(v) => setCubrir(v as typeof cubrir)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No, solo confirmar que se atrasa</SelectItem>
                  {ventana && <SelectItem value="horas_extra">{`Proponer horas extra (${ventana.fecha} ${ventana.horaInicio}–${ventana.horaFin})`}</SelectItem>}
                  <SelectItem value="bono">Proponer un bono</SelectItem>
                </SelectContent>
              </Select>
              {cubrir === 'bono' && <Input className="mt-2 w-40" type="number" min={1} step={1} placeholder="Monto (S/)" value={monto} onChange={(ev) => setMonto(ev.target.value)} />}
              <FieldDescription>Queda propuesto a esa persona; un aprobador debe aceptarlo desde Horas extra.</FieldDescription>
            </Field>
          )}

          {c && hayProblema && (cubrir === 'no' || c.pasanARojo > 0) && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={confirmado} onChange={(ev) => setConfirmado(ev.target.checked)} />
              {cubrir === 'no' && !c.plazo.cabe ? 'No alcanza en horario normal' : ''}
              {cubrir === 'no' && !c.plazo.cabe && c.pasanARojo > 0 ? ' y ' : ''}
              {c.pasanARojo > 0 ? 'Otras tareas suyas dejan de llegar a su fecha' : ''}: programarla igual.
            </label>
          )}
          {c && c.fijasAfectadas.length > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={fijas} disabled={!puedeFijas} onChange={(ev) => setFijas(ev.target.checked)} />
              Acepto atrasar trabajos de fechas inamovibles ({c.fijasAfectadas.join(', ')}){puedeFijas ? '' : ': no tienes permiso para hacerlo'}.
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={programar.isPending || !quien || (cubrir === 'bono' && !Number(monto))} onClick={guardar}>
            {programar.isPending && <Loader2 className="animate-spin" />}
            Programar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
