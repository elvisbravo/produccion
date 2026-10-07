import {
  clienteDirectoSchema,
  diaEnLima,
  METODOS_PAGO,
  NOMBRE_METODO_PAGO,
  NOMBRE_TIPO_DOCUMENTO,
  TIPOS_DOCUMENTO,
  type ClienteDirectoDatos,
  type ClienteDirectoFormulario,
  type VistaPreviaInicio,
  type TipoDocumento,
} from '@grupoes/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { AlertCircle, ArrowLeft, Loader2, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, FormProvider, useFieldArray, useForm, useFormContext, useWatch, type FieldValues, type UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { Requerido } from '@/components/requerido'
import { SelectorRemoto } from '@/components/selector-remoto'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { BotonBuscarDni } from '@/features/consultas/components/boton-buscar-dni'
import { buscarCatalogo, catalogosProspectoQuery, crearEnCatalogo } from '@/features/prospectos/api'
import { proveedoresQuery } from '@/features/proveedores/api'
import { actividadesQuery } from '@/features/tareas/api'
import { candidatosEquipoQuery, responsablesClienteDirectoQuery, useRegistrarClienteDirecto, vistaPreviaInicioQuery } from '@/features/trabajos/api'
import { useDebounce } from '@/hooks/use-debounce'
import { duracion, formatearFecha, formatearFechaHora } from '@/lib/formato'
import { CamposCobro, cobroVacio } from '@/features/trabajos/components/cobro'
import { aplicarErroresApi } from '@/lib/formularios'
import { exigirPermiso } from '@/lib/guardas'

export const Route = createFileRoute('/_app/trabajos/cliente-directo')({
  beforeLoad: () => exigirPermiso('trabajos.registrar_cliente_directo'),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(catalogosProspectoQuery), context.queryClient.ensureQueryData(responsablesClienteDirectoQuery)]),
  component: RegistrarClienteDirecto,
})

/** Hora de inicio sugerida: la próxima hora en punto (entre las 07:00 y las 21:00), en hora de Lima. */
function horaSugerida(): string {
  const [h] = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Lima' }).format(new Date()).split(':').map(Number)
  return `${String(Math.min(21, Math.max(7, h + 1))).padStart(2, '0')}:00`
}

const integranteVacio = (esTitular: boolean) => ({ celular: '', nombres: '', apellidos: '', email: '', tipoDocumento: 'DNI' as TipoDocumento, numeroDocumento: '', esTitular })

/** El botón de consulta de DNI de un integrante (un componente aparte porque usa hooks por fila). */
function BuscarDniIntegrante({ indice }: { indice: number }) {
  const { control, setValue } = useFormContext<ClienteDirectoFormulario>()
  const [tipo, numero] = useWatch({ control, name: [`integrantes.${indice}.tipoDocumento`, `integrantes.${indice}.numeroDocumento`] })
  return (
    <BotonBuscarDni
      tipo={tipo as TipoDocumento | ''}
      numero={numero as string}
      onEncontrado={(d) => {
        setValue(`integrantes.${indice}.nombres`, d.nombres, { shouldDirty: true, shouldValidate: true })
        setValue(`integrantes.${indice}.apellidos`, d.apellidos, { shouldDirty: true, shouldValidate: true })
      }}
    />
  )
}

function RegistrarClienteDirecto() {
  const navigate = useNavigate()
  const { data: catalogos } = useSuspenseQuery(catalogosProspectoQuery)
  const { data: responsables } = useSuspenseQuery(responsablesClienteDirectoQuery)
  const registrar = useRegistrarClienteDirecto()
  const [error, setError] = useState<string | null>(null)
  const [etiquetas, setEtiquetas] = useState<{ universidad?: string; carrera?: string }>({})
  const hoy = diaEnLima()

  const form = useForm<ClienteDirectoFormulario, unknown, ClienteDirectoDatos>({
    resolver: zodResolver(clienteDirectoSchema),
    defaultValues: {
      integrantes: [integranteVacio(true)],
      tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Tesis')?.id ?? '',
      prioridadId: catalogos.prioridades.find((p) => p.porDefecto)?.id ?? '',
      responsableId: '',
      proveedorId: '',
      programacion: { actividadId: '', minutosEstimados: '' as unknown as number, hora: horaSugerida(), auxiliarPrincipalId: '', jefeResponsableId: '', modoInicio: 'secuencial' as const },
      trabajo: { titulo: '', fechaInicio: hoy, fechaLimite: '', nivelAcademicoId: '', universidadId: '', carreraId: '', linkDrive: '' },
      contrato: { fechaFirma: hoy, ...cobroVacio(), observaciones: '' },
      observaciones: '',
      pagos: [],
    },
  })
  const { control, register, setValue, getValues, unregister, formState } = form
  const [conContrato, setConContrato] = useState(true)
  const [conActividad, setConActividad] = useState(true)
  const { data: actividades = [] } = useQuery({ ...actividadesQuery('cliente'), enabled: conActividad })
  const { data: candidatos } = useQuery({ ...candidatosEquipoQuery, enabled: conActividad })
  const alternarActividad = (v: boolean) => {
    setConActividad(v)
    if (v) setValue('programacion', { actividadId: '', minutosEstimados: '' as unknown as number, hora: horaSugerida(), auxiliarPrincipalId: '', jefeResponsableId: '', modoInicio: 'secuencial' as const })
    else unregister('programacion')
  }
  const [deProveedor, setDeProveedor] = useState(false)
  const { data: proveedores } = useQuery({ ...proveedoresQuery({ estado: 'activos', porPagina: 100 }), enabled: deProveedor })
  const alternarProveedor = (v: boolean) => {
    setDeProveedor(v)
    if (!v) setValue('proveedorId', '')
    // Con proveedor el integrante es opcional: si estaba en blanco se quita; al desmarcar vuelve el primero.
    const actuales = getValues('integrantes')
    const enBlanco = (i: (typeof actuales)[number]) => !i.celular && !i.nombres && !i.apellidos && !i.numeroDocumento && !i.email
    if (v && actuales.length === 1 && enBlanco(actuales[0])) integrantes.replace([])
    if (!v && actuales.length === 0) integrantes.replace([integranteVacio(true)])
  }
  const alternarContrato = (v: boolean) => {
    setConContrato(v)
    if (v) setValue('contrato', { fechaFirma: hoy, ...cobroVacio(), observaciones: '' })
    else {
      unregister('contrato')
      setValue('pagos', [])
    }
  }
  const e = formState.errors
  const integrantes = useFieldArray({ control, name: 'integrantes' })
  const pagos = useFieldArray({ control, name: 'pagos' })
  const tipo = catalogos.tiposTrabajo.find((t) => t.id === useWatch({ control, name: 'tipoTrabajoId' }))
  const maxIntegrantes = Math.min(tipo?.maxIntegrantes ?? 5, 5)
  const titular = useWatch({ control, name: 'integrantes' })?.findIndex((i) => i.esTitular) ?? -1
  const tiempoActividad = Number(useWatch({ control, name: 'programacion.minutosEstimados' })) || 0
  const fechaInicioForm = useWatch({ control, name: 'trabajo.fechaInicio' })
  const marcarTitular = (indice: number) => getValues('integrantes').forEach((_, i) => setValue(`integrantes.${i}.esTitular`, i === indice, { shouldDirty: true }))

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    if (deProveedor && !datos.proveedorId) return form.setError('proveedorId', { message: 'Elige al proveedor' })
    try {
      const trabajo = await registrar.mutateAsync(datos)
      toast.success(`Cliente registrado: trabajo ${trabajo.codigo}`)
      void navigate({ to: '/trabajos/$id', params: { id: trabajo.id } })
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['integrantes', 'tipoTrabajoId', 'prioridadId', 'responsableId', 'proveedorId', 'programacion', 'trabajo', 'contrato', 'pagos', 'observaciones']))
    }
  })

  const err = (r?: { message?: string } | null) => r?.message

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col gap-3">
        <Link to="/trabajos" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Trabajos
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Registrar cliente existente</h1>
          <p className="text-sm text-muted-foreground">Para quien ya tiene un trabajo contratado: se registra directo, sin pasar por el seguimiento comercial. Incluye su contrato y lo que ya pagó.</p>
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
              <CardTitle>Integrantes</CardTitle>
              <CardDescription>
                Cada integrante necesita celular, documento, nombres y apellidos; y al menos uno, un correo. Máximo {maxIntegrantes}. Si el celular ya existe, se reutiliza a la persona.
                {deProveedor && ' Como el trabajo es de un proveedor, los integrantes son opcionales: puedes registrar solo el trabajo.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <RadioGroup value={String(titular)} onValueChange={(v) => marcarTitular(Number(v))} className="flex flex-col gap-4">
                {integrantes.fields.map((f, i) => {
                  const ei = e.integrantes?.[i]
                  return (
                    <fieldset key={f.id} className="flex flex-col gap-3 rounded-lg border p-4">
                      <legend className="sr-only">Integrante {i + 1}</legend>
                      <div className="flex flex-wrap items-center gap-3">
                        <Label htmlFor={`int-${i}-titular`} className="flex items-center gap-2 font-normal">
                          <RadioGroupItem value={String(i)} id={`int-${i}-titular`} />
                          Titular (firma el contrato)
                        </Label>
                        {(integrantes.fields.length > 1 || deProveedor) && (
                          <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Quitar al integrante ${i + 1}`} onClick={() => integrantes.remove(i)}>
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field data-invalid={Boolean(ei?.celular)}>
                          <FieldLabel htmlFor={`int-${i}-cel`}>
                            <span>
                              Celular <Requerido />
                            </span>
                          </FieldLabel>
                          <Input id={`int-${i}-cel`} inputMode="tel" aria-invalid={Boolean(ei?.celular)} {...register(`integrantes.${i}.celular`)} />
                          <FieldError errors={[ei?.celular]} />
                        </Field>
                        <Field data-invalid={Boolean(ei?.nombres)}>
                          <FieldLabel htmlFor={`int-${i}-nom`}>
                            <span>
                              Nombres <Requerido />
                            </span>
                          </FieldLabel>
                          <Input id={`int-${i}-nom`} aria-invalid={Boolean(ei?.nombres)} {...register(`integrantes.${i}.nombres`)} />
                          <FieldError errors={[ei?.nombres]} />
                        </Field>
                        <Field data-invalid={Boolean(ei?.apellidos)}>
                          <FieldLabel htmlFor={`int-${i}-ape`}>
                            <span>
                              Apellidos <Requerido />
                            </span>
                          </FieldLabel>
                          <Input id={`int-${i}-ape`} aria-invalid={Boolean(ei?.apellidos)} {...register(`integrantes.${i}.apellidos`)} />
                          <FieldError errors={[ei?.apellidos]} />
                        </Field>
                        <Field data-invalid={Boolean(ei?.tipoDocumento)}>
                          <FieldLabel htmlFor={`int-${i}-tipo`}>
                            <span>
                              Tipo de documento <Requerido />
                            </span>
                          </FieldLabel>
                          <Controller
                            control={control}
                            name={`integrantes.${i}.tipoDocumento`}
                            render={({ field }) => (
                              <Select value={(field.value as string) || undefined} onValueChange={field.onChange}>
                                <SelectTrigger id={`int-${i}-tipo`} className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {TIPOS_DOCUMENTO.map((t) => (
                                    <SelectItem key={t} value={t}>
                                      {NOMBRE_TIPO_DOCUMENTO[t]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                          <FieldError errors={[ei?.tipoDocumento]} />
                        </Field>
                        <Field data-invalid={Boolean(ei?.numeroDocumento)}>
                          <FieldLabel htmlFor={`int-${i}-doc`}>
                            <span>
                              N.º de documento <Requerido />
                            </span>
                          </FieldLabel>
                          <Input id={`int-${i}-doc`} className="font-mono uppercase" aria-invalid={Boolean(ei?.numeroDocumento)} {...register(`integrantes.${i}.numeroDocumento`)} />
                          <FieldError errors={[ei?.numeroDocumento]} />
                        </Field>
                        <Field data-invalid={Boolean(ei?.email)}>
                          <FieldLabel htmlFor={`int-${i}-mail`}>Correo</FieldLabel>
                          <Input id={`int-${i}-mail`} type="email" aria-invalid={Boolean(ei?.email)} {...register(`integrantes.${i}.email`)} />
                          <FieldError errors={[ei?.email]} />
                        </Field>
                        <BuscarDniIntegrante indice={i} />
                      </div>
                    </fieldset>
                  )
                })}
              </RadioGroup>
              {integrantes.fields.length < maxIntegrantes && (
                <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => integrantes.append(integranteVacio(false))}>
                  <Plus />
                  Agregar integrante
                </Button>
              )}
              {err(e.integrantes?.root) ?? err(e.integrantes as { message?: string }) ? <p className="text-sm text-destructive">{err(e.integrantes?.root) ?? err(e.integrantes as { message?: string })}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trabajo</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(e.responsableId)} className="sm:col-span-2">
                <FieldLabel htmlFor="cd-responsable">
                  <span>
                    Asistente administrativo <Requerido />
                  </span>
                </FieldLabel>
                <Controller
                  control={control}
                  name="responsableId"
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger id="cd-responsable" className="w-full" aria-invalid={Boolean(e.responsableId)}>
                        <SelectValue placeholder="Quien lo capta y le da seguimiento…" />
                      </SelectTrigger>
                      <SelectContent>
                        {responsables.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.nombres} {u.apellidos}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[e.responsableId]} />
              </Field>
              <div className="flex flex-col gap-3 rounded-lg border p-3 sm:col-span-2">
                <Label htmlFor="cd-de-proveedor" className="flex items-center gap-2 font-normal">
                  <Checkbox id="cd-de-proveedor" checked={deProveedor} onCheckedChange={(v) => alternarProveedor(v === true)} />
                  Este trabajo lo entrega un proveedor
                </Label>
                {deProveedor && (
                  <Field data-invalid={Boolean(e.proveedorId)}>
                    <FieldLabel htmlFor="cd-proveedor">
                      <span>
                        Proveedor <Requerido />
                      </span>
                    </FieldLabel>
                    <Controller
                      control={control}
                      name="proveedorId"
                      render={({ field }) => (
                        <Select value={(field.value as string) || undefined} onValueChange={field.onChange}>
                          <SelectTrigger id="cd-proveedor" className="w-full" aria-invalid={Boolean(e.proveedorId)}>
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
                    <FieldDescription>El trabajo es de este cliente, pero lo entrega el proveedor y es quien paga: el cobro y los recibos salen a su nombre.</FieldDescription>
                    <FieldError errors={[e.proveedorId]} />
                  </Field>
                )}
              </div>
              <Field data-invalid={Boolean(e.trabajo?.titulo)} className="sm:col-span-2">
                <FieldLabel htmlFor="cd-titulo">Título del trabajo</FieldLabel>
                <Input id="cd-titulo" {...register('trabajo.titulo')} />
                <FieldError errors={[e.trabajo?.titulo]} />
              </Field>
              <Field data-invalid={Boolean(e.tipoTrabajoId)}>
                <FieldLabel htmlFor="cd-tipo">
                  <span>
                    Tipo de trabajo <Requerido />
                  </span>
                </FieldLabel>
                <Controller
                  control={control}
                  name="tipoTrabajoId"
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger id="cd-tipo" className="w-full" aria-invalid={Boolean(e.tipoTrabajoId)}>
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
                <FieldLabel htmlFor="cd-prioridad">
                  <span>
                    Prioridad <Requerido />
                  </span>
                </FieldLabel>
                <Controller
                  control={control}
                  name="prioridadId"
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger id="cd-prioridad" className="w-full" aria-invalid={Boolean(e.prioridadId)}>
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
              <Field data-invalid={Boolean(e.trabajo?.nivelAcademicoId)}>
                <FieldLabel htmlFor="cd-nivel">
                  <span>
                    Nivel académico <Requerido />
                  </span>
                </FieldLabel>
                <Controller
                  control={control}
                  name="trabajo.nivelAcademicoId"
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger id="cd-nivel" className="w-full" aria-invalid={Boolean(e.trabajo?.nivelAcademicoId)}>
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
                <FieldError errors={[e.trabajo?.nivelAcademicoId]} />
              </Field>
              <Field data-invalid={Boolean(e.trabajo?.universidadId)}>
                <FieldLabel htmlFor="cd-universidad">
                  <span>
                    Universidad <Requerido />
                  </span>
                </FieldLabel>
                <Controller
                  control={control}
                  name="trabajo.universidadId"
                  render={({ field }) => (
                    <SelectorRemoto
                      id="cd-universidad"
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
                <FieldError errors={[e.trabajo?.universidadId]} />
              </Field>
              <Field data-invalid={Boolean(e.trabajo?.carreraId)}>
                <FieldLabel htmlFor="cd-carrera">
                  <span>
                    Carrera <Requerido />
                  </span>
                </FieldLabel>
                <Controller
                  control={control}
                  name="trabajo.carreraId"
                  render={({ field }) => (
                    <SelectorRemoto
                      id="cd-carrera"
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
                <FieldError errors={[e.trabajo?.carreraId]} />
              </Field>
              <Field data-invalid={Boolean(e.trabajo?.fechaInicio)}>
                <FieldLabel htmlFor="cd-inicio">
                  <span>
                    Fecha de inicio <Requerido />
                  </span>
                </FieldLabel>
                <Input id="cd-inicio" type="date" {...register('trabajo.fechaInicio')} />
                <FieldError errors={[e.trabajo?.fechaInicio]} />
              </Field>
              <Field data-invalid={Boolean(e.trabajo?.fechaLimite)}>
                <FieldLabel htmlFor="cd-limite">
                  <span>
                    Fecha de entrega <Requerido />
                  </span>
                </FieldLabel>
                <Input id="cd-limite" type="date" aria-invalid={Boolean(e.trabajo?.fechaLimite)} {...register('trabajo.fechaLimite')} />
                <FieldError errors={[e.trabajo?.fechaLimite]} />
              </Field>
              <Field data-invalid={Boolean(e.trabajo?.linkDrive)} className="sm:col-span-2">
                <FieldLabel htmlFor="cd-drive">
                  <span>
                    Enlace de Drive <Requerido />
                  </span>
                </FieldLabel>
                <Input id="cd-drive" type="url" placeholder="https://drive.google.com/…" aria-invalid={Boolean(e.trabajo?.linkDrive)} {...register('trabajo.linkDrive')} />
                <FieldError errors={[e.trabajo?.linkDrive]} />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="cd-obs">Observaciones</FieldLabel>
                <Textarea id="cd-obs" rows={3} {...register('observaciones')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-1.5">
                <CardTitle>Primera actividad</CardTitle>
                <CardDescription>
                  {conActividad ? 'La actividad se programa desde la fecha de inicio, a la hora que indiques, con el equipo que la hará.' : 'No se programa nada por ahora: arma el equipo y genera el plan desde la ficha del trabajo.'}
                </CardDescription>
              </div>
              <Label htmlFor="cd-con-actividad" className="flex items-center gap-2 font-normal">
                <Checkbox id="cd-con-actividad" checked={conActividad} onCheckedChange={(v) => alternarActividad(v === true)} />
                Programar actividad
              </Label>
            </CardHeader>
            {conActividad && (
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={Boolean(e.programacion?.actividadId)} className="sm:col-span-2">
                  <FieldLabel htmlFor="cd-actividad">
                    <span>
                      Actividad <Requerido />
                    </span>
                  </FieldLabel>
                  <Controller
                    control={control}
                    name="programacion.actividadId"
                    render={({ field }) => (
                      <Select
                        value={field.value || undefined}
                        onValueChange={(v) => {
                          field.onChange(v)
                          const a = actividades.find((x) => x.id === v)
                          if (a) setValue('programacion.minutosEstimados', a.minutosEstimados, { shouldValidate: true })
                        }}
                      >
                        <SelectTrigger id="cd-actividad" className="w-full" aria-invalid={Boolean(e.programacion?.actividadId)}>
                          <SelectValue placeholder="Seleccionar…" />
                        </SelectTrigger>
                        <SelectContent>
                          {actividades
                            .filter((a) => !a.requiereHoraFija)
                            .map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                <span className="size-2 rounded-full" style={{ backgroundColor: a.tipo.color }} aria-hidden="true" />
                                {a.nombre} · {duracion(a.minutosEstimados)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[e.programacion?.actividadId]} />
                </Field>
                <Field data-invalid={Boolean(e.programacion?.minutosEstimados)}>
                  <FieldLabel htmlFor="cd-horas">
                    <span>
                      Tiempo estimado <Requerido />
                    </span>
                  </FieldLabel>
                  <Controller
                    control={control}
                    name="programacion.minutosEstimados"
                    render={({ field }) => {
                      const total = field.value as unknown as number | ''
                      const horas = total === '' || total === undefined ? '' : String(Math.floor(Number(total) / 60))
                      const mins = total === '' || total === undefined ? '' : String(Number(total) % 60)
                      const cambiar = (h: string, m: string) => field.onChange(h === '' && m === '' ? '' : (Number(h) || 0) * 60 + (Number(m) || 0))
                      return (
                        <div className="flex items-center gap-2">
                          <Input id="cd-horas" type="number" inputMode="numeric" min={0} max={999} placeholder="0" className="w-20" value={horas} onChange={(ev) => cambiar(ev.target.value, mins)} aria-invalid={Boolean(e.programacion?.minutosEstimados)} />
                          <span className="text-sm text-muted-foreground">h</span>
                          <Input id="cd-minutos" type="number" inputMode="numeric" min={0} max={59} step={5} placeholder="0" className="w-20" value={mins} onChange={(ev) => cambiar(horas, ev.target.value)} aria-label="Minutos" aria-invalid={Boolean(e.programacion?.minutosEstimados)} />
                          <span className="text-sm text-muted-foreground">min</span>
                        </div>
                      )
                    }}
                  />
                  <FieldDescription>{tiempoActividad > 0 ? `${duracion(tiempoActividad)} · se propone el del catálogo; puedes cambiarlo.` : 'Se propone el de la actividad; puedes cambiarlo.'}</FieldDescription>
                  <FieldError errors={[e.programacion?.minutosEstimados]} />
                </Field>
                <Field data-invalid={Boolean(e.programacion?.hora)}>
                  <FieldLabel htmlFor="cd-hora">
                    <span>
                      Hora de inicio <Requerido />
                    </span>
                  </FieldLabel>
                  <Input id="cd-hora" type="time" aria-invalid={Boolean(e.programacion?.hora)} {...register('programacion.hora')} />
                  <FieldDescription>{fechaInicioForm ? `Arranca el ${formatearFecha(fechaInicioForm)}. Puede ser una fecha y hora pasadas: se programa desde ahí y se ve en la agenda. El día se cambia en «Fecha de inicio» del trabajo.` : 'Elige la fecha de inicio del trabajo.'}</FieldDescription>
                  <FieldError errors={[e.programacion?.hora]} />
                </Field>
                <Field data-invalid={Boolean(e.programacion?.auxiliarPrincipalId)}>
                  <FieldLabel htmlFor="cd-aux">
                    <span>
                      Auxiliar principal <Requerido />
                    </span>
                  </FieldLabel>
                  <Controller
                    control={control}
                    name="programacion.auxiliarPrincipalId"
                    render={({ field }) => (
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <SelectTrigger id="cd-aux" className="w-full" aria-invalid={Boolean(e.programacion?.auxiliarPrincipalId)}>
                          <SelectValue placeholder={candidatos ? 'Seleccionar…' : 'Cargando…'} />
                        </SelectTrigger>
                        <SelectContent>
                          {candidatos?.auxiliares.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.nombres} {u.apellidos}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[e.programacion?.auxiliarPrincipalId]} />
                </Field>
                <Field data-invalid={Boolean(e.programacion?.jefeResponsableId)}>
                  <FieldLabel htmlFor="cd-jefe">
                    <span>
                      Jefe responsable <Requerido />
                    </span>
                  </FieldLabel>
                  <Controller
                    control={control}
                    name="programacion.jefeResponsableId"
                    render={({ field }) => (
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <SelectTrigger id="cd-jefe" className="w-full" aria-invalid={Boolean(e.programacion?.jefeResponsableId)}>
                          <SelectValue placeholder={candidatos ? 'Seleccionar…' : 'Cargando…'} />
                        </SelectTrigger>
                        <SelectContent>
                          {candidatos?.jefes.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.nombres} {u.apellidos}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[e.programacion?.jefeResponsableId]} />
                </Field>
                <PlanInicio />
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-1.5">
                <CardTitle>Contrato</CardTitle>
                <CardDescription>
                  {conContrato ? 'Con la fecha en que se firmó, aunque sea anterior a hoy.' : 'Sin monto por ahora: el contrato y los cobros se registran después desde la ficha del trabajo.'}
                </CardDescription>
              </div>
              <Label htmlFor="cd-con-contrato" className="flex items-center gap-2 font-normal">
                <Checkbox id="cd-con-contrato" checked={conContrato} onCheckedChange={(v) => alternarContrato(v === true)} />
                Registrar contrato
              </Label>
            </CardHeader>
            {conContrato && (
            <CardContent className="flex flex-col gap-4">
              <Field data-invalid={Boolean(e.contrato?.fechaFirma)} className="sm:max-w-xs">
                <FieldLabel htmlFor="cd-firma">
                  <span>
                    Fecha de firma <Requerido />
                  </span>
                </FieldLabel>
                <Input id="cd-firma" type="date" {...register('contrato.fechaFirma')} />
                <FieldError errors={[e.contrato?.fechaFirma]} />
              </Field>
              <CamposCobro prefijo="contrato" />
            </CardContent>
            )}
          </Card>

          {conContrato && (
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-1.5">
                <CardTitle>Pagos ya recibidos</CardTitle>
                <CardDescription>Lo que el cliente ya pagó, con su fecha real. Se genera su recibo y se descuenta del saldo.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => pagos.append({ monto: '' as unknown as number, fecha: hoy, metodo: 'yape', numeroOperacion: '', observaciones: '' })}>
                <Plus />
                Agregar pago
              </Button>
            </CardHeader>
            {pagos.fields.length > 0 && (
              <CardContent className="flex flex-col gap-3">
                {pagos.fields.map((f, i) => {
                  const ep = e.pagos?.[i]
                  return (
                    <div key={f.id} className="grid items-start gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                      <Field data-invalid={Boolean(ep?.monto)}>
                        <FieldLabel htmlFor={`pg-${i}-monto`}>Monto (S/)</FieldLabel>
                        <Input id={`pg-${i}-monto`} type="number" inputMode="decimal" step="0.01" aria-invalid={Boolean(ep?.monto)} {...register(`pagos.${i}.monto`)} />
                        <FieldError errors={[ep?.monto]} />
                      </Field>
                      <Field data-invalid={Boolean(ep?.fecha)}>
                        <FieldLabel htmlFor={`pg-${i}-fecha`}>Fecha</FieldLabel>
                        <Input id={`pg-${i}-fecha`} type="date" max={hoy} aria-invalid={Boolean(ep?.fecha)} {...register(`pagos.${i}.fecha`)} />
                        <FieldError errors={[ep?.fecha]} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`pg-${i}-metodo`}>Método</FieldLabel>
                        <Controller
                          control={control}
                          name={`pagos.${i}.metodo`}
                          render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger id={`pg-${i}-metodo`} className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {METODOS_PAGO.map((m) => (
                                  <SelectItem key={m} value={m}>
                                    {NOMBRE_METODO_PAGO[m]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`pg-${i}-op`}>N.º de operación</FieldLabel>
                        <Input id={`pg-${i}-op`} {...register(`pagos.${i}.numeroOperacion`)} />
                      </Field>
                      <Button type="button" variant="ghost" size="icon-sm" className="mt-7" aria-label={`Quitar el pago ${i + 1}`} onClick={() => pagos.remove(i)}>
                        <Trash2 />
                      </Button>
                    </div>
                  )
                })}
                {err(e.pagos?.root) ?? err(e.pagos as { message?: string }) ? <p className="text-sm text-destructive">{err(e.pagos?.root) ?? err(e.pagos as { message?: string })}</p> : null}
              </CardContent>
            )}
          </Card>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/trabajos">Cancelar</Link>
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting && <Loader2 className="animate-spin" />}
              Registrar cliente
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  )
}

/**
 * Cuándo empezaría la primera actividad: si el auxiliar no tiene nada, en la fecha y hora indicadas; si ya tiene actividades, a continuación
 * de la última (recomendado) o, desmarcando, a la hora exacta, comprobando que no se cruce con otra actividad suya.
 */
function PlanInicio() {
  const { control, setValue } = useFormContext<ClienteDirectoFormulario>()
  const [auxiliarId, fecha, hora, minutosForm, modo, limite, faltante] = useWatch({
    control,
    name: ['programacion.auxiliarPrincipalId', 'trabajo.fechaInicio', 'programacion.hora', 'programacion.minutosEstimados', 'programacion.modoInicio', 'trabajo.fechaLimite', 'programacion.faltante'],
  })
  const minutos = Number(useDebounce(String(minutosForm ?? ''), 400)) || 0
  const fijo = modo === 'fijo'
  const listo = Boolean(auxiliarId && fecha && /^\d{2}:\d{2}$/.test(hora ?? '') && minutos >= 15)
  const { data, isFetching } = useQuery({ ...vistaPreviaInicioQuery({ auxiliarId: auxiliarId ?? '', fecha: fecha ?? '', hora: hora ?? '', minutos, fijo, limite: limite || undefined }), enabled: listo })
  // Si al cambiar los datos ya no falta nada, se descarta la propuesta que se había elegido.
  useEffect(() => {
    if (faltante && data && data.faltanMinutos === 0) setValue('programacion.faltante', undefined as never)
  }, [faltante, data, setValue])
  if (!listo) return <p className="text-sm text-muted-foreground sm:col-span-2">Elige el auxiliar, la hora y el tiempo para ver cuándo empezaría.</p>

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:col-span-2" aria-live="polite">
      {!data ? (
        <span className="text-muted-foreground">Calculando…</span>
      ) : !data.tieneActividades ? (
        <span>
          El auxiliar no tiene actividades pendientes: empieza <strong>{data.inicio ? formatearFechaHora(data.inicio) : 'en su próximo horario libre'}</strong>
          {data.fin && <> y termina {formatearFechaHora(data.fin)}</>}.
        </span>
      ) : (
        <>
          <label className="flex items-start gap-2">
            <Checkbox checked={!fijo} onCheckedChange={(v) => setValue('programacion.modoInicio', v === true ? 'secuencial' : 'fijo', { shouldDirty: true })} className="mt-0.5" />
            <span>
              <span className="font-medium">Seguir a continuación de lo que ya tiene el auxiliar</span>
              <span className="block text-xs text-muted-foreground">Recomendado. Desmárcalo para fijar la hora de inicio exacta; se comprueba que no se cruce con otras actividades.</span>
            </span>
          </label>
          {!fijo ? (
            <span className={isFetching ? 'opacity-60' : undefined}>
              {data.inicio ? (
                <>
                  Empezaría <strong>{formatearFechaHora(data.inicio)}</strong>
                  {data.fin && <> y terminaría {formatearFechaHora(data.fin)}</>}
                  {data.despuesDe && <>, a continuación de «{data.despuesDe}»</>}.
                </>
              ) : (
                'No entra en la agenda de los próximos meses.'
              )}
            </span>
          ) : data.cabe ? (
            <span className={isFetching ? 'text-green-800 opacity-60 dark:text-green-300' : 'text-green-800 dark:text-green-300'}>
              La hora está libre: empieza <strong>{data.inicio ? formatearFechaHora(data.inicio) : ''}</strong>
              {data.fin && <> y termina {formatearFechaHora(data.fin)}</>}, sin cruzarse con otras actividades.
            </span>
          ) : (
            <span className="text-destructive">{data.mensaje ?? 'Esa hora no está libre.'}</span>
          )}
        </>
      )}
      {data && data.faltanMinutos > 0 && limite && (
        <Faltante
          faltan={data.faltanMinutos}
          limite={limite}
          sugerencia={data.extra}
          valor={faltante as FaltanteForm | undefined}
          onCambio={(v) => setValue('programacion.faltante', v as never, { shouldDirty: true })}
        />
      )}
    </div>
  )
}

type FaltanteForm = { tipo: 'horas_extra'; fecha: string; horaInicio: string; horaFin: string; acumula?: boolean } | { tipo: 'bono'; monto: number | string }

/** Lo que no cabe en el horario normal antes de la entrega: horas extra (que se pueden acumular en la bolsa) o bono, a elección; no se guarda hasta registrar. */
function Faltante({ faltan, limite, sugerencia, valor, onCambio }: { faltan: number; limite: string; sugerencia: VistaPreviaInicio['extra']; valor: FaltanteForm | undefined; onCambio: (v: FaltanteForm | undefined) => void }) {
  const tipo = valor?.tipo ?? 'ninguno'
  const cambiarTipo = (t: string) => {
    if (t === 'ninguno') onCambio(undefined)
    else if (t === 'bono') onCambio({ tipo: 'bono', monto: '' })
    else onCambio({ tipo: 'horas_extra', fecha: sugerencia?.fecha ?? limite, horaInicio: sugerencia?.horaInicio ?? '19:00', horaFin: sugerencia?.horaFin ?? '20:00', acumula: false })
  }
  return (
    <div className="flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-50">
      <p className="flex items-start gap-2 font-medium">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        Faltan {duracion(faltan)} para llegar a la entrega del {formatearFecha(limite)}: no caben en el horario normal del auxiliar.
      </p>
      <p className="text-xs">Esas horas no pasan solas al día siguiente. Elige cómo cubrirlas (la propuesta se guarda al registrar el cliente y el auxiliar la acepta):</p>
      <RadioGroup value={tipo} onValueChange={cambiarTipo} className="gap-2">
        <label className="flex items-center gap-2">
          <RadioGroupItem value="horas_extra" /> Horas extra
        </label>
        <label className="flex items-center gap-2">
          <RadioGroupItem value="bono" /> Bono (el monto lo pones a mano)
        </label>
        <label className="flex items-center gap-2">
          <RadioGroupItem value="ninguno" /> Dejarlo así: lo que falta pasa al día siguiente
        </label>
      </RadioGroup>
      {valor?.tipo === 'horas_extra' && (
        <div className="flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs">
              Día
              <Input type="date" value={valor.fecha} onChange={(e) => onCambio({ ...valor, fecha: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Desde
              <Input type="time" value={valor.horaInicio} onChange={(e) => onCambio({ ...valor, horaInicio: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Hasta
              <Input type="time" value={valor.horaFin} onChange={(e) => onCambio({ ...valor, horaFin: e.target.value })} />
            </label>
          </div>
          {sugerencia && (
            <p className="text-xs">
              Sugerido: {formatearFecha(sugerencia.fecha)}, {sugerencia.horaInicio}–{sugerencia.horaFin} ({duracion(sugerencia.minutos)}){sugerencia.cubreTodo ? '' : ': no alcanza a cubrir todo, habría que repetirlo otro día'}.
              {sugerencia.avisos.length > 0 && <span className="block text-destructive">{sugerencia.avisos.join(' · ')}</span>}
            </p>
          )}
          <label className="flex items-start gap-2 text-xs">
            <Checkbox checked={Boolean(valor.acumula)} onCheckedChange={(v) => onCambio({ ...valor, acumula: v === true })} className="mt-0.5" />
            <span>
              Acumular estas horas en la bolsa del auxiliar
              <span className="block text-muted-foreground">Se van sumando y después se canjean por días libres o por dinero, cuando se decida.</span>
            </span>
          </label>
        </div>
      )}
      {valor?.tipo === 'bono' && (
        <label className="flex max-w-48 flex-col gap-1 text-xs">
          Monto del bono (S/)
          <Input type="number" inputMode="decimal" min={1} step="0.01" value={valor.monto} onChange={(e) => onCambio({ tipo: 'bono', monto: e.target.value })} />
        </label>
      )}
    </div>
  )
}
