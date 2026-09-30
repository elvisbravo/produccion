import { zodResolver } from '@hookform/resolvers/zod'
import {
  formatearCelular,
  MAX_CONTACTOS,
  crearProspectoSchema,
  diaEnLima,
  TEMPERATURAS,
  NOMBRE_TEMPERATURA,
  type CatalogosProspecto,
  type CrearProspectoDatos,
  type CrearProspectoFormulario,
  type ProspectoDetalle,
  type ProspectoFormulario,
} from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Loader2, Plus } from 'lucide-react'
import { useState } from 'react'
import { Controller, FormProvider, useFieldArray, useForm, useWatch, type FieldPath } from 'react-hook-form'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Requerido } from '@/components/requerido'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SelectorRemoto } from '@/components/selector-remoto'
import { ApiError } from '@/lib/api'
import { nombreCompleto } from '@/lib/formato'
import { usePermiso } from '@/lib/permisos'
import { useSesion } from '@/stores/sesion'
import { buscarCatalogo, buscarPersonas, crearEnCatalogo, useGuardarProspecto } from '../api'
import { actividadesQuery } from '@/features/tareas/api'
import { CamposProgramacion } from '@/features/tareas/components/campos-programacion'
import { ContactoFila } from './contacto-fila'

const contactoVacio = (esPrincipal: boolean) => ({
  celular: '',
  nombres: '',
  apellidos: '',
  email: '',
  tipoDocumento: '' as const,
  numeroDocumento: '',
  esPrincipal,
})

/** Convierte el detalle de la API en los valores del formulario (para editar). */
export function valoresDesdeDetalle(p: ProspectoDetalle): ProspectoFormulario {
  return {
    contactos: p.contactos.map((c) => ({
      celular: formatearCelular(c.celular),
      nombres: c.nombres ?? '',
      apellidos: c.apellidos ?? '',
      email: c.email ?? '',
      tipoDocumento: c.tipoDocumento ?? '',
      numeroDocumento: c.numeroDocumento ?? '',
      esPrincipal: c.esPrincipal,
    })),
    tipoTrabajoId: p.tipoTrabajo.id,
    prioridadId: p.prioridad.id,
    origenId: p.origen.id,
    nivelAcademicoId: p.nivelAcademico?.id ?? '',
    universidadId: p.universidad?.id ?? '',
    carreraId: p.carrera?.id ?? '',
    referidoPorId: p.referidoPor?.id ?? '',
    titulo: p.titulo ?? '',
    fechaEntregaTentativa: p.fechaEntregaTentativa ?? '',
    linkDrive: p.linkDrive ?? '',
    observaciones: p.observaciones ?? '',
    detalles: p.detalles ?? '',
    temperatura: p.temperatura ?? '',
  }
}

interface Props {
  catalogos: CatalogosProspecto
  /** Si se pasa, el formulario edita ese prospecto. */
  prospecto?: ProspectoDetalle
  onGuardado: (prospecto: ProspectoDetalle) => void
  onCancelar: () => void
}

export function FormularioProspecto({ catalogos, prospecto, onGuardado, onCancelar }: Props) {
  const usuario = useSesion((s) => s.usuario)!
  const guardar = useGuardarProspecto(prospecto?.id)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [etiquetas, setEtiquetas] = useState({
    universidad: prospecto?.universidad?.nombre,
    carrera: prospecto?.carrera?.nombre,
    referidoPor: prospecto?.referidoPor ? (nombreCompleto(prospecto.referidoPor) ?? formatearCelular(prospecto.referidoPor.celular)) : undefined,
  })

  const puedeProgramar = usePermiso('tareas.crear')
  const { data: actividades = [] } = useQuery({ ...actividadesQuery('prospecto'), enabled: !prospecto && puedeProgramar })
  const [agendar, setAgendar] = useState(false)

  // En la edición no se usa "primeraActividad": el esquema de alta la acepta como opcional.
  const form = useForm<CrearProspectoFormulario, unknown, CrearProspectoDatos>({
    resolver: zodResolver(crearProspectoSchema),
    defaultValues: prospecto
      ? valoresDesdeDetalle(prospecto)
      : {
          contactos: [contactoVacio(true)],
          tipoTrabajoId: '',
          prioridadId: catalogos.prioridades.find((p) => p.porDefecto)?.id ?? '',
          origenId: '',
          temperatura: '',
        },
  })
  const { control, register, formState, setValue, getValues, setError, handleSubmit, unregister } = form

  const cambiarAgendar = (valor: boolean) => {
    setAgendar(valor)
    if (valor) setValue('primeraActividad', { actividadId: '', fecha: diaEnLima(), hora: '', modalidad: '', notas: '' })
    else unregister('primeraActividad')
  }
  const contactos = useFieldArray({ control, name: 'contactos' })
  const tipoTrabajoId = useWatch({ control, name: 'tipoTrabajoId' })
  const origenId = useWatch({ control, name: 'origenId' })

  const tipo = catalogos.tiposTrabajo.find((t) => t.id === tipoTrabajoId)
  const maxContactos = Math.min(tipo?.maxIntegrantes ?? MAX_CONTACTOS, MAX_CONTACTOS)
  const esReferido = catalogos.origenes.find((o) => o.id === origenId)?.esReferido ?? false
  const e = formState.errors

  const marcarPrincipal = (indice: number) => {
    getValues('contactos').forEach((_, i) => setValue(`contactos.${i}.esPrincipal`, i === indice, { shouldDirty: true }))
  }

  const quitarContacto = (indice: number) => {
    const eraPrincipal = getValues(`contactos.${indice}.esPrincipal`)
    contactos.remove(indice)
    if (eraPrincipal) setValue('contactos.0.esPrincipal', true)
  }

  const enviar = handleSubmit(async (datos) => {
    setErrorGeneral(null)
    // "Referido por" solo aplica si el origen es Referido.
    const limpio = esReferido ? datos : { ...datos, referidoPorId: undefined }
    try {
      const guardado = await guardar.mutateAsync(limpio)
      toast.success(prospecto ? 'Cambios guardados' : `Prospecto ${guardado.codigo} registrado`)
      onGuardado(guardado)
    } catch (error) {
      if (error instanceof ApiError && error.errores.length > 0) {
        error.errores.forEach((err) => setError(err.campo as FieldPath<CrearProspectoFormulario>, { message: err.mensaje }))
        setErrorGeneral('Revisa los campos marcados.')
      } else {
        setErrorGeneral(error instanceof ApiError ? error.message : 'No se pudo guardar el prospecto')
      }
    }
  })

  return (
    <FormProvider {...form}>
      <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
        {errorGeneral && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{errorGeneral}</AlertDescription>
          </Alert>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <CardTitle>Contactos</CardTitle>
                  <CardDescription>
                    Quienes realizan el trabajo. Solo el celular es obligatorio
                    {tipo ? ` · ${tipo.nombre}: hasta ${tipo.maxIntegrantes} ${tipo.maxIntegrantes === 1 ? 'integrante' : 'integrantes'}` : ''}.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={contactos.fields.length >= maxContactos}
                  onClick={() => contactos.append(contactoVacio(false))}
                >
                  <Plus />
                  Agregar contacto
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {contactos.fields.map((f, i) => (
                  <ContactoFila
                    key={f.id}
                    indice={i}
                    prospectoId={prospecto?.id}
                    personasDelProspecto={prospecto?.contactos.map((c) => c.id)}
                    puedeQuitar={contactos.fields.length > 1}
                    onQuitar={() => quitarContacto(i)}
                    onMarcarPrincipal={() => marcarPrincipal(i)}
                  />
                ))}
                {e.contactos?.root?.message || e.contactos?.message ? (
                  <p className="text-sm text-destructive">{e.contactos.root?.message ?? e.contactos.message}</p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Datos del trabajo</CardTitle>
                <CardDescription>Pasarán al trabajo cuando el prospecto firme el contrato.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <Field data-invalid={Boolean(e.tipoTrabajoId)}>
                  <FieldLabel htmlFor="tipo">
                    <span>
                      Tipo de trabajo <Requerido />
                    </span>
                  </FieldLabel>
                  <Controller
                    control={control}
                    name="tipoTrabajoId"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="tipo" className="w-full" aria-invalid={Boolean(e.tipoTrabajoId)}>
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
                  <FieldLabel htmlFor="prioridad">
                    <span>
                      Prioridad <Requerido />
                    </span>
                  </FieldLabel>
                  <Controller
                    control={control}
                    name="prioridadId"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="prioridad" className="w-full" aria-invalid={Boolean(e.prioridadId)}>
                          <SelectValue placeholder="Seleccionar…" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalogos.prioridades.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              <span className="size-2 rounded-sm" style={{ backgroundColor: p.color }} aria-hidden="true" />
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
                  <FieldLabel htmlFor="nivel">Nivel académico</FieldLabel>
                  <Controller
                    control={control}
                    name="nivelAcademicoId"
                    render={({ field }) => (
                      <Select value={field.value || 'ninguno'} onValueChange={(v) => field.onChange(v === 'ninguno' ? '' : v)}>
                        <SelectTrigger id="nivel" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ninguno">Sin especificar</SelectItem>
                          {catalogos.nivelesAcademicos.map((n) => (
                            <SelectItem key={n.id} value={n.id}>
                              {n.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>

                <Field data-invalid={Boolean(e.titulo)} className="sm:col-span-3">
                  <FieldLabel htmlFor="titulo">Título del trabajo</FieldLabel>
                  <Input id="titulo" placeholder="Opcional: muchas veces aún no está definido" {...register('titulo')} />
                  <FieldError errors={[e.titulo]} />
                </Field>

                <Field data-invalid={Boolean(e.universidadId)} className="sm:col-span-2">
                  <FieldLabel htmlFor="universidad">Universidad</FieldLabel>
                  <Controller
                    control={control}
                    name="universidadId"
                    render={({ field }) => (
                      <SelectorRemoto
                        id="universidad"
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
                </Field>

                <Field data-invalid={Boolean(e.carreraId)}>
                  <FieldLabel htmlFor="carrera">Carrera</FieldLabel>
                  <Controller
                    control={control}
                    name="carreraId"
                    render={({ field }) => (
                      <SelectorRemoto
                        id="carrera"
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
                </Field>

                <Field data-invalid={Boolean(e.fechaEntregaTentativa)}>
                  <FieldLabel htmlFor="fecha">Fecha de entrega tentativa</FieldLabel>
                  <Input id="fecha" type="date" aria-invalid={Boolean(e.fechaEntregaTentativa)} {...register('fechaEntregaTentativa')} />
                  <FieldError errors={[e.fechaEntregaTentativa]} />
                </Field>

                <Field data-invalid={Boolean(e.origenId)}>
                  <FieldLabel htmlFor="origen">
                    <span>
                      Origen del contacto <Requerido />
                    </span>
                  </FieldLabel>
                  <Controller
                    control={control}
                    name="origenId"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="origen" className="w-full" aria-invalid={Boolean(e.origenId)}>
                          <SelectValue placeholder="Seleccionar…" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalogos.origenes.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[e.origenId]} />
                </Field>

                <Field data-invalid={Boolean(e.referidoPorId)}>
                  <FieldLabel htmlFor="referido">Referido por</FieldLabel>
                  <Controller
                    control={control}
                    name="referidoPorId"
                    render={({ field }) => (
                      <SelectorRemoto
                        id="referido"
                        clave="personas"
                        minimo={2}
                        valor={esReferido ? field.value : undefined}
                        etiqueta={etiquetas.referidoPor}
                        onCambio={(o) => {
                          field.onChange(o?.id ?? '')
                          setEtiquetas((x) => ({ ...x, referidoPor: o?.nombre }))
                        }}
                        buscar={async (q, signal) =>
                          (await buscarPersonas(q, signal)).map((p) => ({
                            id: p.id,
                            nombre: nombreCompleto(p) ?? formatearCelular(p.celular),
                            detalle: formatearCelular(p.celular),
                          }))
                        }
                        placeholder={esReferido ? 'Buscar por nombre o celular…' : 'Solo si el origen es Referido'}
                        invalido={Boolean(e.referidoPorId)}
                      />
                    )}
                  />
                  <FieldError errors={[e.referidoPorId]} />
                </Field>

                <Field data-invalid={Boolean(e.linkDrive)}>
                  <FieldLabel htmlFor="drive">Link del Drive</FieldLabel>
                  <Input id="drive" type="url" placeholder="https://drive.google.com/…" aria-invalid={Boolean(e.linkDrive)} {...register('linkDrive')} />
                  <FieldError errors={[e.linkDrive]} />
                </Field>

                <Field data-invalid={Boolean(e.observaciones)} className="sm:col-span-3">
                  <FieldLabel htmlFor="observaciones">Observaciones</FieldLabel>
                  <Input id="observaciones" placeholder="Notas breves internas" {...register('observaciones')} />
                  <FieldError errors={[e.observaciones]} />
                </Field>

                <Field data-invalid={Boolean(e.detalles)} className="sm:col-span-3">
                  <FieldLabel htmlFor="detalles">Detalles</FieldLabel>
                  <Textarea
                    id="detalles"
                    rows={4}
                    placeholder="Qué necesita, en qué avance está, enfoque, requisitos de la universidad…"
                    {...register('detalles')}
                  />
                  <FieldError errors={[e.detalles]} />
                </Field>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-6 lg:sticky lg:top-20">
            <Card>
              <CardHeader>
                <CardTitle>Seguimiento</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Field>
                  <FieldLabel>Responsable</FieldLabel>
                  <p className="text-sm">
                    {prospecto
                      ? `${prospecto.responsable.nombres} ${prospecto.responsable.apellidos}`
                      : `${usuario.nombres} ${usuario.apellidos} (tú)`}
                  </p>
                </Field>
                <Field>
                  <FieldLabel id="temperatura-label">Temperatura</FieldLabel>
                  <Controller
                    control={control}
                    name="temperatura"
                    render={({ field }) => (
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        className="w-full"
                        aria-labelledby="temperatura-label"
                        value={field.value ?? ''}
                        onValueChange={(v) => field.onChange(v)}
                      >
                        {TEMPERATURAS.map((t) => (
                          <ToggleGroupItem key={t} value={t} className="flex-1">
                            {NOMBRE_TEMPERATURA[t]}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    )}
                  />
                  <FieldDescription>Qué tan probable es que contrate.</FieldDescription>
                </Field>
                {!prospecto && (
                  <Field>
                    <FieldLabel>Etapa inicial</FieldLabel>
                    <p className="text-sm">{catalogos.etapas.find((et) => et.inicial)?.nombre}</p>
                  </Field>
                )}
              </CardContent>
            </Card>

            {!prospecto && puedeProgramar && (
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <CardTitle>Primera actividad</CardTitle>
                    <CardDescription>Opcional: por ejemplo, el enfoque.</CardDescription>
                  </div>
                  <Label htmlFor="agendar-ahora" className="flex items-center gap-2 font-normal">
                    <Checkbox id="agendar-ahora" checked={agendar} onCheckedChange={(v) => cambiarAgendar(v === true)} />
                    Agendar ahora
                  </Label>
                </CardHeader>
                {agendar && (
                  <CardContent>
                    <CamposProgramacion prefijo="primeraActividad." actividades={actividades} />
                  </CardContent>
                )}
              </Card>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onCancelar}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={formState.isSubmitting}>
                {formState.isSubmitting && <Loader2 className="animate-spin" />}
                {prospecto ? 'Guardar cambios' : 'Guardar prospecto'}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </FormProvider>
  )
}
