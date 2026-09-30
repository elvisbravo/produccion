import { zodResolver } from '@hookform/resolvers/zod'
import {
  completarTareaSchema,
  diaEnLima,
  sumarDias,
  type ActividadCatalogo,
  type CatalogosProspecto,
  type CompletarTareaDatos,
  type ResultadoCompletar,
  type TareaItem,
} from '@grupoes/shared'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Controller, FormProvider, useForm } from 'react-hook-form'
import type { z } from 'zod'
import { Requerido } from '@/components/requerido'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { aplicarErroresApi } from '@/lib/formularios'
import { usePermiso } from '@/lib/permisos'
import { useCompletarTarea } from '../api'
import { CamposProgramacion } from './campos-programacion'

type Formulario = z.input<typeof completarTareaSchema>
type Paso = 'agendar' | 'perdido' | 'ninguno'

interface Props {
  tarea: TareaItem
  actividades: ActividadCatalogo[]
  catalogos: Pick<CatalogosProspecto, 'resultadosContacto' | 'motivosPerdida'>
  /** El prospecto ya tiene otra actividad pendiente (no hace falta agendar la siguiente). */
  hayOtrasPendientes: boolean
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  onCompletada?: (resultado: ResultadoCompletar) => void
}

export function DialogoCompletar({ tarea, actividades, catalogos, hayOtrasPendientes, abierto, onAbiertoChange, onCompletada }: Props) {
  const completar = useCompletarTarea(tarea.id)
  const [error, setError] = useState<string | null>(null)
  const esSeguimiento = tarea.actividad.esSeguimiento
  const esReunion = tarea.actividad.comportamiento === 'reunion'
  const puedeAgendar = usePermiso('tareas.crear')
  const puedePerder = usePermiso('prospectos.marcar_perdido')
  // Solo quien lleva el seguimiento decide el siguiente paso (el auxiliar que da un enfoque, no).
  const decideSiguiente = Boolean(tarea.prospecto) && (puedeAgendar || puedePerder)
  const [paso, setPaso] = useState<Paso>(esSeguimiento && !hayOtrasPendientes && puedeAgendar ? 'agendar' : 'ninguno')

  const form = useForm<Formulario, unknown, CompletarTareaDatos>({
    resolver: zodResolver(completarTareaSchema),
    // Los campos del paso que no se muestra se quitan de los datos.
    shouldUnregister: true,
    defaultValues: {
      asistio: true,
      resultadoContactoId: '',
      resultado: '',
      siguiente: {
        actividadId: esSeguimiento ? tarea.actividad.id : '',
        fecha: sumarDias(diaEnLima(), 1),
        hora: '',
        modalidad: '',
        notas: '',
      },
    },
  })
  const e = form.formState.errors

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      const resultado = await completar.mutateAsync(datos)
      toast.success(resultado.tarea.estado === 'no_asistio' ? `${tarea.actividad.nombre}: el cliente no asistió` : `${tarea.actividad.nombre} completado`)
      onAbiertoChange(false)
      onCompletada?.(resultado)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['resultadoContactoId', 'resultado', 'siguiente', 'marcarPerdido']))
    }
  })

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <FormProvider {...form}>
          <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Completar: {tarea.actividad.nombre}</DialogTitle>
              <DialogDescription>
                {tarea.prospecto ? `${tarea.prospecto.codigo} · ` : ''}Registra cómo te fue{esSeguimiento ? ' y el siguiente paso' : ''}.
              </DialogDescription>
            </DialogHeader>
            {error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {esReunion && (
              <Field>
                <FieldLabel id="asistio-label">¿El cliente asistió?</FieldLabel>
                <Controller
                  control={form.control}
                  name="asistio"
                  render={({ field }) => (
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      className="w-full"
                      aria-labelledby="asistio-label"
                      value={field.value === false ? 'no' : 'si'}
                      onValueChange={(v) => v && field.onChange(v === 'si')}
                    >
                      <ToggleGroupItem value="si" className="flex-1">
                        Sí, se realizó
                      </ToggleGroupItem>
                      <ToggleGroupItem value="no" className="flex-1">
                        No asistió
                      </ToggleGroupItem>
                    </ToggleGroup>
                  )}
                />
              </Field>
            )}

            {esSeguimiento && (
              <Field data-invalid={Boolean(e.resultadoContactoId)}>
                <FieldLabel htmlFor="resultado-contacto">
                  <span>
                    Resultado del contacto <Requerido />
                  </span>
                </FieldLabel>
                <Controller
                  control={form.control}
                  name="resultadoContactoId"
                  render={({ field }) => (
                    <Select value={(field.value as string) ?? ''} onValueChange={field.onChange}>
                      <SelectTrigger id="resultado-contacto" className="w-full" aria-invalid={Boolean(e.resultadoContactoId)}>
                        <SelectValue placeholder="Seleccionar…" />
                      </SelectTrigger>
                      <SelectContent>
                        {catalogos.resultadosContacto.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[e.resultadoContactoId]} />
              </Field>
            )}

            <Field data-invalid={Boolean(e.resultado)}>
              <FieldLabel htmlFor="resultado">{esReunion ? 'Observaciones' : 'Nota'}</FieldLabel>
              <Textarea
                id="resultado"
                rows={3}
                placeholder={esReunion ? 'En qué estado está su trabajo, qué necesita, acuerdos…' : 'Qué respondió, qué quedó pendiente…'}
                {...form.register('resultado')}
              />
              <FieldError errors={[e.resultado]} />
            </Field>

            {decideSiguiente && (
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-2 text-sm font-medium">Siguiente paso</legend>
                <RadioGroup value={paso} onValueChange={(v) => setPaso(v as Paso)} className="gap-2">
                  {puedeAgendar && <OpcionPaso valor="agendar" etiqueta="Agendar el siguiente seguimiento" />}
                  {puedePerder && <OpcionPaso valor="perdido" etiqueta="Marcar el prospecto como perdido" />}
                  {(!esSeguimiento || hayOtrasPendientes) && (
                    <OpcionPaso valor="ninguno" etiqueta={hayOtrasPendientes ? 'Ya tiene otra actividad pendiente' : 'Por ahora nada más'} />
                  )}
                </RadioGroup>
                {e.siguiente?.message && <p className="text-sm text-destructive">{e.siguiente.message}</p>}

                {paso === 'agendar' && (
                  <div className="rounded-lg border p-4">
                    <CamposProgramacion prefijo="siguiente." actividades={actividades} mostrarDetalle={false} />
                  </div>
                )}
                {paso === 'perdido' && (
                  <Field data-invalid={Boolean(e.marcarPerdido?.motivoPerdidaId)}>
                    <FieldLabel htmlFor="motivo-perdida">
                      <span>
                        Motivo <Requerido />
                      </span>
                    </FieldLabel>
                    <Controller
                      control={form.control}
                      name="marcarPerdido.motivoPerdidaId"
                      render={({ field }) => (
                        <Select value={(field.value as string) ?? ''} onValueChange={field.onChange}>
                          <SelectTrigger id="motivo-perdida" className="w-full" aria-invalid={Boolean(e.marcarPerdido?.motivoPerdidaId)}>
                            <SelectValue placeholder="Seleccionar…" />
                          </SelectTrigger>
                          <SelectContent>
                            {catalogos.motivosPerdida.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <FieldError errors={[e.marcarPerdido?.motivoPerdidaId]} />
                  </Field>
                )}
              </fieldset>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                Completar
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}

function OpcionPaso({ valor, etiqueta }: { valor: Paso; etiqueta: string }) {
  const id = `paso-${valor}`
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem value={valor} id={id} />
      <Label htmlFor={id} className="font-normal">
        {etiqueta}
      </Label>
    </div>
  )
}
