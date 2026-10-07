import type { RepartoCargaDatos } from '@grupoes/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AlertCircle, Loader2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { duracion, formatearFechaHora, nombreCompleto } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { cargaQuery, impactoCargaQuery, useAplicarCarga } from '../api-contingencias'
import { PuntoSemaforo } from './insignias'

type Alcance = 'tarea' | 'bloque' | 'trabajo'

/**
 * Pasar a otro auxiliar lo que se tocó en el calendario: solo esa tarea, todo su bloque (el entregable) o todo el trabajo.
 * Lo ya trabajado queda a nombre de quien lo hizo; quien recibe programa solo lo que falta, al final de su cola.
 */
export function DialogoPasarTrabajo({ usuarioId, trabajoId, tareaId, onCerrar, onVerTodos }: { usuarioId: string; trabajoId: string; tareaId: string; onCerrar: () => void; onVerTodos: () => void }) {
  const { data, isPending, error } = useQuery(cargaQuery(usuarioId, { trabajoId, tareaId }))
  const aplicar = useAplicarCarga(usuarioId)
  const [alcance, setAlcance] = useState<Alcance>('tarea')
  const [elegido, setElegido] = useState('')
  const [motivo, setMotivo] = useState('')
  const [errorAplicar, setErrorAplicar] = useState<string | null>(null)

  const trabajo = data?.trabajos[0]
  const tarea = trabajo?.tareas.find((t) => t.tareaId === tareaId)
  const bloque = trabajo?.bloques.find((b) => b.entregableId === (tarea?.entregableId ?? null))
  const opciones = alcance === 'tarea' ? tarea : alcance === 'bloque' ? bloque : trabajo
  const destinatario = elegido || opciones?.sugerido?.id || ''

  const reparto: RepartoCargaDatos['reparto'] =
    !trabajo || !destinatario
      ? []
      : alcance === 'tarea'
        ? [{ trabajoId, entregableId: tarea?.entregableId ?? null, tareaId, usuarioId: destinatario }]
        : alcance === 'bloque'
          ? [{ trabajoId, entregableId: bloque?.entregableId ?? null, usuarioId: destinatario }]
          : trabajo.bloques.map((b) => ({ trabajoId, entregableId: b.entregableId, usuarioId: destinatario }))
  const impacto = useQuery({ ...impactoCargaQuery(usuarioId, reparto), enabled: reparto.length > 0, placeholderData: keepPreviousData })

  const cambiarAlcance = (v: string) => {
    setAlcance(v as Alcance)
    setElegido('') // vuelve a la recomendación del nuevo alcance
  }
  const confirmar = async () => {
    setErrorAplicar(null)
    try {
      const r = await aplicar.mutateAsync({ reparto, motivo: motivo.trim() || undefined })
      toast.success(`${r.tareas} ${r.tareas === 1 ? 'tarea pasó' : 'tareas pasaron'} a otro auxiliar`)
      onCerrar()
    } catch (err) {
      setErrorAplicar(err instanceof ApiError ? err.message : 'No se pudo pasar')
    }
  }

  const tarjeta = (valor: Alcance, titulo: string, detalle: string) => (
    <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50', alcance === valor && 'border-primary bg-muted/40 ring-1 ring-primary')}>
      <RadioGroupItem value={valor} className="mt-0.5" />
      <span className="flex flex-col">
        <span className="font-medium">{titulo}</span>
        <span className="text-xs text-muted-foreground">{detalle}</span>
      </span>
    </label>
  )

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Pasar a otro auxiliar{trabajo && `: ${trabajo.trabajo.codigo}`}</DialogTitle>
          <DialogDescription>
            Elige qué se pasa: solo la tarea que tocaste, todo su bloque o todo el trabajo. Lo ya trabajado queda a nombre de quien lo hizo y quien recibe programa solo lo que falta, al final de su cola.
          </DialogDescription>
        </DialogHeader>
        {(error || errorAplicar) && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{errorAplicar ?? (error instanceof Error ? error.message : 'No se pudo cargar')}</AlertDescription>
          </Alert>
        )}
        {isPending ? (
          <Skeleton className="h-64" />
        ) : !trabajo || !tarea ? (
          <p className="text-sm text-muted-foreground">Esa tarea ya no está en la cola de esta persona. Cierra y vuelve a abrir el calendario.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">¿Qué se pasa?</span>
              <RadioGroup value={alcance} onValueChange={cambiarAlcance} className="gap-2">
                {tarjeta('tarea', `Solo esta tarea: ${tarea.titulo}`, `Falta ${duracion(tarea.minutosFaltan)}${tarea.minutosHechos > 0 ? ` · ya trabajó ${duracion(tarea.minutosHechos)}` : ''}${tarea.enProceso ? ' · está en proceso' : ''}`)}
                {bloque && tarjeta('bloque', `Todo este bloque: ${bloque.nombre}`, `${bloque.tareas} ${bloque.tareas === 1 ? 'tarea' : 'tareas'} · falta ${duracion(bloque.minutosFaltan)}`)}
                {tarjeta(
                  'trabajo',
                  `Todo el trabajo: ${trabajo.trabajo.titulo ?? trabajo.trabajo.codigo}`,
                  `${trabajo.tareas.length} ${trabajo.tareas.length === 1 ? 'tarea' : 'tareas'} · falta ${duracion(trabajo.bloques.reduce((s, b) => s + b.minutosFaltan, 0))}`,
                )}
              </RadioGroup>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">¿A quién?</span>
              <Select value={destinatario || undefined} onValueChange={setElegido}>
                <SelectTrigger className="w-full" aria-label="Auxiliar que la recibe">
                  <SelectValue placeholder={opciones && opciones.elegibles.length === 0 ? 'Nadie puede tomarlo' : 'Elige a la persona'} />
                </SelectTrigger>
                <SelectContent>
                  {opciones?.elegibles.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {nombreCompleto(u)}
                      {u.id === opciones.sugerido?.id && ' · sugerido'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {opciones && opciones.elegibles.length === 0 && <p className="text-xs text-destructive">Nadie con un rol permitido puede tomar esto: prueba con otra opción.</p>}
            </div>

            {reparto.length > 0 && (
              <section className="flex flex-col gap-2 rounded-lg border p-3 text-sm" aria-live="polite">
                <h3 className="font-medium">Cómo queda en su cola</h3>
                {!impacto.data ? (
                  <Skeleton className="h-12" />
                ) : (
                  impacto.data.personas.map((p) => (
                    <div key={p.usuario.id} className="flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{nombreCompleto(p.usuario)}</span>
                        <span className="text-xs text-muted-foreground">
                          recibe {p.tareas.length} {p.tareas.length === 1 ? 'tarea' : 'tareas'} · {duracion(p.minutos)}
                        </span>
                        {p.sinLlegar > 0 && (
                          <Badge variant="destructive" className="gap-1">
                            <TriangleAlert className="size-3" />
                            {p.sinLlegar} no {p.sinLlegar === 1 ? 'llega' : 'llegan'} a su fecha
                          </Badge>
                        )}
                      </span>
                      {p.quedan > 0 && (
                        <span className="text-xs text-amber-700 dark:text-amber-400">
                          {p.quedan} {p.quedan === 1 ? 'tarea se queda' : 'tareas se quedan'} con su responsable actual: esta persona no puede tomarla{p.quedan === 1 ? '' : 's'} (rol no permitido o es quien revisa).
                        </span>
                      )}
                      <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                        {p.tareas.map((t) => (
                          <li key={t.tareaId} className="flex items-center gap-1.5">
                            <PuntoSemaforo semaforo={t.resultado.semaforo} dias={t.resultado.holguraDias} fin={t.resultado.fin} />
                            {t.titulo}
                            {t.resultado.fin ? ` · termina ${formatearFechaHora(t.resultado.fin)}` : ' · no entra en la agenda'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </section>
            )}

            <label className="flex flex-col gap-1 text-sm">
              Motivo (opcional)
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: se enfermó o pasa a otras actividades" maxLength={300} />
            </label>
          </div>
        )}
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="link" className="px-0" onClick={onVerTodos}>
            Ver todos los trabajos de la persona
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmar()} disabled={reparto.length === 0 || aplicar.isPending || !impacto.data}>
              {aplicar.isPending && <Loader2 className="animate-spin" />}
              Pasar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
