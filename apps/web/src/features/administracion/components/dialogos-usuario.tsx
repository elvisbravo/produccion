import { zodResolver } from '@hookform/resolvers/zod'
import { crearUsuarioSchema, type CrearUsuarioDatos, type CrearUsuarioFormulario, type EditarUsuarioFormulario } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AlertCircle, Check, Copy, KeyRound, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, FormProvider, useForm, type UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { Requerido } from '@/components/requerido'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { aplicarErroresApi } from '@/lib/formularios'
import { rolesQuery, useCrearUsuario } from '../api'
import { CamposDocumentoUsuario } from './campos-documento-usuario'

/** Muestra una contraseña temporal una sola vez, con botón para copiarla. */
export function DialogoClaveTemporal({ clave, nombre, onCerrar }: { clave: string; nombre: string; onCerrar: () => void }) {
  const [copiada, setCopiada] = useState(false)
  const copiar = async () => {
    await navigator.clipboard.writeText(clave)
    setCopiada(true)
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contraseña temporal de {nombre}</DialogTitle>
          <DialogDescription>Entrégasela por un medio seguro. Solo se muestra ahora: al ingresar, deberá cambiarla.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <KeyRound className="size-4 text-muted-foreground" />
          <code className="flex-1 font-mono text-lg tracking-wider select-all">{clave}</code>
          <Button variant="ghost" size="sm" onClick={() => void copiar()}>
            {copiada ? <Check /> : <Copy />}
            {copiada ? 'Copiada' : 'Copiar'}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onCerrar}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DialogoNuevoUsuario({ onCerrar }: { onCerrar: () => void }) {
  const { data: roles } = useQuery(rolesQuery)
  const crear = useCrearUsuario()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [temporal, setTemporal] = useState<{ clave: string; nombre: string; id: string } | null>(null)
  const form = useForm<CrearUsuarioFormulario, unknown, CrearUsuarioDatos>({
    resolver: zodResolver(crearUsuarioSchema),
    defaultValues: { nombres: '', apellidos: '', email: '', celular: '', fechaNacimiento: '', tipoDocumento: 'DNI', numeroDocumento: '', rolIds: [], clave: '' },
  })
  const e = form.formState.errors

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      const r = await crear.mutateAsync(datos)
      toast.success(`Usuario creado: ${r.usuario.nombres} ${r.usuario.apellidos}`)
      if (r.claveTemporal) setTemporal({ clave: r.claveTemporal, nombre: r.usuario.nombres, id: r.usuario.id })
      else {
        onCerrar()
        void navigate({ to: '/usuarios/$id', params: { id: r.usuario.id } })
      }
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['nombres', 'apellidos', 'email', 'celular', 'fechaNacimiento', 'tipoDocumento', 'numeroDocumento', 'rolIds', 'clave']))
    }
  })

  if (temporal) {
    return (
      <DialogoClaveTemporal
        clave={temporal.clave}
        nombre={temporal.nombre}
        onCerrar={() => {
          onCerrar()
          void navigate({ to: '/usuarios/$id', params: { id: temporal.id } })
        }}
      />
    )
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <FormProvider {...(form as unknown as UseFormReturn<EditarUsuarioFormulario>)}>
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
            <DialogDescription>Recibirá una contraseña temporal y deberá cambiarla en su primer ingreso.</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <CamposDocumentoUsuario prefijo="nuevo-usuario" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(e.nombres)}>
              <FieldLabel htmlFor="u-nombres">
                <span>
                  Nombres <Requerido />
                </span>
              </FieldLabel>
              <Input id="u-nombres" {...form.register('nombres')} />
              <FieldError errors={[e.nombres]} />
            </Field>
            <Field data-invalid={Boolean(e.apellidos)}>
              <FieldLabel htmlFor="u-apellidos">
                <span>
                  Apellidos <Requerido />
                </span>
              </FieldLabel>
              <Input id="u-apellidos" {...form.register('apellidos')} />
              <FieldError errors={[e.apellidos]} />
            </Field>
          </div>
          <Field data-invalid={Boolean(e.email)}>
            <FieldLabel htmlFor="u-email">
              <span>
                Correo <Requerido />
              </span>
            </FieldLabel>
            <Input id="u-email" type="email" autoComplete="off" placeholder="nombre@grupoes.com" {...form.register('email')} />
            <FieldDescription>Con este correo ingresa al sistema.</FieldDescription>
            <FieldError errors={[e.email]} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="u-celular">Celular</FieldLabel>
              <Input id="u-celular" inputMode="tel" {...form.register('celular')} />
            </Field>
            <Field data-invalid={Boolean(e.fechaNacimiento)}>
              <FieldLabel htmlFor="u-nacimiento">Fecha de nacimiento</FieldLabel>
              <Input id="u-nacimiento" type="date" {...form.register('fechaNacimiento')} />
              <FieldDescription>Su cumpleaños es día libre.</FieldDescription>
            </Field>
          </div>
          <Field data-invalid={Boolean(e.rolIds)}>
            <FieldLabel>
              <span>
                Roles <Requerido />
              </span>
            </FieldLabel>
            <Controller
              control={form.control}
              name="rolIds"
              render={({ field }) => (
                <div className="grid gap-2 sm:grid-cols-2">
                  {roles
                    ?.filter((r) => r.activo)
                    .map((r) => (
                      <Label key={r.id} className="flex items-center gap-2 font-normal">
                        <Checkbox
                          checked={field.value.includes(r.id)}
                          onCheckedChange={(v) => field.onChange(v === true ? [...field.value, r.id] : field.value.filter((x) => x !== r.id))}
                        />
                        {r.nombre}
                      </Label>
                    ))}
                </div>
              )}
            />
            <FieldError errors={[e.rolIds as { message?: string } | undefined]} />
          </Field>
          <Field data-invalid={Boolean(e.clave)}>
            <FieldLabel htmlFor="u-clave">Contraseña inicial</FieldLabel>
            <Input id="u-clave" type="text" autoComplete="new-password" placeholder="Déjala vacía para generar una" {...form.register('clave')} />
            <FieldDescription>Al menos 10 caracteres, con letras y números. Igual deberá cambiarla al ingresar.</FieldDescription>
            <FieldError errors={[e.clave]} />
          </Field>
          <Alert>
            <KeyRound />
            <AlertTitle>El horario se ajusta después</AlertTitle>
            <AlertDescription>Sin horario propio usa el horario estándar. Puedes cambiarlo en Horarios y feriados.</AlertDescription>
          </Alert>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Crear usuario
            </Button>
          </DialogFooter>
        </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}
