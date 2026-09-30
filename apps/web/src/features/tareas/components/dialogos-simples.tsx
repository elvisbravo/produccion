import { zodResolver } from '@hookform/resolvers/zod'
import {
  cancelarTareaSchema,
  diaEnLima,
  horaEnLima,
  reprogramarTareaSchema,
  type ReprogramarTareaDatos,
  type TareaItem,
} from '@grupoes/shared'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { Requerido } from '@/components/requerido'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { aplicarErroresApi } from '@/lib/formularios'
import { useCancelarTarea, useReprogramarTarea } from '../api'

interface PropsDialogo {
  tarea: TareaItem
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

export function DialogoReprogramar({ tarea, abierto, onAbiertoChange }: PropsDialogo) {
  const reprogramar = useReprogramarTarea(tarea.id)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<z.input<typeof reprogramarTareaSchema>, unknown, ReprogramarTareaDatos>({
    resolver: zodResolver(reprogramarTareaSchema),
    defaultValues: { fecha: tarea.fecha, hora: tarea.inicio ? horaEnLima(new Date(tarea.inicio)) : '', motivo: '' },
  })
  const e = form.formState.errors

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await reprogramar.mutateAsync(datos)
      toast.success('Actividad reprogramada')
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['fecha', 'hora', 'motivo']))
    }
  })

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Reprogramar: {tarea.actividad.nombre}</DialogTitle>
            <DialogDescription>Queda registrado en la línea de tiempo del prospecto.</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field data-invalid={Boolean(e.fecha)}>
              <FieldLabel htmlFor="rep-fecha">
                <span>
                  Día <Requerido />
                </span>
              </FieldLabel>
              <Input id="rep-fecha" type="date" min={diaEnLima()} {...form.register('fecha')} />
              <FieldError errors={[e.fecha]} />
            </Field>
            <Field data-invalid={Boolean(e.hora)}>
              <FieldLabel htmlFor="rep-hora">
                <span>Hora {tarea.actividad.requiereHoraFija && <Requerido />}</span>
              </FieldLabel>
              <Input id="rep-hora" type="time" step={900} {...form.register('hora')} />
              <FieldError errors={[e.hora]} />
            </Field>
          </div>
          <Field data-invalid={Boolean(e.motivo)}>
            <FieldLabel htmlFor="rep-motivo">Motivo</FieldLabel>
            <Input id="rep-motivo" placeholder="Ej.: el cliente pidió otro día" {...form.register('motivo')} />
            <FieldError errors={[e.motivo]} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Reprogramar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DialogoCancelar({ tarea, abierto, onAbiertoChange }: PropsDialogo) {
  const cancelar = useCancelarTarea(tarea.id)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<{ motivo: string }>({ resolver: zodResolver(cancelarTareaSchema), defaultValues: { motivo: '' } })

  const enviar = form.handleSubmit(async ({ motivo }) => {
    setError(null)
    try {
      await cancelar.mutateAsync(motivo)
      toast.success('Actividad cancelada')
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['motivo']))
    }
  })

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Cancelar: {tarea.actividad.nombre}</DialogTitle>
            <DialogDescription>La actividad no se realizará. Queda en el historial con su motivo.</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={Boolean(form.formState.errors.motivo)}>
            <FieldLabel htmlFor="can-motivo">
              <span>
                Motivo <Requerido />
              </span>
            </FieldLabel>
            <Textarea id="can-motivo" rows={2} {...form.register('motivo')} />
            <FieldError errors={[form.formState.errors.motivo]} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
              Volver
            </Button>
            <Button type="submit" variant="destructive" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Cancelar actividad
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
