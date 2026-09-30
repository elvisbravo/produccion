import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginInput } from '@grupoes/shared'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Monograma } from '@/components/marca'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { ApiError } from '@/lib/api'
import { iniciarSesion, restaurarSesion } from '@/lib/sesion'

const busquedaSchema = z.object({
  redirect: z.string().optional(),
  motivo: z.enum(['inactividad', 'expirada']).optional(),
})

/** Solo se permite volver a rutas internas (evita redirecciones abiertas). */
const destinoSeguro = (redirect?: string) => (redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : '/')

export const Route = createFileRoute('/login')({
  validateSearch: busquedaSchema,
  beforeLoad: async ({ search }) => {
    if (await restaurarSesion()) throw redirect({ href: destinoSeguro(search.redirect) })
  },
  component: PaginaLogin,
})

const MENSAJE_MOTIVO = {
  inactividad: 'Tu sesión se cerró por inactividad. Vuelve a ingresar.',
  expirada: 'Tu sesión expiró. Vuelve a ingresar.',
} as const

function PaginaLogin() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const [verPassword, setVerPassword] = useState(false)
  const [errorServidor, setErrorServidor] = useState<string | null>(null)

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const enviar = form.handleSubmit(async (datos) => {
    setErrorServidor(null)
    try {
      await iniciarSesion(datos)
      await navigate({ href: destinoSeguro(search.redirect), replace: true })
    } catch (error) {
      setErrorServidor(error instanceof ApiError ? error.message : 'No se pudo iniciar sesión')
      form.setFocus('password')
    }
  })

  const aviso = errorServidor ?? (search.motivo ? MENSAJE_MOTIVO[search.motivo] : null)

  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between bg-zinc-950 p-10 text-zinc-50 lg:flex">
        <div className="flex items-center gap-3">
          <Monograma className="bg-zinc-50 text-zinc-950" />
          <span className="text-sm font-semibold tracking-wide">GRUPO ES</span>
        </div>
        <div className="max-w-md space-y-4">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">
            Del primer contacto a la entrega final, en un solo lugar.
          </h2>
          <p className="text-sm text-zinc-400">
            Prospectos, enfoques, contratos, programación del equipo y control de calidad de cada trabajo.
          </p>
        </div>
        <p className="text-xs text-zinc-500">Sistema de Producción · uso interno</p>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <Monograma className="mb-6 lg:hidden" />
            <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
            <p className="text-sm text-muted-foreground">Ingresa con tu correo de GRUPO ES.</p>
          </div>

          {aviso && (
            <Alert variant={errorServidor ? 'destructive' : 'default'}>
              <AlertCircle />
              <AlertDescription>{aviso}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={enviar} noValidate>
            <FieldGroup>
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="email">Correo</FieldLabel>
                    <Input
                      {...field}
                      id="email"
                      type="email"
                      autoComplete="username"
                      autoFocus
                      placeholder="nombre@grupoes.com"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.error && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="password"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        {...field}
                        id="password"
                        type={verPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        aria-invalid={fieldState.invalid}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          size="icon-xs"
                          aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                          onClick={() => setVerPassword((v) => !v)}
                        >
                          {verPassword ? <EyeOff /> : <Eye />}
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                    {fieldState.error && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                Ingresar
              </Button>
            </FieldGroup>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            ¿Olvidaste tu contraseña? Pide al administrador que la restablezca.
          </p>
        </div>
      </main>
    </div>
  )
}
