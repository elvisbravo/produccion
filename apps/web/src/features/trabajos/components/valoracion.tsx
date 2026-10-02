import { diaEnLima, type TrabajoDetalle } from '@grupoes/shared'
import { AlertCircle, Loader2, Scale, TriangleAlert } from 'lucide-react'
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
import { formatearFecha, formatearFechaHora, nombreCompleto } from '@/lib/formato'
import { useValorarTrabajo } from '../api'

const mensaje = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo completar la acción')
const dias = (n: number) => `${n} ${n === 1 ? 'día hábil' : 'días hábiles'}`

/** El morado de la leyenda del equipo. */
export const ESTILO_VALORADO = 'border-purple-400 bg-purple-200 text-purple-950 dark:border-purple-700 dark:bg-purple-900/60 dark:text-purple-50'

/** En la ficha: lo que se estimó en la reunión y, si no cabe antes de la fecha límite, el aviso. */
export function AvisoValoracion({ t }: { t: TrabajoDetalle }) {
  const v = t.valoracion
  if (!v) return null
  return (
    <Alert className="border-purple-300 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/40">
      <Scale />
      <AlertTitle>Valorado en {dias(v.diasEstimados)}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p className="text-xs">
          Reunión del {formatearFecha(v.fechaReunion)} · lo registró {nombreCompleto(v.por)} el {formatearFechaHora(v.en)}.
          {v.nota ? ` ${v.nota}` : ''}
        </p>
        {!v.alcanza && (
          <p className="flex items-start gap-1.5 text-sm font-medium text-amber-800 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            Hasta la fecha límite quedan solo {dias(v.diasDisponibles)}: la estimación no cabe. Conviene hablarlo con el cliente.
          </p>
        )}
      </AlertDescription>
    </Alert>
  )
}

/** Botón para registrar (o actualizar) la valoración de un trabajo abierto. */
export function BotonValorar({ t }: { t: TrabajoDetalle }) {
  const [abierto, setAbierto] = useState(false)
  if (['finalizado', 'cancelado'].includes(t.estado)) return null
  return (
    <Can permiso="trabajos.valorar">
      <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
        <Scale />
        {t.valoracion ? 'Actualizar valoración' : 'Valorar'}
      </Button>
      {abierto && <DialogoValorar t={t} abierto onAbiertoChange={setAbierto} />}
    </Can>
  )
}

function DialogoValorar({ t, abierto, onAbiertoChange }: { t: TrabajoDetalle; abierto: boolean; onAbiertoChange: (abierto: boolean) => void }) {
  const valorar = useValorarTrabajo(t.id)
  const [fecha, setFecha] = useState(diaEnLima())
  const [diasEstimados, setDiasEstimados] = useState(t.valoracion ? String(t.valoracion.diasEstimados) : '')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errores, setErrores] = useState<{ fecha?: string; dias?: string }>({})

  const enviar = async () => {
    setError(null)
    const n = Number(diasEstimados)
    const nuevos: typeof errores = {}
    if (!fecha) nuevos.fecha = 'Elige la fecha de la reunión'
    if (!Number.isInteger(n) || n < 1 || n > 365) nuevos.dias = 'Indica de 1 a 365 días'
    setErrores(nuevos)
    if (Object.keys(nuevos).length) return
    try {
      await valorar.mutateAsync({ fechaReunion: fecha, diasEstimados: n, nota: nota.trim() || undefined })
      toast.success(`${t.codigo} valorado en ${dias(n)}`)
      onAbiertoChange(false)
    } catch (err) {
      setError(mensaje(err))
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Valorar {t.codigo}</DialogTitle>
          <DialogDescription>En la reunión se estima cuánto tardará el trabajo (días hábiles, sin domingos ni feriados) para dárselo al cliente. Se avisa si no cabe antes de la fecha límite ({formatearFecha(t.fechaLimite)}).</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errores.fecha)}>
            <FieldLabel htmlFor="val-fecha">Fecha de la reunión</FieldLabel>
            <Input id="val-fecha" type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} aria-invalid={Boolean(errores.fecha)} />
            <FieldError>{errores.fecha}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errores.dias)}>
            <FieldLabel htmlFor="val-dias">Días hábiles estimados</FieldLabel>
            <Input id="val-dias" type="number" inputMode="numeric" min={1} max={365} value={diasEstimados} onChange={(ev) => setDiasEstimados(ev.target.value)} aria-invalid={Boolean(errores.dias)} />
            <FieldError>{errores.dias}</FieldError>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="val-nota">Nota (opcional)</FieldLabel>
          <Textarea id="val-nota" rows={2} maxLength={500} placeholder="Ej.: se acordó con la tutora" value={nota} onChange={(ev) => setNota(ev.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbiertoChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={valorar.isPending}>
            {valorar.isPending && <Loader2 className="animate-spin" />}
            Guardar valoración
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
