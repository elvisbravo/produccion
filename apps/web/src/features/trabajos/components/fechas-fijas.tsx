import { type TrabajoDetalle } from '@grupoes/shared'
import { AlertCircle, Loader2, Pin, PinOff } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Can } from '@/components/can'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { formatearFechaHora, nombreCompleto } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { useFijarFechas, useLiberarFechas } from '../api'

const mensaje = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo completar la acción')

/** El azul de la leyenda del equipo. */
export const ESTILO_FECHAS_FIJAS = 'border-blue-400 bg-blue-200 text-blue-950 dark:border-blue-700 dark:bg-blue-900/60 dark:text-blue-50'

/** Marcador de un trabajo cuyas fechas no se pueden mover (aparte del estado: puede sumarse a cualquiera). */
export function MarcaFechasFijas({ motivo, className }: { motivo?: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn('gap-1 px-1.5 text-[11px]', ESTILO_FECHAS_FIJAS, className)} title={motivo ? `Fechas inamovibles: ${motivo}` : 'Fechas inamovibles'}>
      <Pin className="size-3" />
      Fechas fijas
    </Badge>
  )
}

/** En la ficha: por qué no se pueden mover las fechas y, con permiso, el botón para liberarlas. */
export function AvisoFechasFijas({ t }: { t: TrabajoDetalle }) {
  const [liberando, setLiberando] = useState(false)
  if (!t.fechasFijas) return null
  return (
    <>
      <Alert className="border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40">
        <Pin />
        <AlertTitle>Fechas inamovibles</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <p>
            <span className="font-medium text-foreground">{t.fechasFijas.motivo}</span>
          </p>
          <p className="text-xs">
            {t.fechasFijas.por ? `Lo fijó ${nombreCompleto(t.fechasFijas.por)} el ` : 'Fijado el '}
            {formatearFechaHora(t.fechasFijas.desde)}. No se editan las fechas de sus entregables, no se reprograman sus tareas, no quedan detrás de otras en la cola y una urgencia no puede atrasarlas sin aceptarlo de forma expresa.
          </p>
          <Can permiso="trabajos.fijar_fechas">
            <Button size="sm" variant="outline" className="w-fit bg-background" onClick={() => setLiberando(true)}>
              <PinOff />
              Liberar las fechas
            </Button>
          </Can>
        </AlertDescription>
      </Alert>
      {liberando && <DialogoLiberar t={t} abierto onAbiertoChange={setLiberando} />}
    </>
  )
}

/** Botón para fijar las fechas de un trabajo abierto. */
export function BotonFijarFechas({ t }: { t: TrabajoDetalle }) {
  const [abierto, setAbierto] = useState(false)
  if (t.fechasFijas || ['finalizado', 'cancelado'].includes(t.estado)) return null
  return (
    <Can permiso="trabajos.fijar_fechas">
      <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
        <Pin />
        Fijar fechas
      </Button>
      {abierto && <DialogoFijar t={t} abierto onAbiertoChange={setAbierto} />}
    </Can>
  )
}

interface PropsDialogo {
  t: TrabajoDetalle
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

function DialogoFijar({ t, abierto, onAbiertoChange }: PropsDialogo) {
  const fijar = useFijarFechas(t.id)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorCampo, setErrorCampo] = useState<string | null>(null)

  const enviar = async () => {
    setError(null)
    setErrorCampo(null)
    if (motivo.trim().length < 3) return setErrorCampo('Indica por qué no se pueden mover')
    try {
      await fijar.mutateAsync(motivo.trim())
      toast.success(`Las fechas de ${t.codigo} quedaron fijas`)
      onAbiertoChange(false)
    } catch (err) {
      setError(mensaje(err))
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fijar las fechas de {t.codigo}</DialogTitle>
          <DialogDescription>
            Deben cumplirse sí o sí. Nadie podrá cambiar las fechas de sus entregables ni reprogramar sus tareas, sus tareas no quedarán detrás de otras en la cola y una urgencia no podrá atrasarlas sin que alguien con permiso lo
            acepte de forma expresa.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field data-invalid={Boolean(errorCampo)}>
          <FieldLabel htmlFor="fijas-motivo">¿Por qué no se pueden mover?</FieldLabel>
          <Textarea id="fijas-motivo" rows={3} maxLength={300} placeholder="Ej.: la universidad fijó la fecha de sustentación" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} aria-invalid={Boolean(errorCampo)} />
          <FieldError>{errorCampo}</FieldError>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbiertoChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={fijar.isPending}>
            {fijar.isPending && <Loader2 className="animate-spin" />}
            Fijar las fechas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogoLiberar({ t, abierto, onAbiertoChange }: PropsDialogo) {
  const liberar = useLiberarFechas(t.id)
  const [error, setError] = useState<string | null>(null)

  const enviar = async () => {
    setError(null)
    try {
      await liberar.mutateAsync()
      toast.success(`Las fechas de ${t.codigo} ya pueden moverse`)
      onAbiertoChange(false)
    } catch (err) {
      setError(mensaje(err))
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Liberar las fechas de {t.codigo}</DialogTitle>
          <DialogDescription>Volverán a poder cambiarse las fechas de los entregables y reprogramarse las tareas. Queda registrado y se avisa al equipo.</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbiertoChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={liberar.isPending}>
            {liberar.isPending && <Loader2 className="animate-spin" />}
            Liberar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
