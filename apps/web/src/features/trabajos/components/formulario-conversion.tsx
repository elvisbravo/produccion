import { zodResolver } from '@hookform/resolvers/zod'
import {
  aCentimos,
  convertirProspectoSchema,
  deCentimos,
  diaEnLima,
  formatearCelular,
  formatearSoles,
  METODOS_PAGO,
  NOMBRE_METODO_PAGO,
  NOMBRE_TIPO_DOCUMENTO,
  sumarDias,
  TIPOS_DOCUMENTO,
  type TipoDocumento,
  type ConvertirProspectoDatos,
  type ConvertirProspectoFormulario,
  type ProspectoDetalle,
  type TrabajoDetalle,
} from '@grupoes/shared'
import { AlertCircle, CircleCheck, CircleX, Loader2, Plus, Trash2, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, FormProvider, get, useFieldArray, useForm, useFormContext, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { Requerido } from '@/components/requerido'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SelectorRemoto } from '@/components/selector-remoto'
import { BotonBuscarDni } from '@/features/consultas/components/boton-buscar-dni'
import { buscarCatalogo, crearEnCatalogo } from '@/features/prospectos/api'
import { nombreCompleto, sumarMeses } from '@/lib/formato'
import { aplicarErroresApi } from '@/lib/formularios'
import { usePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { useConvertir } from '../api'

type Contacto = ProspectoDetalle['contactos'][number]

const integranteDesde = (c: Contacto, esTitular: boolean) => ({
  personaId: c.id,
  nombres: c.nombres ?? '',
  apellidos: c.apellidos ?? '',
  email: c.email ?? '',
  tipoDocumento: c.tipoDocumento ?? 'DNI',
  numeroDocumento: c.numeroDocumento ?? '',
  esTitular,
})

/** Monto numérico de un campo del formulario (los inputs guardan texto). */
const numero = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

interface Props {
  prospecto: ProspectoDetalle
  /** Niveles académicos del catálogo. */
  niveles: { id: string; nombre: string }[]
  maxIntegrantes: number
  onConvertido: (trabajo: TrabajoDetalle) => void
  onCancelar: () => void
}

export function FormularioConversion({ prospecto, niveles, maxIntegrantes, onConvertido, onCancelar }: Props) {
  const convertir = useConvertir(prospecto.id)
  const puedePagar = usePermiso('contratos.registrar_pago')
  const [error, setError] = useState<string | null>(null)
  const hoy = diaEnLima()
  const ordenados = [...prospecto.contactos].sort((a, b) => Number(b.esPrincipal) - Number(a.esPrincipal))

  const form = useForm<ConvertirProspectoFormulario, unknown, ConvertirProspectoDatos>({
    resolver: zodResolver(convertirProspectoSchema),
    defaultValues: {
      integrantes: ordenados.slice(0, maxIntegrantes).map((c, i) => integranteDesde(c, i === 0)),
      trabajo: {
        titulo: prospecto.titulo ?? '',
        fechaInicio: hoy,
        fechaLimite: prospecto.fechaEntregaTentativa ?? '',
        nivelAcademicoId: prospecto.nivelAcademico?.id ?? '',
        universidadId: prospecto.universidad?.id ?? '',
        carreraId: prospecto.carrera?.id ?? '',
        linkDrive: prospecto.linkDrive ?? '',
      },
      contrato: { fechaFirma: hoy, montoTotal: '' as unknown as number, formaPago: 'cuotas', cuotas: [], observaciones: '' },
    },
  })
  const { control, setValue, getValues, formState, handleSubmit, unregister, setError: marcarError } = form
  const integrantes = useFieldArray({ control, name: 'integrantes' })
  const cuotas = useFieldArray({ control, name: 'contrato.cuotas' })
  const [conPago, setConPago] = useState(false)
  const [etiquetas, setEtiquetas] = useState({ universidad: prospecto.universidad?.nombre, carrera: prospecto.carrera?.nombre })
  const e = formState.errors

  const formaPago = useWatch({ control, name: 'contrato.formaPago' })
  const montoTotal = numero(useWatch({ control, name: 'contrato.montoTotal' }))
  const fechaFirma = useWatch({ control, name: 'contrato.fechaFirma' })
  const valoresCuotas = useWatch({ control, name: 'contrato.cuotas' }) ?? []
  const pagoInicial = numero(useWatch({ control, name: 'pagoInicial.monto' }))

  // Al contado: una sola cuota por el total, que vence al firmar.
  useEffect(() => {
    if (formaPago === 'contado') cuotas.replace([{ monto: montoTotal || ('' as unknown as number), vencimiento: fechaFirma || hoy }])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cuotas.replace es estable
  }, [formaPago, montoTotal, fechaFirma])

  const seleccionados = integrantes.fields.map((f) => f.personaId)
  const alternarIntegrante = (c: Contacto, incluir: boolean) => {
    if (incluir) {
      integrantes.append(integranteDesde(c, integrantes.fields.length === 0))
    } else {
      const indice = integrantes.fields.findIndex((f) => f.personaId === c.id)
      const eraTitular = getValues(`integrantes.${indice}.esTitular`)
      integrantes.remove(indice)
      if (eraTitular && getValues('integrantes').length > 0) setValue('integrantes.0.esTitular', true)
    }
  }
  const titular = useWatch({ control, name: 'integrantes' })?.findIndex((i) => i.esTitular) ?? -1
  const marcarTitular = (indice: number) =>
    getValues('integrantes').forEach((_, i) => setValue(`integrantes.${i}.esTitular`, i === indice, { shouldDirty: true }))

  const alternarPago = (v: boolean) => {
    setConPago(v)
    if (v) setValue('pagoInicial', { monto: '' as unknown as number, fecha: hoy, metodo: 'yape', numeroOperacion: '', observaciones: '' })
    else unregister('pagoInicial')
  }

  const sumaCuotas = valoresCuotas.reduce((s, c) => s + aCentimos(numero(c?.monto)), 0)
  const cuadra = montoTotal > 0 && sumaCuotas === aCentimos(montoTotal)

  const enviar = handleSubmit(async (datos) => {
    setError(null)
    try {
      const trabajo = await convertir.mutateAsync(datos)
      toast.success(`Trabajo ${trabajo.codigo} creado`)
      onConvertido(trabajo)
    } catch (err) {
      setError(aplicarErroresApi(err, marcarError, ['integrantes', 'trabajo', 'contrato', 'pagoInicial']))
    }
  })

  return (
    <FormProvider {...form}>
      <form onSubmit={enviar} noValidate className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
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
                Cada integrante necesita documento, nombres y apellidos; y al menos uno de ellos, un correo. Máximo {maxIntegrantes}.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {ordenados.length > 1 && (
                <div className="flex flex-wrap gap-4">
                  {ordenados.map((c) => {
                    const incluido = seleccionados.includes(c.id)
                    const lleno = !incluido && seleccionados.length >= maxIntegrantes
                    return (
                      <Label key={c.id} className="flex items-center gap-2 font-normal">
                        <Checkbox checked={incluido} disabled={lleno} onCheckedChange={(v) => alternarIntegrante(c, v === true)} />
                        {nombreCompleto(c) ?? formatearCelular(c.celular)}
                      </Label>
                    )
                  })}
                </div>
              )}
              <RadioGroup value={String(titular)} onValueChange={(v) => marcarTitular(Number(v))} className="flex flex-col gap-4">
                {integrantes.fields.map((f, i) => (
                  <FilaIntegrante key={f.id} indice={i} celular={prospecto.contactos.find((c) => c.id === f.personaId)?.celular ?? ''} />
                ))}
              </RadioGroup>
              {(e.integrantes?.root?.message ?? e.integrantes?.message) && (
                <p className="text-sm text-destructive">{e.integrantes?.root?.message ?? e.integrantes?.message}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trabajo</CardTitle>
              <CardDescription>Se completan con los datos del prospecto; todos son obligatorios para convertirlo y quedan guardados también en el prospecto.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2" data-invalid={Boolean(e.trabajo?.titulo)}>
                <FieldLabel htmlFor="t-titulo">Título</FieldLabel>
                <Input id="t-titulo" {...form.register('trabajo.titulo')} />
                <FieldError errors={[e.trabajo?.titulo]} />
              </Field>
              <Field data-invalid={Boolean(e.trabajo?.fechaInicio)}>
                <FieldLabel htmlFor="t-inicio">
                  <span>
                    Fecha de inicio <Requerido />
                  </span>
                </FieldLabel>
                <Input id="t-inicio" type="date" {...form.register('trabajo.fechaInicio')} />
                <FieldError errors={[e.trabajo?.fechaInicio]} />
              </Field>
              <Field data-invalid={Boolean(e.trabajo?.fechaLimite)}>
                <FieldLabel htmlFor="t-limite">
                  <span>
                    Fecha límite de entrega <Requerido />
                  </span>
                </FieldLabel>
                <Input id="t-limite" type="date" aria-invalid={Boolean(e.trabajo?.fechaLimite)} {...form.register('trabajo.fechaLimite')} />
                <FieldError errors={[e.trabajo?.fechaLimite]} />
              </Field>
              <Field data-invalid={Boolean(e.trabajo?.nivelAcademicoId)}>
                <FieldLabel htmlFor="t-nivel">
                  <span>
                    Nivel académico <Requerido />
                  </span>
                </FieldLabel>
                <Controller
                  control={control}
                  name="trabajo.nivelAcademicoId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="t-nivel" className="w-full" aria-invalid={Boolean(e.trabajo?.nivelAcademicoId)}>
                        <SelectValue placeholder="Seleccionar…" />
                      </SelectTrigger>
                      <SelectContent>
                        {niveles.map((n) => (
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
                <FieldLabel htmlFor="t-universidad">
                  <span>
                    Universidad <Requerido />
                  </span>
                </FieldLabel>
                <Controller
                  control={control}
                  name="trabajo.universidadId"
                  render={({ field }) => (
                    <SelectorRemoto
                      id="t-universidad"
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
                <FieldLabel htmlFor="t-carrera">
                  <span>
                    Carrera <Requerido />
                  </span>
                </FieldLabel>
                <Controller
                  control={control}
                  name="trabajo.carreraId"
                  render={({ field }) => (
                    <SelectorRemoto
                      id="t-carrera"
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
              <Field data-invalid={Boolean(e.trabajo?.linkDrive)}>
                <FieldLabel htmlFor="t-drive">
                  <span>
                    Enlace de Drive <Requerido />
                  </span>
                </FieldLabel>
                <Input id="t-drive" type="url" placeholder="https://drive.google.com/…" aria-invalid={Boolean(e.trabajo?.linkDrive)} {...form.register('trabajo.linkDrive')} />
                <FieldError errors={[e.trabajo?.linkDrive]} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contrato</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field data-invalid={Boolean(e.contrato?.fechaFirma)}>
                  <FieldLabel htmlFor="c-firma">
                    <span>
                      Fecha de firma <Requerido />
                    </span>
                  </FieldLabel>
                  <Input id="c-firma" type="date" {...form.register('contrato.fechaFirma')} />
                  <FieldError errors={[e.contrato?.fechaFirma]} />
                </Field>
                <Field data-invalid={Boolean(e.contrato?.montoTotal)}>
                  <FieldLabel htmlFor="c-total">
                    <span>
                      Monto total (S/) <Requerido />
                    </span>
                  </FieldLabel>
                  <Input id="c-total" type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00" aria-invalid={Boolean(e.contrato?.montoTotal)} {...form.register('contrato.montoTotal')} />
                  <FieldError errors={[e.contrato?.montoTotal]} />
                </Field>
                <Field>
                  <FieldLabel id="c-forma">Forma de pago</FieldLabel>
                  <Controller
                    control={control}
                    name="contrato.formaPago"
                    render={({ field }) => (
                      <ToggleGroup type="single" variant="outline" className="w-full" aria-labelledby="c-forma" value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                        <ToggleGroupItem value="contado" className="flex-1">
                          Al contado
                        </ToggleGroupItem>
                        <ToggleGroupItem value="cuotas" className="flex-1">
                          En cuotas
                        </ToggleGroupItem>
                      </ToggleGroup>
                    )}
                  />
                </Field>
              </div>

              {formaPago === 'cuotas' && (
                <>
                  <GeneradorCuotas montoTotal={montoTotal} fechaFirma={fechaFirma || hoy} onGenerar={(lista) => cuotas.replace(lista)} />
                  <div className="flex flex-col gap-2">
                    {cuotas.fields.length > 0 && (
                      <div className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2 px-1 text-xs font-medium text-muted-foreground">
                        <span>N.º</span>
                        <span>Monto (S/)</span>
                        <span>Vencimiento</span>
                      </div>
                    )}
                    {cuotas.fields.map((f, i) => {
                      const errores = e.contrato?.cuotas?.[i]
                      return (
                        <div key={f.id} className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_2rem] items-start gap-2">
                          <span className="pt-1.5 text-center text-sm text-muted-foreground">{i + 1}</span>
                          <div>
                            <Input type="number" inputMode="decimal" step="0.01" aria-label={`Monto de la cuota ${i + 1}`} aria-invalid={Boolean(errores?.monto)} {...form.register(`contrato.cuotas.${i}.monto`)} />
                            <FieldError errors={[errores?.monto]} />
                          </div>
                          <div>
                            <Input type="date" aria-label={`Vencimiento de la cuota ${i + 1}`} aria-invalid={Boolean(errores?.vencimiento)} {...form.register(`contrato.cuotas.${i}.vencimiento`)} />
                            <FieldError errors={[errores?.vencimiento]} />
                          </div>
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Quitar la cuota ${i + 1}`} onClick={() => cuotas.remove(i)}>
                            <Trash2 />
                          </Button>
                        </div>
                      )
                    })}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      onClick={() => {
                        const ultima = valoresCuotas.at(-1)?.vencimiento
                        cuotas.append({ monto: '' as unknown as number, vencimiento: ultima ? sumarMeses(ultima, 1) : fechaFirma || hoy })
                      }}
                    >
                      <Plus />
                      Agregar cuota
                    </Button>
                  </div>
                </>
              )}
              <SumaCuotas suma={sumaCuotas} total={montoTotal} cuadra={cuadra} error={e.contrato?.cuotas?.root?.message ?? e.contrato?.cuotas?.message} />

              <Field data-invalid={Boolean(e.contrato?.observaciones)}>
                <FieldLabel htmlFor="c-obs">Observaciones del contrato</FieldLabel>
                <Textarea id="c-obs" rows={2} {...form.register('contrato.observaciones')} />
              </Field>
            </CardContent>
          </Card>

          {puedePagar && (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <CardTitle>Pago inicial</CardTitle>
                  <CardDescription>Si el cliente pagó algo al firmar. Se genera su recibo.</CardDescription>
                </div>
                <Label htmlFor="con-pago" className="flex items-center gap-2 font-normal">
                  <Checkbox id="con-pago" checked={conPago} onCheckedChange={(v) => alternarPago(v === true)} />
                  Registrar pago
                </Label>
              </CardHeader>
              {conPago && (
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <CamposPago prefijo="pagoInicial." />
                </CardContent>
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-20">
          <Card>
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
                <dt className="text-muted-foreground">Prospecto</dt>
                <dd className="font-mono">{prospecto.codigo}</dd>
                <dt className="text-muted-foreground">Tipo de trabajo</dt>
                <dd>{prospecto.tipoTrabajo.nombre}</dd>
                <dt className="text-muted-foreground">Integrantes</dt>
                <dd>{integrantes.fields.length}</dd>
                <dt className="text-muted-foreground">Total del contrato</dt>
                <dd className="font-medium tabular-nums">{formatearSoles(montoTotal)}</dd>
                <dt className="text-muted-foreground">{formaPago === 'contado' ? 'Forma de pago' : 'Cuotas'}</dt>
                <dd>{formaPago === 'contado' ? 'Al contado' : cuotas.fields.length}</dd>
                {conPago && (
                  <>
                    <dt className="text-muted-foreground">Pago inicial</dt>
                    <dd className="tabular-nums">− {formatearSoles(pagoInicial)}</dd>
                  </>
                )}
                <dt className="border-t pt-2 font-medium">Saldo</dt>
                <dd className="border-t pt-2 font-semibold tabular-nums">{formatearSoles(Math.max(0, deCentimos(aCentimos(montoTotal) - aCentimos(conPago ? pagoInicial : 0))))}</dd>
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">
                Al confirmar, el prospecto pasa a "Convertido" y sus actividades comerciales pendientes se cancelan.
              </p>
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onCancelar}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={formState.isSubmitting}>
              {formState.isSubmitting && <Loader2 className="animate-spin" />}
              Convertir en cliente
            </Button>
          </div>
        </div>
      </form>
    </FormProvider>
  )
}

function FilaIntegrante({ indice, celular }: { indice: number; celular: string }) {
  const { register, control, setValue, formState } = useFormContext<ConvertirProspectoFormulario>()
  const errores = formState.errors.integrantes?.[indice]
  const id = (n: string) => `int-${indice}-${n}`
  const [tipoDoc, numeroDoc] = useWatch({ control, name: [`integrantes.${indice}.tipoDocumento`, `integrantes.${indice}.numeroDocumento`] })
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
      <legend className="sr-only">Integrante {indice + 1}</legend>
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor={id('titular')} className="flex items-center gap-2 font-normal">
          <RadioGroupItem value={String(indice)} id={id('titular')} />
          Titular (firma el contrato)
        </Label>
        <span className="ml-auto font-mono text-sm text-muted-foreground">{formatearCelular(celular)}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field data-invalid={Boolean(errores?.nombres)}>
          <FieldLabel htmlFor={id('nombres')}>
            <span>
              Nombres <Requerido />
            </span>
          </FieldLabel>
          <Input id={id('nombres')} aria-invalid={Boolean(errores?.nombres)} {...register(`integrantes.${indice}.nombres`)} />
          <FieldError errors={[errores?.nombres]} />
        </Field>
        <Field data-invalid={Boolean(errores?.apellidos)}>
          <FieldLabel htmlFor={id('apellidos')}>
            <span>
              Apellidos <Requerido />
            </span>
          </FieldLabel>
          <Input id={id('apellidos')} aria-invalid={Boolean(errores?.apellidos)} {...register(`integrantes.${indice}.apellidos`)} />
          <FieldError errors={[errores?.apellidos]} />
        </Field>
        <Field data-invalid={Boolean(errores?.email)}>
          <FieldLabel htmlFor={id('email')}>Correo</FieldLabel>
          <Input id={id('email')} type="email" aria-invalid={Boolean(errores?.email)} {...register(`integrantes.${indice}.email`)} />
          <FieldError errors={[errores?.email]} />
        </Field>
        <Field data-invalid={Boolean(errores?.tipoDocumento)}>
          <FieldLabel htmlFor={id('tipo-doc')}>
            <span>
              Tipo de documento <Requerido />
            </span>
          </FieldLabel>
          <Controller
            control={control}
            name={`integrantes.${indice}.tipoDocumento`}
            render={({ field }) => (
              <Select value={(field.value as string) || undefined} onValueChange={field.onChange}>
                <SelectTrigger id={id('tipo-doc')} className="w-full">
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
          <FieldError errors={[errores?.tipoDocumento]} />
        </Field>
        <Field data-invalid={Boolean(errores?.numeroDocumento)}>
          <FieldLabel htmlFor={id('num-doc')}>
            <span>
              N.º de documento <Requerido />
            </span>
          </FieldLabel>
          <Input id={id('num-doc')} className="font-mono uppercase" aria-invalid={Boolean(errores?.numeroDocumento)} {...register(`integrantes.${indice}.numeroDocumento`)} />
          <FieldError errors={[errores?.numeroDocumento]} />
        </Field>
        <BotonBuscarDni
          className="sm:col-span-1"
          tipo={tipoDoc as TipoDocumento | ''}
          numero={numeroDoc as string}
          onEncontrado={(datos) => {
            const opciones = { shouldDirty: true, shouldValidate: true }
            setValue(`integrantes.${indice}.nombres`, datos.nombres, opciones)
            setValue(`integrantes.${indice}.apellidos`, datos.apellidos, opciones)
          }}
        />
      </div>
    </fieldset>
  )
}

/** Reparte el total en N cuotas iguales (la última absorbe los céntimos) con vencimiento mensual o quincenal. */
function GeneradorCuotas({ montoTotal, fechaFirma, onGenerar }: { montoTotal: number; fechaFirma: string; onGenerar: (c: { monto: number; vencimiento: string }[]) => void }) {
  const [cantidad, setCantidad] = useState(2)
  const [primera, setPrimera] = useState(fechaFirma)
  const [frecuencia, setFrecuencia] = useState<'mensual' | 'quincenal'>('mensual')

  const generar = () => {
    const total = aCentimos(montoTotal)
    const base = Math.floor(total / cantidad)
    onGenerar(
      Array.from({ length: cantidad }, (_, i) => ({
        monto: deCentimos(i === cantidad - 1 ? total - base * (cantidad - 1) : base),
        vencimiento: frecuencia === 'mensual' ? sumarMeses(primera, i) : sumarDias(primera, i * 15),
      })),
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-muted/50 p-3">
      <Field className="w-24">
        <FieldLabel htmlFor="g-cantidad">Cuotas</FieldLabel>
        <Input id="g-cantidad" type="number" min={2} max={24} value={cantidad} onChange={(ev) => setCantidad(Math.min(24, Math.max(2, Number(ev.target.value) || 2)))} />
      </Field>
      <Field className="w-40">
        <FieldLabel htmlFor="g-primera">Primera vence</FieldLabel>
        <Input id="g-primera" type="date" value={primera} onChange={(ev) => setPrimera(ev.target.value)} />
      </Field>
      <Field className="w-36">
        <FieldLabel htmlFor="g-frecuencia">Cada</FieldLabel>
        <Select value={frecuencia} onValueChange={(v) => setFrecuencia(v as 'mensual' | 'quincenal')}>
          <SelectTrigger id="g-frecuencia" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mensual">Mes</SelectItem>
            <SelectItem value="quincenal">15 días</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Button type="button" variant="secondary" disabled={!(montoTotal > 0) || !primera} onClick={generar}>
        <Wand2 />
        Generar cuotas iguales
      </Button>
    </div>
  )
}

function SumaCuotas({ suma, total, cuadra, error }: { suma: number; total: number; cuadra: boolean; error?: string }) {
  if (!(total > 0)) return error ? <p className="text-sm text-destructive">{error}</p> : null
  return (
    <p className={cn('flex items-center gap-2 text-sm', cuadra ? 'text-green-700 dark:text-green-400' : 'text-destructive')}>
      {cuadra ? <CircleCheck className="size-4" /> : <CircleX className="size-4" />}
      {cuadra
        ? `Las cuotas suman el total (${formatearSoles(total)})`
        : `Las cuotas suman ${formatearSoles(deCentimos(suma))}; faltan ${formatearSoles(deCentimos(aCentimos(total) - suma))}`}
    </p>
  )
}

/** Campos de un pago (monto, fecha, método, operación). Se usa en la conversión y en "Registrar pago". */
export function CamposPago({ prefijo = '' }: { prefijo?: string }) {
  const { register, control, formState } = useFormContext()
  const n = (c: string) => `${prefijo}${c}`
  const err = (c: string) => get(formState.errors, n(c)) as { message?: string } | undefined
  const id = (c: string) => `${prefijo.replace(/\W/g, '-')}pago-${c}`
  return (
    <>
      <Field data-invalid={Boolean(err('monto'))}>
        <FieldLabel htmlFor={id('monto')}>
          <span>
            Monto (S/) <Requerido />
          </span>
        </FieldLabel>
        <Input id={id('monto')} type="number" inputMode="decimal" step="0.01" min={0} aria-invalid={Boolean(err('monto'))} {...register(n('monto'))} />
        <FieldError errors={[err('monto')]} />
      </Field>
      <Field data-invalid={Boolean(err('fecha'))}>
        <FieldLabel htmlFor={id('fecha')}>
          <span>
            Fecha <Requerido />
          </span>
        </FieldLabel>
        <Input id={id('fecha')} type="date" max={diaEnLima()} {...register(n('fecha'))} />
        <FieldError errors={[err('fecha')]} />
      </Field>
      <Field data-invalid={Boolean(err('metodo'))}>
        <FieldLabel htmlFor={id('metodo')}>
          <span>
            Método <Requerido />
          </span>
        </FieldLabel>
        <Controller
          control={control}
          name={n('metodo')}
          render={({ field }) => (
            <Select value={field.value ?? ''} onValueChange={field.onChange}>
              <SelectTrigger id={id('metodo')} className="w-full">
                <SelectValue placeholder="Seleccionar…" />
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
        <FieldError errors={[err('metodo')]} />
      </Field>
      <Field data-invalid={Boolean(err('numeroOperacion'))}>
        <FieldLabel htmlFor={id('operacion')}>N.º de operación</FieldLabel>
        <Input id={id('operacion')} placeholder="Opcional" {...register(n('numeroOperacion'))} />
        <FieldError errors={[err('numeroOperacion')]} />
      </Field>
    </>
  )
}
