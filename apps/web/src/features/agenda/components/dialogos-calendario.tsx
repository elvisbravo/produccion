import { zodResolver } from '@hookform/resolvers/zod'
import {
  ALCANCES_FERIADO,
  datosPersonalSchema,
  diaEnLima,
  feriadoSchema,
  horaAMinutos,
  horarioUsuarioSchema,
  NOMBRE_ALCANCE_FERIADO,
  plantillaHorarioSchema,
  resumirHorario,
  sumarDias,
  type FeriadoDatos,
  type FeriadoFormulario,
  type FeriadoItem,
  type HorarioUsuarioDatos,
  type HorarioUsuarioFormulario,
  type PersonalItem,
  type PlantillaHorarioDatos,
  type PlantillaHorarioFormulario,
  type PlantillaHorarioItem,
} from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, FormProvider, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Requerido } from '@/components/requerido'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatearFecha, nombreCompleto } from '@/lib/formato'
import { aplicarErroresApi } from '@/lib/formularios'
import { plantillasQuery, useAnularHorario, useEliminarFeriado, useGuardarDatosPersonal, useGuardarFeriado, useGuardarHorario, useGuardarPlantilla } from '../api'
import { aTramosFormulario, EditorTramos } from './editor-tramos'

interface PropsDialogo {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

function AvisoError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  )
}

export function DialogoPlantilla({ plantilla, abierto, onAbiertoChange }: PropsDialogo & { plantilla: PlantillaHorarioItem | null }) {
  const guardar = useGuardarPlantilla()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<PlantillaHorarioFormulario, unknown, PlantillaHorarioDatos>({
    resolver: zodResolver(plantillaHorarioSchema),
    defaultValues: { nombre: plantilla?.nombre ?? '', porDefecto: plantilla?.porDefecto ?? false, tramos: plantilla ? aTramosFormulario(plantilla.tramos) : [] },
  })

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await guardar.mutateAsync({ id: plantilla?.id ?? null, datos })
      toast.success(plantilla ? 'Plantilla actualizada' : 'Plantilla creada')
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['nombre', 'tramos']))
    }
  })

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <FormProvider {...form}>
          <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{plantilla ? 'Editar plantilla' : 'Nueva plantilla de horario'}</DialogTitle>
              <DialogDescription>
                Las plantillas se copian al horario de cada persona. Cambiar una plantilla no cambia los horarios ya asignados.
              </DialogDescription>
            </DialogHeader>
            <AvisoError error={error} />
            <Field data-invalid={Boolean(form.formState.errors.nombre)}>
              <FieldLabel htmlFor="pl-nombre">
                <span>
                  Nombre <Requerido />
                </span>
              </FieldLabel>
              <Input id="pl-nombre" placeholder="Ej.: Medio tiempo mañana" {...form.register('nombre')} />
              <FieldError errors={[form.formState.errors.nombre]} />
            </Field>
            <Controller
              control={form.control}
              name="porDefecto"
              render={({ field }) => (
                <Label className="flex items-center gap-2 font-normal">
                  <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} disabled={plantilla?.porDefecto} />
                  Plantilla por defecto (la usa quien no tiene horario propio)
                </Label>
              )}
            />
            <EditorTramos />
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
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}

const PERSONALIZADO = 'personalizado'

export function DialogoHorario({ persona, abierto, onAbiertoChange }: PropsDialogo & { persona: PersonalItem }) {
  const { data: plantillas } = useQuery({ ...plantillasQuery, enabled: abierto })
  const guardar = useGuardarHorario(persona.usuario.id)
  const anular = useAnularHorario(persona.usuario.id)
  const [error, setError] = useState<string | null>(null)
  const hoy = diaEnLima()
  // El primer horario propio puede regir desde antes; los cambios, desde hoy.
  const minimo = persona.horario.porDefecto && !persona.proximo ? undefined : hoy

  const form = useForm<HorarioUsuarioFormulario, unknown, HorarioUsuarioDatos>({
    resolver: zodResolver(horarioUsuarioSchema),
    defaultValues: {
      vigenteDesde: persona.horario.porDefecto ? hoy : sumarDias(hoy, 1),
      plantillaId: persona.horario.plantilla?.id ?? '',
      tramos: aTramosFormulario(persona.horario.tramos),
    },
  })

  const elegirPlantilla = (id: string) => {
    form.setValue('plantillaId', id === PERSONALIZADO ? '' : id)
    const p = plantillas?.find((x) => x.id === id)
    if (p) form.setValue('tramos', aTramosFormulario(p.tramos))
  }

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      const plantilla = plantillas?.find((p) => p.id === datos.plantillaId)
      // Si se tocaron los tramos, ya no es copia fiel de la plantilla.
      const igual = plantilla && resumirHorario(plantilla.tramos) === resumirHorario(datos.tramos.map((t) => ({ diaSemana: t.diaSemana, inicio: horaAMinutos(t.inicio), fin: horaAMinutos(t.fin) })))
      await guardar.mutateAsync({ ...datos, plantillaId: igual ? datos.plantillaId : undefined })
      toast.success(`Horario de ${nombreCompleto(persona.usuario)} guardado desde el ${formatearFecha(datos.vigenteDesde)}`)
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['vigenteDesde', 'plantillaId', 'tramos']))
    }
  })

  const anularProximo = async () => {
    if (!persona.proximo?.id) return
    try {
      await anular.mutateAsync(persona.proximo.id)
      toast.success('Cambio de horario anulado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular')
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <FormProvider {...form}>
          <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Horario de {nombreCompleto(persona.usuario)}</DialogTitle>
              <DialogDescription>
                Hoy: {resumirHorario(persona.horario.tramos)}
                {persona.horario.porDefecto && ' (plantilla por defecto)'}. El cambio no altera los días anteriores.
              </DialogDescription>
            </DialogHeader>
            <AvisoError error={error} />
            {persona.proximo && (
              <Alert>
                <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Ya hay un cambio programado desde el {formatearFecha(persona.proximo.vigenteDesde)}: {resumirHorario(persona.proximo.tramos)}.
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={() => void anularProximo()} disabled={anular.isPending}>
                    Anular ese cambio
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="hor-plantilla">Partir de una plantilla</FieldLabel>
                <Controller
                  control={form.control}
                  name="plantillaId"
                  render={({ field }) => (
                    <Select value={(field.value as string | undefined) || PERSONALIZADO} onValueChange={elegirPlantilla}>
                      <SelectTrigger id="hor-plantilla" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {plantillas?.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nombre}
                          </SelectItem>
                        ))}
                        <SelectItem value={PERSONALIZADO}>Personalizado</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field data-invalid={Boolean(form.formState.errors.vigenteDesde)}>
                <FieldLabel htmlFor="hor-desde">
                  <span>
                    Rige desde <Requerido />
                  </span>
                </FieldLabel>
                <Input id="hor-desde" type="date" min={minimo} {...form.register('vigenteDesde')} />
                <FieldError errors={[form.formState.errors.vigenteDesde]} />
              </Field>
            </div>
            <EditorTramos />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                Guardar horario
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}

export function DialogoCumpleanos({ persona, abierto, onAbiertoChange }: PropsDialogo & { persona: PersonalItem }) {
  const guardar = useGuardarDatosPersonal(persona.usuario.id)
  const [valor, setValor] = useState(persona.fechaNacimiento ?? '')
  const [error, setError] = useState<string | null>(null)

  const enviar = async () => {
    setError(null)
    const datos = datosPersonalSchema.safeParse({ fechaNacimiento: valor || null })
    if (!datos.success) return setError('Fecha no válida')
    try {
      await guardar.mutateAsync(datos.data)
      toast.success('Fecha de nacimiento guardada')
      onAbiertoChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cumpleaños de {nombreCompleto(persona.usuario)}</DialogTitle>
          <DialogDescription>Ese día es libre. Si cae domingo o feriado, no se compensa.</DialogDescription>
        </DialogHeader>
        <AvisoError error={error} />
        <Field>
          <FieldLabel htmlFor="nacimiento">Fecha de nacimiento</FieldLabel>
          <Input id="nacimiento" type="date" max={diaEnLima()} value={valor} onChange={(ev) => setValor(ev.target.value)} />
          <FieldDescription>Déjala vacía para quitarla.</FieldDescription>
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void enviar()} disabled={guardar.isPending}>
            {guardar.isPending && <Loader2 className="animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DialogoFeriado({ feriado, anio, abierto, onAbiertoChange }: PropsDialogo & { feriado: FeriadoItem | null; anio: number }) {
  const guardar = useGuardarFeriado()
  const eliminar = useEliminarFeriado()
  const [error, setError] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const form = useForm<FeriadoFormulario, unknown, FeriadoDatos>({
    resolver: zodResolver(feriadoSchema),
    defaultValues: feriado ?? { fecha: `${anio}-01-01`, nombre: '', alcance: 'nacional', medioDia: false },
  })
  const e = form.formState.errors

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await guardar.mutateAsync({ id: feriado?.id ?? null, datos })
      toast.success(feriado ? 'Feriado actualizado' : 'Feriado agregado')
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['fecha', 'nombre', 'alcance']))
    }
  })

  const borrar = async () => {
    if (!feriado) return
    try {
      await eliminar.mutateAsync(feriado.id)
      toast.success('Feriado eliminado')
      onAbiertoChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{feriado ? 'Editar feriado' : 'Nuevo feriado'}</DialogTitle>
            <DialogDescription>Nadie trabaja ese día (o esa tarde, si es medio día). Ya no se pueden programar tareas.</DialogDescription>
          </DialogHeader>
          <AvisoError error={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(e.fecha)}>
              <FieldLabel htmlFor="fer-fecha">
                <span>
                  Fecha <Requerido />
                </span>
              </FieldLabel>
              <Input id="fer-fecha" type="date" {...form.register('fecha')} />
              <FieldError errors={[e.fecha]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="fer-alcance">Alcance</FieldLabel>
              <Controller
                control={form.control}
                name="alcance"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="fer-alcance" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALCANCES_FERIADO.map((a) => (
                        <SelectItem key={a} value={a}>
                          {NOMBRE_ALCANCE_FERIADO[a]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>
          <Field data-invalid={Boolean(e.nombre)}>
            <FieldLabel htmlFor="fer-nombre">
              <span>
                Nombre <Requerido />
              </span>
            </FieldLabel>
            <Input id="fer-nombre" placeholder="Ej.: Aniversario de GRUPO ES" {...form.register('nombre')} />
            <FieldError errors={[e.nombre]} />
          </Field>
          <Controller
            control={form.control}
            name="medioDia"
            render={({ field }) => (
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                Medio día (se trabaja solo en la mañana, hasta la 1:00 p. m.)
              </Label>
            )}
          />
          <DialogFooter className="sm:justify-between">
            {feriado ? (
              confirmando ? (
                <Button type="button" variant="destructive" onClick={() => void borrar()} disabled={eliminar.isPending}>
                  {eliminar.isPending && <Loader2 className="animate-spin" />}
                  Confirmar: eliminar
                </Button>
              ) : (
                <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmando(true)}>
                  Eliminar
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                Guardar
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
