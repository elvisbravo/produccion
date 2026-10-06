import { enlaceReunionSchema, type EnlaceReunionDatos } from '@grupoes/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { aplicarErroresApi } from '@/lib/formularios'
import { useGuardarEnlaceReunion } from '../api'

/** El enlace de la videollamada de una reunión (Meet, Zoom…). Vacío = quitarlo. */
export function DialogoEnlaceReunion({ tareaId, enlace, onCerrar }: { tareaId: string; enlace: string | null; onCerrar: () => void }) {
  const guardar = useGuardarEnlaceReunion(tareaId)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<z.input<typeof enlaceReunionSchema>, unknown, EnlaceReunionDatos>({ resolver: zodResolver(enlaceReunionSchema), defaultValues: { enlace: enlace ?? '' } })
  const e = form.formState.errors

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await guardar.mutateAsync(datos)
      toast.success(datos.enlace ? 'Enlace guardado' : 'Enlace quitado')
      onCerrar()
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['enlace']))
    }
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Enlace de la reunión</DialogTitle>
            <DialogDescription>Pega el enlace de la videollamada (Google Meet, Zoom, Teams…). Déjalo vacío para quitarlo.</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={Boolean(e.enlace)}>
            <FieldLabel htmlFor="enlace-reunion">Enlace</FieldLabel>
            <Input id="enlace-reunion" type="url" inputMode="url" placeholder="https://meet.google.com/…" autoFocus aria-invalid={Boolean(e.enlace)} {...form.register('enlace')} />
            <FieldDescription>Tiene que empezar con http:// o https://</FieldDescription>
            <FieldError errors={[e.enlace]} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending && <Loader2 className="animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
