import { zodResolver } from '@hookform/resolvers/zod'
import { diaEnLima, programarTareaSchema, type ActividadCatalogo, type ProgramarTareaDatos, type ProgramarTareaFormulario, type TareaItem } from '@grupoes/shared'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { aplicarErroresApi } from '@/lib/formularios'
import { useProgramarReunionDeTrabajo, useProgramarTarea } from '../api'
import { CamposProgramacion } from './campos-programacion'

interface Props {
  /** A un prospecto: cualquier actividad comercial. */
  prospectoId?: string
  /** A un cliente (un trabajo): solo reuniones. */
  trabajoId?: string
  actividades: ActividadCatalogo[]
  /** Se llama con la reunión recién creada (p. ej. para elegir de una vez quién la da). */
  onProgramada?: (tarea: TareaItem) => void
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

export function DialogoProgramar({ prospectoId, trabajoId, actividades, onProgramada, abierto, onAbiertoChange }: Props) {
  const programarProspecto = useProgramarTarea(prospectoId ?? '')
  const programarTrabajo = useProgramarReunionDeTrabajo(trabajoId ?? '')
  const programar = trabajoId ? programarTrabajo : programarProspecto
  const [error, setError] = useState<string | null>(null)
  const form = useForm<ProgramarTareaFormulario, unknown, ProgramarTareaDatos>({
    resolver: zodResolver(programarTareaSchema),
    defaultValues: { actividadId: '', fecha: diaEnLima(), hora: '', modalidad: '', notas: '' },
  })

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      const tarea = await programar.mutateAsync(datos)
      toast.success(`${tarea.actividad.nombre} programado${tarea.estado === 'por_asignar' ? ' · por asignar' : ''}`)
      form.reset()
      onAbiertoChange(false)
      onProgramada?.(tarea)
    } catch (e) {
      setError(aplicarErroresApi(e, form.setError, ['actividadId', 'fecha', 'hora', 'modalidad', 'notas']))
    }
  })

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-lg">
        <FormProvider {...form}>
          <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{trabajoId ? 'Programar reunión' : 'Programar actividad'}</DialogTitle>
              <DialogDescription>{trabajoId ? 'Una reunión con el cliente de este trabajo. Si la actividad se coordina, queda por asignar para producción.' : 'Enfoque, llamada, mensaje o reunión con el prospecto.'}</DialogDescription>
            </DialogHeader>
            {error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <CamposProgramacion actividades={actividades} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                Programar
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}
