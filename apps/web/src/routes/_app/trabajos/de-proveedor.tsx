import { diaEnLima, trabajoProveedorSchema, type TrabajoProveedorDatos, type TrabajoProveedorFormulario } from '@grupoes/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { AlertCircle, ArrowLeft, Loader2, Plus } from 'lucide-react'
import { useState } from 'react'
import { Controller, FormProvider, useForm, useWatch, type FieldValues, type UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Requerido } from '@/components/requerido'
import { SelectorRemoto } from '@/components/selector-remoto'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DialogoProveedor } from '@/features/proveedores/components/dialogo-proveedor'
import { proveedoresQuery, useRegistrarTrabajoDeProveedor } from '@/features/proveedores/api'
import { buscarCatalogo, catalogosProspectoQuery, crearEnCatalogo } from '@/features/prospectos/api'
import { actividadesQuery } from '@/features/tareas/api'
import { CamposCobro, cobroVacio } from '@/features/trabajos/components/cobro'
import { duracion } from '@/lib/formato'
import { aplicarErroresApi } from '@/lib/formularios'
import { exigirPermiso } from '@/lib/guardas'
import { usePermiso } from '@/lib/permisos'

export const Route = createFileRoute('/_app/trabajos/de-proveedor')({
  validateSearch: z.object({ proveedor: z.uuid().optional().catch(undefined) }),
  beforeLoad: () => exigirPermiso('trabajos.registrar_de_proveedor'),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogosProspectoQuery),
  component: RegistrarTrabajoDeProveedor,
})

function RegistrarTrabajoDeProveedor() {
  const { proveedor: proveedorInicial } = Route.useSearch()
  const navigate = useNavigate()
  const { data: catalogos } = useSuspenseQuery(catalogosProspectoQuery)
  const { data: proveedores } = useQuery(proveedoresQuery({ estado: 'activos', porPagina: 100 }))
  const { data: actividades = [] } = useQuery(actividadesQuery('cliente'))
  const puedeCobrar = usePermiso('contratos.crear')
  const puedeCrearProveedor = usePermiso('proveedores.crear')
  const registrar = useRegistrarTrabajoDeProveedor()
  const [error, setError] = useState<string | null>(null)
  const [conCobro, setConCobro] = useState(false)
  const [nuevoProveedor, setNuevoProveedor] = useState(false)
  const [etiquetas, setEtiquetas] = useState<{ universidad?: string; carrera?: string }>({})

  const form = useForm<TrabajoProveedorFormulario, unknown, TrabajoProveedorDatos>({
    resolver: zodResolver(trabajoProveedorSchema),
    defaultValues: {
      proveedorId: proveedorInicial ?? '',
      tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Tesis')?.id ?? '',
      titulo: '',
      prioridadId: catalogos.prioridades.find((p) => p.porDefecto)?.id ?? '',
      nivelAcademicoId: '',
      universidadId: '',
      carreraId: '',
      fechaLimite: '',
      linkDrive: '',
      observaciones: '',
      actividadId: '',
      minutosEstimados: '' as unknown as number,
    },
  })
  const { control, register, setValue, unregister, formState } = form
  const e = formState.errors
  const actividadId = useWatch({ control, name: 'actividadId' })
  const minutos = Number(useWatch({ control, name: 'minutosEstimados' }))
  const actividad = actividades.find((a) => a.id === actividadId)

  const alternarCobro = (v: boolean) => {
    setConCobro(v)
    if (v) setValue('cobro', cobroVacio())
    else unregister('cobro')
  }

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      const trabajo = await registrar.mutateAsync(datos)
      toast.success(`Trabajo ${trabajo.codigo} registrado`)
      void navigate({ to: '/trabajos/$id', params: { id: trabajo.id } })
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['proveedorId', 'tipoTrabajoId', 'titulo', 'prioridadId', 'nivelAcademicoId', 'universidadId', 'carreraId', 'fechaLimite', 'linkDrive', 'observaciones', 'actividadId', 'minutosEstimados', 'cobro']))
    }
  })

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col gap-3">
        <Link to="/proveedores" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Proveedores
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Registrar trabajo de un proveedor</h1>
          <p className="text-sm text-muted-foreground">No pasa por el seguimiento comercial ni lleva contrato. Queda sin equipo: arma el equipo y genera el plan desde su ficha.</p>
        </div>
      </div>

      <FormProvider {...(form as unknown as UseFormReturn<FieldValues>)}>
        <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Trabajo</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(e.proveedorId)} className="sm:col-span-2">
                <FieldLabel htmlFor="tp-proveedor">
                  <span>
                    Proveedor <Requerido />
                  </span>
                </FieldLabel>
                <div className="flex gap-2">
                  <Controller
                    control={control}
                    name="proveedorId"
                    render={({ field }) => (
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <SelectTrigger id="tp-proveedor" className="flex-1" aria-invalid={Boolean(e.proveedorId)}>
                          <SelectValue placeholder="Seleccionar…" />
                        </SelectTrigger>
                        <SelectContent>
                          {proveedores?.datos.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nombres} {p.apellidos}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {puedeCrearProveedor && (
                    <Button type="button" variant="outline" onClick={() => setNuevoProveedor(true)}>
                      <Plus />
                      Nuevo
                    </Button>
                  )}
                </div>
                <FieldError errors={[e.proveedorId]} />
              </Field>

              <Field data-invalid={Boolean(e.titulo)} className="sm:col-span-2">
                <FieldLabel htmlFor="tp-titulo">
                  <span>
                    Título del trabajo <Requerido />
                  </span>
                </FieldLabel>
                <Input id="tp-titulo" aria-invalid={Boolean(e.titulo)} {...register('titulo')} />
                <FieldError errors={[e.titulo]} />
              </Field>

              <Field data-invalid={Boolean(e.tipoTrabajoId)}>
                <FieldLabel htmlFor="tp-tipo">
                  <span>
                    Tipo de trabajo <Requerido />
                  </span>
                </FieldLabel>
                <Controller
                  control={control}
                  name="tipoTrabajoId"
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger id="tp-tipo" className="w-full" aria-invalid={Boolean(e.tipoTrabajoId)}>
                        <SelectValue placeholder="Seleccionar…" />
                      </SelectTrigger>
                      <SelectContent>
                        {catalogos.tiposTrabajo.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[e.tipoTrabajoId]} />
              </Field>

              <Field data-invalid={Boolean(e.prioridadId)}>
                <FieldLabel htmlFor="tp-prioridad">
                  <span>
                    Prioridad <Requerido />
                  </span>
                </FieldLabel>
                <Controller
                  control={control}
                  name="prioridadId"
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger id="tp-prioridad" className="w-full" aria-invalid={Boolean(e.prioridadId)}>
                        <SelectValue placeholder="Seleccionar…" />
                      </SelectTrigger>
                      <SelectContent>
                        {catalogos.prioridades.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[e.prioridadId]} />
              </Field>

              <Field data-invalid={Boolean(e.nivelAcademicoId)}>
                <FieldLabel htmlFor="tp-nivel">
                  <span>
                    Nivel académico <Requerido />
                  </span>
                </FieldLabel>
                <Controller
                  control={control}
                  name="nivelAcademicoId"
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger id="tp-nivel" className="w-full" aria-invalid={Boolean(e.nivelAcademicoId)}>
                        <SelectValue placeholder="Seleccionar…" />
                      </SelectTrigger>
                      <SelectContent>
                        {catalogos.nivelesAcademicos.map((n) => (
                          <SelectItem key={n.id} value={n.id}>
                            {n.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[e.nivelAcademicoId]} />
              </Field>

              <Field data-invalid={Boolean(e.fechaLimite)}>
                <FieldLabel htmlFor="tp-fecha">
                  <span>
                    Fecha de entrega <Requerido />
                  </span>
                </FieldLabel>
                <Input id="tp-fecha" type="date" min={diaEnLima()} aria-invalid={Boolean(e.fechaLimite)} {...register('fechaLimite')} />
                <FieldError errors={[e.fechaLimite]} />
              </Field>

              <Field data-invalid={Boolean(e.universidadId)}>
                <FieldLabel htmlFor="tp-universidad">
                  <span>
                    Universidad <Requerido />
                  </span>
                </FieldLabel>
                <Controller
                  control={control}
                  name="universidadId"
                  render={({ field }) => (
                    <SelectorRemoto
                      id="tp-universidad"
                      clave="universidades"
                      valor={field.value}
                      etiqueta={etiquetas.universidad}
                      onCambio={(o) => {
                        field.onChange(o?.id ?? '')
                        setEtiquetas((x) => ({ ...x, universidad: o?.nombre }))
                      }}
                      buscar={(q, signal) => buscarCatalogo('universidades', q, signal)}
                      crear={(nombre) => crearEnCatalogo('universidades', nombre)}
                      placeholder="Buscar universidad…"
                    />
                  )}
                />
                <FieldError errors={[e.universidadId]} />
              </Field>

              <Field data-invalid={Boolean(e.carreraId)}>
                <FieldLabel htmlFor="tp-carrera">
                  <span>
                    Carrera <Requerido />
                  </span>
                </FieldLabel>
                <Controller
                  control={control}
                  name="carreraId"
                  render={({ field }) => (
                    <SelectorRemoto
                      id="tp-carrera"
                      clave="carreras"
                      valor={field.value}
                      etiqueta={etiquetas.carrera}
                      onCambio={(o) => {
                        field.onChange(o?.id ?? '')
                        setEtiquetas((x) => ({ ...x, carrera: o?.nombre }))
                      }}
                      buscar={(q, signal) => buscarCatalogo('carreras', q, signal)}
                      crear={(nombre) => crearEnCatalogo('carreras', nombre)}
                      placeholder="Buscar carrera…"
                    />
                  )}
                />
                <FieldError errors={[e.carreraId]} />
              </Field>

              <Field data-invalid={Boolean(e.linkDrive)} className="sm:col-span-2">
                <FieldLabel htmlFor="tp-drive">
                  <span>
                    Enlace de Drive <Requerido />
                  </span>
                </FieldLabel>
                <Input id="tp-drive" type="url" placeholder="https://drive.google.com/…" aria-invalid={Boolean(e.linkDrive)} {...register('linkDrive')} />
                <FieldError errors={[e.linkDrive]} />
              </Field>

              <Field data-invalid={Boolean(e.observaciones)} className="sm:col-span-2">
                <FieldLabel htmlFor="tp-obs">Observaciones</FieldLabel>
                <Textarea id="tp-obs" rows={3} {...register('observaciones')} />
                <FieldError errors={[e.observaciones]} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actividad y tiempo</CardTitle>
              <CardDescription>El trabajo tendrá una sola actividad. Al generar el plan se crea su tarea con este tiempo.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(e.actividadId)}>
                <FieldLabel htmlFor="tp-actividad">
                  <span>
                    Actividad <Requerido />
                  </span>
                </FieldLabel>
                <Controller
                  control={control}
                  name="actividadId"
                  render={({ field }) => (
                    <Select
                      value={field.value || undefined}
                      onValueChange={(v) => {
                        field.onChange(v)
                        const a = actividades.find((x) => x.id === v)
                        if (a) setValue('minutosEstimados', a.minutosEstimados, { shouldValidate: true })
                      }}
                    >
                      <SelectTrigger id="tp-actividad" className="w-full" aria-invalid={Boolean(e.actividadId)}>
                        <SelectValue placeholder="Seleccionar…" />
                      </SelectTrigger>
                      <SelectContent>
                        {actividades
                          .filter((a) => !a.requiereHoraFija)
                          .map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              <span className="size-2 rounded-full" style={{ backgroundColor: a.tipo.color }} aria-hidden="true" />
                              {a.nombre}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[e.actividadId]} />
              </Field>
              <Field data-invalid={Boolean(e.minutosEstimados)}>
                <FieldLabel htmlFor="tp-minutos">
                  <span>
                    Tiempo estimado (minutos) <Requerido />
                  </span>
                </FieldLabel>
                <Input id="tp-minutos" type="number" inputMode="numeric" min={15} step={15} aria-invalid={Boolean(e.minutosEstimados)} {...register('minutosEstimados')} />
                <FieldDescription>{Number.isFinite(minutos) && minutos > 0 ? duracion(minutos) : 'Se propone el de la actividad; puedes cambiarlo.'}</FieldDescription>
                <FieldError errors={[e.minutosEstimados]} />
              </Field>
              {actividad && (
                <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:col-span-2">
                  <span className="text-xs text-muted-foreground">Quién puede hacerla</span>
                  {actividad.participaciones.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{p.nombre}</span>
                      {p.roles.map((r) => (
                        <Badge key={r.codigo} variant={r.prioridad.nivel === 1 ? 'secondary' : 'outline'} className="text-[11px]">
                          {r.nombre} · {r.prioridad.nombre}
                        </Badge>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {puedeCobrar && (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <CardTitle>Cobro al proveedor</CardTitle>
                  <CardDescription>Opcional: lo que paga el proveedor por este trabajo. También puedes registrarlo después desde la ficha.</CardDescription>
                </div>
                <Label htmlFor="tp-con-cobro" className="flex items-center gap-2 font-normal">
                  <Checkbox id="tp-con-cobro" checked={conCobro} onCheckedChange={(v) => alternarCobro(v === true)} />
                  Registrar cobro
                </Label>
              </CardHeader>
              {conCobro && (
                <CardContent>
                  <CamposCobro prefijo="cobro" />
                </CardContent>
              )}
            </Card>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/proveedores">Cancelar</Link>
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting && <Loader2 className="animate-spin" />}
              Registrar trabajo
            </Button>
          </div>
        </form>
      </FormProvider>

      {nuevoProveedor && <DialogoProveedor proveedor={null} abierto onAbiertoChange={setNuevoProveedor} onGuardado={(p) => setValue('proveedorId', p.id, { shouldValidate: true })} />}
    </div>
  )
}
