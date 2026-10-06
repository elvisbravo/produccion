import {
  clienteDirectoSchema,
  diaEnLima,
  METODOS_PAGO,
  NOMBRE_METODO_PAGO,
  NOMBRE_TIPO_DOCUMENTO,
  TIPOS_DOCUMENTO,
  type ClienteDirectoDatos,
  type ClienteDirectoFormulario,
  type TipoDocumento,
} from '@grupoes/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { AlertCircle, ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, FormProvider, useFieldArray, useForm, useFormContext, useWatch, type FieldValues, type UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { Requerido } from '@/components/requerido'
import { SelectorRemoto } from '@/components/selector-remoto'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { BotonBuscarDni } from '@/features/consultas/components/boton-buscar-dni'
import { buscarCatalogo, catalogosProspectoQuery, crearEnCatalogo } from '@/features/prospectos/api'
import { responsablesClienteDirectoQuery, useRegistrarClienteDirecto } from '@/features/trabajos/api'
import { CamposCobro, cobroVacio } from '@/features/trabajos/components/cobro'
import { aplicarErroresApi } from '@/lib/formularios'
import { exigirPermiso } from '@/lib/guardas'

export const Route = createFileRoute('/_app/trabajos/cliente-directo')({
  beforeLoad: () => exigirPermiso('trabajos.registrar_cliente_directo'),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(catalogosProspectoQuery), context.queryClient.ensureQueryData(responsablesClienteDirectoQuery)]),
  component: RegistrarClienteDirecto,
})

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
      trabajo: { titulo: '', fechaInicio: hoy, fechaLimite: '', nivelAcademicoId: '', universidadId: '', carreraId: '', linkDrive: '' },
      contrato: { fechaFirma: hoy, ...cobroVacio(), observaciones: '' },
      observaciones: '',
      pagos: [],
    },
  })
  const { control, register, setValue, getValues, formState } = form
  const e = formState.errors
  const integrantes = useFieldArray({ control, name: 'integrantes' })
  const pagos = useFieldArray({ control, name: 'pagos' })
  const tipo = catalogos.tiposTrabajo.find((t) => t.id === useWatch({ control, name: 'tipoTrabajoId' }))
  const maxIntegrantes = Math.min(tipo?.maxIntegrantes ?? 5, 5)
  const titular = useWatch({ control, name: 'integrantes' })?.findIndex((i) => i.esTitular) ?? -1
  const marcarTitular = (indice: number) => getValues('integrantes').forEach((_, i) => setValue(`integrantes.${i}.esTitular`, i === indice, { shouldDirty: true }))

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      const trabajo = await registrar.mutateAsync(datos)
      toast.success(`Cliente registrado: trabajo ${trabajo.codigo}`)
      void navigate({ to: '/trabajos/$id', params: { id: trabajo.id } })
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['integrantes', 'tipoTrabajoId', 'prioridadId', 'responsableId', 'trabajo', 'contrato', 'pagos', 'observaciones']))
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
                        {integrantes.fields.length > 1 && (
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
                    Responsable del cliente <Requerido />
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
            <CardHeader>
              <CardTitle>Contrato</CardTitle>
              <CardDescription>Con la fecha en que se firmó, aunque sea anterior a hoy.</CardDescription>
            </CardHeader>
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
          </Card>

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
