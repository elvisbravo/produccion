import { cambiarInicioSchema, diaEnLima, type CambiarInicioDatos } from '@grupoes/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { Requerido } from '@/components/requerido'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { aplicarErroresApi } from '@/lib/formularios'
import { useCambiarInicio } from '../api-contingencias'

/** Desde qué día y hora se programa una actividad de la cola: puede ser pasado (el trabajo ya empezó) o posponerse. */
export function DialogoInicio({ tareaId, actividad, fecha, hora, onCerrar }: { tareaId: string; actividad: string; fecha: string; hora: string; onCerrar: () => void }) {
  const cambiar = useCambiarInicio(tareaId)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<z.input<typeof cambiarInicioSchema>, unknown, CambiarInicioDatos>({
    resolver: zodResolver(cambiarInicioSchema),
    defaultValues: { fecha: fecha || diaEnLima(), hora },
  })
  const e = form.formState.errors

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await cambiar.mutateAsync(datos)
      toast.success('Inicio actualizado: la cola se reacomodó')
      onCerrar()
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['fecha', 'hora']))
    }
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Inicio de {actividad}</DialogTitle>
            <DialogDescription>
              La actividad se programa desde ese día y hora, aunque ya hayan pasado. Si la persona tiene otras actividades antes en su cola, esta empieza cuando terminan.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field data-invalid={Boolean(e.fecha)}>
              <FieldLabel htmlFor="inicio-fecha">
                <span>
                  Día <Requerido />
                </span>
              </FieldLabel>
              <Input id="inicio-fecha" type="date" aria-invalid={Boolean(e.fecha)} {...form.register('fecha')} />
              <FieldError errors={[e.fecha]} />
            </Field>
            <Field data-invalid={Boolean(e.hora)}>
              <FieldLabel htmlFor="inicio-hora">Hora</FieldLabel>
              <Input id="inicio-hora" type="time" step={900} aria-invalid={Boolean(e.hora)} {...form.register('hora')} />
              <FieldDescription>Sin hora: desde el inicio del día.</FieldDescription>
              <FieldError errors={[e.hora]} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={cambiar.isPending}>
              {cambiar.isPending && <Loader2 className="animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
