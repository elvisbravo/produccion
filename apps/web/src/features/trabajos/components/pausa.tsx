import { type TrabajoDetalle } from '@grupoes/shared'
import { AlertCircle, CirclePause, Loader2, Play } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Can } from '@/components/can'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { formatearFechaHora, nombreCompleto } from '@/lib/formato'
import { usePausarTrabajo, useReanudarTrabajo } from '../api'

const mensaje = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo completar la acción')

/** Mientras el trabajo espera información del cliente: qué falta, desde cuándo, y el botón para reanudarlo. */
export function AvisoEnEspera({ t }: { t: TrabajoDetalle }) {
  const [reanudando, setReanudando] = useState(false)
  if (!t.pausa) return null
  return (
    <>
      <Alert className="border-orange-300 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/40">
        <CirclePause />
        <AlertTitle>En espera del cliente · {t.pausa.dias === 0 ? 'desde hoy' : `${t.pausa.dias} ${t.pausa.dias === 1 ? 'día' : 'días'}`}</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <p>
            Falta: <span className="font-medium text-foreground">{t.pausa.motivo}</span>
          </p>
          <p className="text-xs">
            Lo detuvo {nombreCompleto(t.pausa.por)} el {formatearFechaHora(t.pausa.desde)}.{' '}
            {t.pausa.tareasPausadas > 0 ? `${t.pausa.tareasPausadas} ${t.pausa.tareasPausadas === 1 ? 'tarea salió' : 'tareas salieron'} de la cola hasta que se reanude.` : 'No tenía tareas en la cola.'}
          </p>
          <Can permiso="trabajos.pausar">
            <Button size="sm" variant="outline" className="w-fit bg-background" onClick={() => setReanudando(true)}>
              <Play />
              Llegó la información: reanudar
            </Button>
          </Can>
        </AlertDescription>
      </Alert>
      {reanudando && <DialogoReanudar t={t} abierto onAbiertoChange={setReanudando} />}
    </>
  )
}

/** Botón para detener el trabajo por falta de información del cliente (si no está ya detenido ni cerrado). */
export function BotonPausar({ t }: { t: TrabajoDetalle }) {
  const [abierto, setAbierto] = useState(false)
  if (['suspendido', 'finalizado', 'cancelado'].includes(t.estado)) return null
  return (
    <Can permiso="trabajos.pausar">
      <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
        <CirclePause />
        Pausar: falta información
      </Button>
      {abierto && <DialogoPausar t={t} abierto onAbiertoChange={setAbierto} />}
    </Can>
  )
}

interface PropsDialogo {
  t: TrabajoDetalle
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

function DialogoPausar({ t, abierto, onAbiertoChange }: PropsDialogo) {
  const pausar = usePausarTrabajo(t.id)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorCampo, setErrorCampo] = useState<string | null>(null)

  const enviar = async () => {
    setError(null)
    setErrorCampo(null)
    if (motivo.trim().length < 3) return setErrorCampo('Indica qué información falta')
    try {
      await pausar.mutateAsync(motivo.trim())
      toast.success(`${t.codigo} quedó en espera del cliente`)
      onAbiertoChange(false)
    } catch (err) {
      setError(mensaje(err))
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pausar {t.codigo}: falta información</DialogTitle>
          <DialogDescription>
            Sus tareas en cola salen de la planificación (nadie queda en rojo por algo que no puede avanzar) y se avisa a quien sigue al cliente y al equipo. Si se pasan unos días sin respuesta, el sistema lo recuerda.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field data-invalid={Boolean(errorCampo)}>
          <FieldLabel htmlFor="pausa-motivo">¿Qué información falta?</FieldLabel>
          <Textarea id="pausa-motivo" rows={3} maxLength={500} placeholder="Ej.: la matriz de consistencia que debe enviar el cliente" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} aria-invalid={Boolean(errorCampo)} />
          <FieldError>{errorCampo}</FieldError>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbiertoChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={pausar.isPending}>
            {pausar.isPending && <Loader2 className="animate-spin" />}
            Pausar el trabajo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogoReanudar({ t, abierto, onAbiertoChange }: PropsDialogo) {
  const reanudar = useReanudarTrabajo(t.id)
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)

  const enviar = async () => {
    setError(null)
    try {
      await reanudar.mutateAsync(nota.trim() || undefined)
      toast.success(`${t.codigo} se reanudó: sus tareas vuelven a la cola`)
      onAbiertoChange(false)
    } catch (err) {
      setError(mensaje(err))
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reanudar {t.codigo}</DialogTitle>
          <DialogDescription>Sus tareas vuelven a la cola de cada persona, el trabajo recupera su estado y se avisa al equipo.</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="reanudar-nota">Nota (opcional)</FieldLabel>
          <Input id="reanudar-nota" maxLength={500} placeholder="Ej.: el cliente envió la matriz por correo" value={nota} onChange={(ev) => setNota(ev.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbiertoChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={reanudar.isPending}>
            {reanudar.isPending && <Loader2 className="animate-spin" />}
            Reanudar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
