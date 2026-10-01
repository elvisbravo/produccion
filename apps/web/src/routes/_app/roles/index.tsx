import { zodResolver } from '@hookform/resolvers/zod'
import { rolSchema, type RolDatos, type RolFormulario } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { AlertCircle, Loader2, Lock, Plus, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { rolesQuery, useCrearRol } from '@/features/administracion/api'
import { aplicarErroresApi } from '@/lib/formularios'
import { exigirPermiso } from '@/lib/guardas'
import { usePermiso } from '@/lib/permisos'

export const Route = createFileRoute('/_app/roles/')({
  beforeLoad: () => exigirPermiso('roles.ver'),
  component: Roles,
})

function Roles() {
  const { data, isPending } = useQuery(rolesQuery)
  const puedeCrear = usePermiso('roles.crear')
  const [creando, setCreando] = useState(false)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Roles y permisos</h1>
          <p className="text-sm text-muted-foreground">Cada rol reúne lo que pueden ver y hacer quienes lo tienen. Los cambios se aplican al instante.</p>
        </div>
        {puedeCrear && (
          <Button onClick={() => setCreando(true)}>
            <Plus />
            Nuevo rol
          </Button>
        )}
      </div>
      {isPending || !data ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((r) => (
            <Link key={r.id} to="/roles/$id" params={{ id: r.id }} className="rounded-xl transition-shadow hover:ring-2 hover:ring-ring/30">
              <Card className="h-full gap-2 py-4">
                <CardHeader className="px-4">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <ShieldCheck className="size-4" />
                    {r.nombre}
                    {r.esSistema && (
                      <Badge variant="outline">
                        <Lock />
                        Base
                      </Badge>
                    )}
                    {!r.activo && <Badge variant="secondary">Inactivo</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {r.descripcion}
                    <br />
                    {r.usuarios} {r.usuarios === 1 ? 'usuario' : 'usuarios'} · {r.codigo === 'ADMIN' ? 'todos los permisos' : `${r.permisos} permisos`}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {creando && <DialogoRol onCerrar={() => setCreando(false)} />}
    </div>
  )
}

function DialogoRol({ onCerrar }: { onCerrar: () => void }) {
  const crear = useCrearRol()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<RolFormulario, unknown, RolDatos>({ resolver: zodResolver(rolSchema), defaultValues: { nombre: '', descripcion: '', activo: true } })
  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      const r = await crear.mutateAsync(datos)
      toast.success(`Rol "${r.nombre}" creado: ahora elige sus permisos`)
      onCerrar()
      void navigate({ to: '/roles/$id', params: { id: r.id } })
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['nombre', 'descripcion']))
    }
  })
  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Nuevo rol</DialogTitle>
            <DialogDescription>Empieza sin permisos; luego marcas los que necesita.</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={Boolean(form.formState.errors.nombre)}>
            <FieldLabel htmlFor="rol-nombre">Nombre</FieldLabel>
            <Input id="rol-nombre" placeholder="Ej.: Practicante" {...form.register('nombre')} />
            <FieldError errors={[form.formState.errors.nombre]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="rol-desc">Descripción</FieldLabel>
            <Textarea id="rol-desc" rows={2} {...form.register('descripcion')} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
