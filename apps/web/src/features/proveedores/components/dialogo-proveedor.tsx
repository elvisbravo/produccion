import { proveedorSchema, type ProveedorDatos, type ProveedorFormulario, type ProveedorItem } from '@grupoes/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Requerido } from '@/components/requerido'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { aplicarErroresApi } from '@/lib/formularios'
import { useGuardarProveedor } from '../api'

/** Crear o editar un proveedor: nombres y apellidos; el celular, el correo y las notas son opcionales. */
export function DialogoProveedor({ proveedor, abierto, onAbiertoChange, onGuardado }: { proveedor: ProveedorItem | null; abierto: boolean; onAbiertoChange: (abierto: boolean) => void; onGuardado?: (p: ProveedorItem) => void }) {
  const guardar = useGuardarProveedor(proveedor?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<ProveedorFormulario, unknown, ProveedorDatos>({
    resolver: zodResolver(proveedorSchema),
    defaultValues: { nombres: proveedor?.nombres ?? '', apellidos: proveedor?.apellidos ?? '', celular: proveedor?.celular ?? '', email: proveedor?.email ?? '', notas: proveedor?.notas ?? '' },
  })
  const e = form.formState.errors

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      const guardado = await guardar.mutateAsync(datos)
      toast.success(proveedor ? 'Proveedor actualizado' : 'Proveedor registrado')
      onGuardado?.(guardado)
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['nombres', 'apellidos', 'celular', 'email', 'notas']))
    }
  })

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
            <DialogDescription>Basta con sus nombres y apellidos; el resto puedes completarlo cuando quieras.</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(e.nombres)}>
              <FieldLabel htmlFor="prv-nombres">
                <span>
                  Nombres <Requerido />
                </span>
              </FieldLabel>
              <Input id="prv-nombres" aria-invalid={Boolean(e.nombres)} {...form.register('nombres')} />
              <FieldError errors={[e.nombres]} />
            </Field>
            <Field data-invalid={Boolean(e.apellidos)}>
              <FieldLabel htmlFor="prv-apellidos">
                <span>
                  Apellidos <Requerido />
                </span>
              </FieldLabel>
              <Input id="prv-apellidos" aria-invalid={Boolean(e.apellidos)} {...form.register('apellidos')} />
              <FieldError errors={[e.apellidos]} />
            </Field>
            <Field data-invalid={Boolean(e.celular)}>
              <FieldLabel htmlFor="prv-celular">Celular</FieldLabel>
              <Input id="prv-celular" inputMode="tel" aria-invalid={Boolean(e.celular)} {...form.register('celular')} />
              <FieldError errors={[e.celular]} />
            </Field>
            <Field data-invalid={Boolean(e.email)}>
              <FieldLabel htmlFor="prv-email">Correo</FieldLabel>
              <Input id="prv-email" type="email" aria-invalid={Boolean(e.email)} {...form.register('email')} />
              <FieldError errors={[e.email]} />
            </Field>
          </div>
          <Field data-invalid={Boolean(e.notas)}>
            <FieldLabel htmlFor="prv-notas">Notas</FieldLabel>
            <Textarea id="prv-notas" rows={2} maxLength={500} {...form.register('notas')} />
            <FieldError errors={[e.notas]} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
