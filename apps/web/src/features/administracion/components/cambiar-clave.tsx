import { zodResolver } from '@hookform/resolvers/zod'
import { cambiarClaveSchema, MIN_CLAVE, type CambiarClaveFormulario, type UsuarioSesion } from '@grupoes/shared'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { aplicarErroresApi } from '@/lib/formularios'
import { useSesion } from '@/stores/sesion'

/** Formulario para cambiar la contraseña propia (también el obligatorio del primer ingreso). */
export function FormularioCambiarClave({ onListo }: { onListo?: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm<CambiarClaveFormulario>({ resolver: zodResolver(cambiarClaveSchema), defaultValues: { actual: '', nueva: '', confirmacion: '' } })
  const e = form.formState.errors

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await api<void>('/auth/cambiar-clave', { method: 'POST', body: datos })
      const usuario = await api<UsuarioSesion>('/auth/me')
      useSesion.setState({ usuario })
      toast.success('Contraseña cambiada. Se cerraron tus otras sesiones abiertas.')
      form.reset()
      onListo?.()
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['actual', 'nueva', 'confirmacion']))
    }
  })

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Field data-invalid={Boolean(e.actual)}>
        <FieldLabel htmlFor="clave-actual">Contraseña actual</FieldLabel>
        <Input id="clave-actual" type="password" autoComplete="current-password" {...form.register('actual')} />
        <FieldError errors={[e.actual]} />
      </Field>
      <Field data-invalid={Boolean(e.nueva)}>
        <FieldLabel htmlFor="clave-nueva">Nueva contraseña</FieldLabel>
        <Input id="clave-nueva" type="password" autoComplete="new-password" {...form.register('nueva')} />
        <FieldDescription>Al menos {MIN_CLAVE} caracteres, con letras y números.</FieldDescription>
        <FieldError errors={[e.nueva]} />
      </Field>
      <Field data-invalid={Boolean(e.confirmacion)}>
        <FieldLabel htmlFor="clave-confirmacion">Repite la nueva contraseña</FieldLabel>
        <Input id="clave-confirmacion" type="password" autoComplete="new-password" {...form.register('confirmacion')} />
        <FieldError errors={[e.confirmacion]} />
      </Field>
      <Button type="submit" className="w-fit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
        Cambiar contraseña
      </Button>
    </form>
  )
}
