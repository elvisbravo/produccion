import { zodResolver } from '@hookform/resolvers/zod'
import { editarUsuarioSchema, NOMBRE_FUNCION_EQUIPO, type EditarUsuarioDatos, type EditarUsuarioFormulario, type UsuarioDetalle } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertCircle, ArrowLeft, CircleCheck, KeyRound, Loader2, Lock, LockOpen, Power, Timer, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CamposDocumentoUsuario } from '@/features/administracion/components/campos-documento-usuario'
import { posiblesResponsablesQuery, useReasignarLote } from '@/features/prospectos/api'
import { pendientesQuery, useActivarUsuario, useDesbloquear, useEditarUsuario, useRestablecerClave, useTopesUsuario, usuarioQuery } from '@/features/administracion/api'
import { DialogoClaveTemporal } from '@/features/administracion/components/dialogos-usuario'
import { CostoHoraUsuario } from '@/features/reportes/components/costo-hora'
import { ExcepcionesDelUsuario, PermisosEfectivos, RolesDelUsuario } from '@/features/administracion/components/permisos-usuario'
import { ApiError } from '@/lib/api'
import { formatearFechaHora, haceCuanto, nombreCompleto } from '@/lib/formato'
import { aplicarErroresApi } from '@/lib/formularios'
import { exigirPermiso } from '@/lib/guardas'
import { usePermiso } from '@/lib/permisos'
import { useSesion } from '@/stores/sesion'

export const Route = createFileRoute('/_app/usuarios/$id')({
  beforeLoad: () => exigirPermiso('usuarios.ver'),
  component: DetalleUsuario,
})

const mensaje = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo guardar')

function DetalleUsuario() {
  const { id } = Route.useParams()
  const { data: u, isPending } = useQuery(usuarioQuery(id))

  if (isPending || !u) {
    return (
      <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
        <Skeleton className="h-96" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col gap-3">
        <Link to="/usuarios" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Usuarios
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {u.nombres} {u.apellidos}
          </h1>
          {!u.activo && <Badge variant="outline">Inactivo</Badge>}
          {u.bloqueado && (
            <Badge variant="destructive">
              <Lock /> Bloqueado
            </Badge>
          )}
          {u.debeCambiarClave && <Badge variant="secondary">Debe cambiar su contraseña</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {u.email} · {u.roles.map((r) => r.nombre).join(', ')} · {u.ultimoAcceso ? `último ingreso ${haceCuanto(u.ultimoAcceso)}` : 'aún no ingresa'}
        </p>
      </div>

      <Tabs defaultValue="permisos">
        <TabsList>
          <TabsTrigger value="permisos">Roles y permisos</TabsTrigger>
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="seguridad">Seguridad</TabsTrigger>
        </TabsList>
        <TabsContent value="permisos" className="mt-4 flex flex-col gap-6">
          <RolesDelUsuario u={u} />
          <ExcepcionesDelUsuario u={u} />
          <PermisosEfectivos u={u} />
        </TabsContent>
        <TabsContent value="datos" className="mt-4 flex flex-col gap-6">
          <DatosUsuario key={u.id} u={u} />
          <TopesHorasExtra key={`topes-${u.id}`} u={u} />
          <CostoHoraUsuario usuarioId={u.id} />
        </TabsContent>
        <TabsContent value="seguridad" className="mt-4 flex flex-col gap-6">
          <Seguridad u={u} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function DatosUsuario({ u }: { u: UsuarioDetalle }) {
  const puede = usePermiso('usuarios.editar')
  const editar = useEditarUsuario(u.id)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<EditarUsuarioFormulario, unknown, EditarUsuarioDatos>({
    resolver: zodResolver(editarUsuarioSchema),
    defaultValues: {
      nombres: u.nombres,
      apellidos: u.apellidos,
      email: u.email,
      celular: u.celular ?? '',
      fechaNacimiento: u.fechaNacimiento ?? '',
      tipoDocumento: u.tipoDocumento ?? undefined,
      numeroDocumento: u.numeroDocumento ?? '',
    },
  })
  const e = form.formState.errors
  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await editar.mutateAsync(datos)
      toast.success('Datos guardados')
      form.reset(datos)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['nombres', 'apellidos', 'email', 'celular', 'fechaNacimiento', 'tipoDocumento', 'numeroDocumento']))
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos personales</CardTitle>
        <CardDescription>
          El horario de trabajo se cambia en{' '}
          <Link to="/calendario" className="underline">
            Horarios y feriados
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormProvider {...form}>
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!u.numeroDocumento && puede && (
            <Alert>
              <AlertCircle />
              <AlertDescription>Este usuario aún no tiene documento registrado. Complétalo para poder guardar cambios en sus datos.</AlertDescription>
            </Alert>
          )}
          <fieldset disabled={!puede} className="flex flex-col gap-4">
            <CamposDocumentoUsuario prefijo="editar-usuario" />
          </fieldset>
          <fieldset disabled={!puede} className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(e.nombres)}>
              <FieldLabel htmlFor="d-nombres">Nombres</FieldLabel>
              <Input id="d-nombres" {...form.register('nombres')} />
              <FieldError errors={[e.nombres]} />
            </Field>
            <Field data-invalid={Boolean(e.apellidos)}>
              <FieldLabel htmlFor="d-apellidos">Apellidos</FieldLabel>
              <Input id="d-apellidos" {...form.register('apellidos')} />
              <FieldError errors={[e.apellidos]} />
            </Field>
            <Field data-invalid={Boolean(e.email)}>
              <FieldLabel htmlFor="d-email">Correo</FieldLabel>
              <Input id="d-email" type="email" {...form.register('email')} />
              <FieldError errors={[e.email]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="d-celular">Celular</FieldLabel>
              <Input id="d-celular" inputMode="tel" {...form.register('celular')} />
            </Field>
            <Field data-invalid={Boolean(e.fechaNacimiento)}>
              <FieldLabel htmlFor="d-nacimiento">Fecha de nacimiento</FieldLabel>
              <Input id="d-nacimiento" type="date" {...form.register('fechaNacimiento')} />
              <FieldDescription>Su cumpleaños es día libre.</FieldDescription>
            </Field>
          </fieldset>
          {puede && (
            <Button type="submit" className="w-fit" disabled={!form.formState.isDirty || form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Guardar datos
            </Button>
          )}
        </form>
        </FormProvider>
      </CardContent>
    </Card>
  )
}

function TopesHorasExtra({ u }: { u: UsuarioDetalle }) {
  const puede = usePermiso('usuarios.editar')
  const guardar = useTopesUsuario(u.id)
  const [semanal, setSemanal] = useState(u.topes.semanal?.toString() ?? '')
  const [mensual, setMensual] = useState(u.topes.mensual?.toString() ?? '')
  const aNumero = (v: string) => (v === '' ? null : Number(v))
  const aplicar = async () => {
    try {
      await guardar.mutateAsync({ semanal: aNumero(semanal), mensual: aNumero(mensual) })
      toast.success('Topes guardados')
    } catch (err) {
      toast.error(mensaje(err))
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Timer className="size-4" />
          Tope de horas extra
        </CardTitle>
        <CardDescription>Solo si esta persona necesita un tope distinto del general (Parámetros). Vacío en ambos = usa el general.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-4">
        <Field className="w-36">
          <FieldLabel htmlFor="t-semanal">Por semana (h)</FieldLabel>
          <Input id="t-semanal" type="number" min={0} disabled={!puede} value={semanal} onChange={(ev) => setSemanal(ev.target.value)} />
        </Field>
        <Field className="w-36">
          <FieldLabel htmlFor="t-mensual">Por mes (h)</FieldLabel>
          <Input id="t-mensual" type="number" min={0} disabled={!puede} value={mensual} onChange={(ev) => setMensual(ev.target.value)} />
        </Field>
        {puede && (
          <Button variant="outline" onClick={() => void aplicar()} disabled={guardar.isPending}>
            Guardar topes
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

/** Pasa de una vez todos los prospectos abiertos de la persona a otra. */
function PasarProspectos({ desdeUsuarioId, cantidad }: { desdeUsuarioId: string; cantidad: number }) {
  const { data: personas } = useQuery(posiblesResponsablesQuery)
  const pasar = useReasignarLote()
  const [aUsuarioId, setAUsuarioId] = useState('')
  const hacer = async () => {
    try {
      const r = await pasar.mutateAsync({ desdeUsuarioId, aUsuarioId, motivo: 'Cambio de cartera' })
      toast.success(`${r.reasignados} ${r.reasignados === 1 ? 'prospecto pasó' : 'prospectos pasaron'} a su nuevo responsable`)
      if (r.tareasPendientes > 0) toast.info(`Quedan ${r.tareasPendientes} ${r.tareasPendientes === 1 ? 'tarea pendiente' : 'tareas pendientes'} de esos prospectos a nombre de la persona anterior: reasígnalas desde cada tarea.`)
    } catch (err) {
      toast.error(mensaje(err))
    }
  }
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-2">
      <Select value={aUsuarioId} onValueChange={setAUsuarioId}>
        <SelectTrigger size="sm" aria-label="Pasar los prospectos a" className="w-52 bg-background">
          <SelectValue placeholder="Pasarlos a…" />
        </SelectTrigger>
        <SelectContent>
          {personas
            ?.filter((x) => x.id !== desdeUsuarioId)
            .map((x) => (
              <SelectItem key={x.id} value={x.id}>
                {nombreCompleto(x)}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Button type="button" size="sm" variant="outline" className="bg-background" disabled={!aUsuarioId || pasar.isPending} onClick={() => void hacer()}>
        {pasar.isPending && <Loader2 className="animate-spin" />}
        Pasar {cantidad === 1 ? 'el prospecto' : `los ${cantidad}`}
      </Button>
    </span>
  )
}

function Seguridad({ u }: { u: UsuarioDetalle }) {
  const yo = useSesion((s) => s.usuario?.id)
  const puedeRestablecer = usePermiso('usuarios.restablecer_clave')
  const puedeDesactivar = usePermiso('usuarios.desactivar')
  const puedeEditar = usePermiso('usuarios.editar')
  const puedeReasignarProspectos = usePermiso('prospectos.reasignar')
  const restablecer = useRestablecerClave(u.id)
  const activar = useActivarUsuario(u.id)
  const desbloquear = useDesbloquear(u.id)
  const [confirmar, setConfirmar] = useState<'clave' | 'desactivar' | null>(null)
  const [temporal, setTemporal] = useState<string | null>(null)
  // Al desactivar se avisa de lo que la persona deja a su nombre.
  const pendientes = useQuery({ ...pendientesQuery(u.id), enabled: confirmar === 'desactivar' })
  const pend = pendientes.data

  const hacer = async (accion: () => Promise<unknown>, exito: string) => {
    try {
      await accion()
      toast.success(exito)
    } catch (err) {
      toast.error(mensaje(err))
    } finally {
      setConfirmar(null)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Acceso</CardTitle>
          <CardDescription>Contraseña, bloqueo por intentos fallidos y estado de la cuenta.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {puedeRestablecer && (
            <Button variant="outline" onClick={() => setConfirmar('clave')}>
              <KeyRound />
              Restablecer contraseña
            </Button>
          )}
          {puedeEditar && u.bloqueado && (
            <Button variant="outline" onClick={() => void hacer(() => desbloquear.mutateAsync(undefined), 'Cuenta desbloqueada')}>
              <LockOpen />
              Desbloquear
            </Button>
          )}
          {puedeDesactivar &&
            u.id !== yo &&
            (u.activo ? (
              <Button variant="outline" className="text-destructive" onClick={() => setConfirmar('desactivar')}>
                <Power />
                Desactivar
              </Button>
            ) : (
              <Button variant="outline" onClick={() => void hacer(() => activar.mutateAsync(true), 'Usuario activado')}>
                <Power />
                Activar
              </Button>
            ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Últimos ingresos</CardTitle>
        </CardHeader>
        <CardContent>
          {u.accesos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay ingresos.</p>
          ) : (
            <ul className="divide-y text-sm">
              {u.accesos.map((a) => (
                <li key={a.fecha} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <Badge variant={a.resultado === 'exito' ? 'secondary' : 'destructive'}>{{ exito: 'Ingresó', fallo: 'Falló', bloqueado: 'Bloqueado' }[a.resultado]}</Badge>
                  <span className="tabular-nums">{formatearFechaHora(a.fecha)}</span>
                  <span className="max-w-full truncate text-xs text-muted-foreground">{[a.ip, a.dispositivo].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {confirmar && (
        <Dialog open onOpenChange={(v) => !v && setConfirmar(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{confirmar === 'clave' ? 'Restablecer contraseña' : `Desactivar a ${u.nombres}`}</DialogTitle>
              <DialogDescription>
                {confirmar === 'clave'
                  ? 'Se genera una contraseña temporal, se desbloquea la cuenta y se cierran sus sesiones abiertas. Deberá cambiarla al ingresar.'
                  : 'No podrá ingresar y se cierran sus sesiones al instante. Sus datos y su historial se conservan; puedes activarlo después.'}
              </DialogDescription>
            </DialogHeader>
            {confirmar === 'desactivar' &&
              (pendientes.isPending ? (
                <Skeleton className="h-24" />
              ) : pend && pend.total > 0 ? (
                <Alert className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
                  <TriangleAlert />
                  <AlertTitle>Tiene trabajo a su nombre</AlertTitle>
                  <AlertDescription className="flex flex-col gap-2">
                    <p>Si lo desactivas ahora, esto seguirá a su nombre y nadie lo verá avanzar. Reasígnalo antes.</p>
                    <ul className="list-disc space-y-1.5 pl-5">
                      {pend.tareas.total > 0 && (
                        <li>
                          {pend.tareas.total} {pend.tareas.total === 1 ? 'tarea pendiente' : 'tareas pendientes'}
                          {pend.tareas.conHora > 0 && ` (${pend.tareas.enCola} en su cola, ${pend.tareas.conHora} con día y hora)`}.{' '}
                          <Link to="/programacion" search={{ vista: 'colas' }} className="underline">
                            Reasignar en Programación → Colas
                          </Link>
                        </li>
                      )}
                      {pend.trabajos.length > 0 && (
                        <li>
                          {pend.trabajos.length} {pend.trabajos.length === 1 ? 'trabajo activo' : 'trabajos activos'} en su equipo. Cambia el equipo de cada uno:
                          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                            {pend.trabajos.slice(0, 6).map((t) => (
                              <Link key={t.id} to="/trabajos/$id" params={{ id: t.id }} className="font-mono text-xs underline">
                                {t.codigo} · {NOMBRE_FUNCION_EQUIPO[t.funcion]}
                              </Link>
                            ))}
                            {pend.trabajos.length > 6 && <span className="text-xs">y {pend.trabajos.length - 6} más</span>}
                          </span>
                        </li>
                      )}
                      {pend.prospectos > 0 && (
                        <li>
                          {pend.prospectos} {pend.prospectos === 1 ? 'prospecto abierto' : 'prospectos abiertos'} a su cargo.
                          {puedeReasignarProspectos ? <PasarProspectos desdeUsuarioId={u.id} cantidad={pend.prospectos} /> : ' Pídele a quien pueda reasignarlos que los pase a otra persona.'}
                        </li>
                      )}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : pend ? (
                <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                  <CircleCheck className="size-4" />
                  No tiene tareas, trabajos ni prospectos pendientes.
                </p>
              ) : null)}
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmar(null)}>
                Cancelar
              </Button>
              <Button
                variant={confirmar === 'clave' ? 'default' : 'destructive'}
                disabled={restablecer.isPending || activar.isPending || (confirmar === 'desactivar' && pendientes.isPending)}
                onClick={() =>
                  void (confirmar === 'clave'
                    ? hacer(async () => setTemporal((await restablecer.mutateAsync()).claveTemporal), 'Contraseña restablecida')
                    : hacer(() => activar.mutateAsync(false), 'Usuario desactivado'))
                }
              >
                {(restablecer.isPending || activar.isPending) && <Loader2 className="animate-spin" />}
                {confirmar === 'clave' ? 'Restablecer' : pend && pend.total > 0 ? 'Desactivar de todos modos' : 'Desactivar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {temporal && <DialogoClaveTemporal clave={temporal} nombre={u.nombres} onCerrar={() => setTemporal(null)} />}
    </>
  )
}
