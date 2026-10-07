import { zodResolver } from '@hookform/resolvers/zod'
import {
  cancelarTareaSchema,
  diaEnLima,
  horaEnLima,
  reprogramarTareaSchema,
  type ReprogramarTareaDatos,
  type TareaItem,
} from '@grupoes/shared'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { Requerido } from '@/components/requerido'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { formatearFechaHora, nombreCompleto } from '@/lib/formato'
import { aplicarErroresApi } from '@/lib/formularios'
import { useQuery } from '@tanstack/react-query'
import { usePermiso } from '@/lib/permisos'
import { impactoCancelarQuery, impactoReprogramarQuery, useCancelarTarea, useReprogramarTarea } from '../api'
import { AvisoImpacto, resumenImpacto } from './aviso-impacto'
import { avisarReordenar } from './reordenar-cola'

interface PropsDialogo {
  tarea: TareaItem
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

export function DialogoReprogramar({ tarea, abierto, onAbiertoChange, proponer = false }: PropsDialogo & { proponer?: boolean }) {
  const reprogramar = useReprogramarTarea(tarea.id)
  const [error, setError] = useState<string | null>(null)
  const [confirmado, setConfirmado] = useState(false)
  const [fijasAceptadas, setFijasAceptadas] = useState(false)
  const puedeFijar = usePermiso('trabajos.fijar_fechas')
  const form = useForm<z.input<typeof reprogramarTareaSchema>, unknown, ReprogramarTareaDatos>({
    resolver: zodResolver(reprogramarTareaSchema),
    defaultValues: { fecha: tarea.fecha, hora: tarea.inicio ? horaEnLima(new Date(tarea.inicio)) : '', motivo: '' },
  })
  const e = form.formState.errors
  // Una reunión ya asignada: se ve qué se corre en la cola de quien la hace con el nuevo horario.
  const [fechaNueva = '', horaNueva = ''] = useWatch({ control: form.control, name: ['fecha', 'hora'] }) as (string | undefined)[]
  const esReunionAsignada = tarea.actividad.requiereHoraFija && tarea.responsables.length > 0 && !proponer
  const cambio = Boolean(fechaNueva && horaNueva && (fechaNueva !== tarea.fecha || horaNueva !== (tarea.inicio ? horaEnLima(new Date(tarea.inicio)) : '')))
  const { data: impactos = [] } = useQuery(impactoReprogramarQuery(tarea.id, fechaNueva, horaNueva, esReunionAsignada && cambio && /^\d{2}:\d{2}$/.test(horaNueva)))
  const r = resumenImpacto(impactos)
  const faltaConfirmar = (r.enRojo > 0 && !confirmado) || (r.fijas.length > 0 && (!fijasAceptadas || !puedeFijar))

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await reprogramar.mutateAsync({ ...datos, motivoForzado: datos.motivo, confirmarImpacto: r.enRojo > 0 ? confirmado : undefined, forzarFechasFijas: r.fijas.length > 0 ? fijasAceptadas : undefined })
      if (r.enRojo > 0) avisarReordenar(impactos.filter((i) => i.pasanARojo > 0).map((i) => i.usuario.id), 'Reunión reprogramada')
      else toast.success(proponer ? 'Propuesta enviada: se avisó a quien pidió la reunión' : 'Actividad reprogramada')
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['fecha', 'hora', 'motivo']))
    }
  })

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{proponer ? 'Proponer otra hora' : 'Reprogramar'}: {tarea.actividad.nombre}</DialogTitle>
            <DialogDescription>
              {proponer ? 'Indica el día y la hora en que sí puedes. Se avisa a quien pidió la reunión para que lo confirme con el cliente; sigue pendiente de asignar.' : 'Queda registrado en la línea de tiempo del prospecto.'}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field data-invalid={Boolean(e.fecha)}>
              <FieldLabel htmlFor="rep-fecha">
                <span>
                  Día <Requerido />
                </span>
              </FieldLabel>
              <Input id="rep-fecha" type="date" min={diaEnLima()} {...form.register('fecha')} />
              <FieldError errors={[e.fecha]} />
            </Field>
            <Field data-invalid={Boolean(e.hora)}>
              <FieldLabel htmlFor="rep-hora">
                <span>Hora {tarea.actividad.requiereHoraFija && <Requerido />}</span>
              </FieldLabel>
              <Input id="rep-hora" type="time" step={900} {...form.register('hora')} />
              <FieldError errors={[e.hora]} />
            </Field>
          </div>
          <AvisoImpacto impactos={impactos} confirmado={confirmado} onConfirmado={setConfirmado} fijasAceptadas={fijasAceptadas} onFijas={setFijasAceptadas} puedeForzarFijas={puedeFijar} />
          <Field data-invalid={Boolean(e.motivo)}>
            <FieldLabel htmlFor="rep-motivo">Motivo</FieldLabel>
            <Input id="rep-motivo" placeholder="Ej.: el cliente pidió otro día" {...form.register('motivo')} />
            <FieldError errors={[e.motivo]} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting || faltaConfirmar}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              {proponer ? 'Proponer esta hora' : 'Reprogramar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DialogoCancelar({ tarea, abierto, onAbiertoChange }: PropsDialogo) {
  const cancelar = useCancelarTarea(tarea.id)
  const [error, setError] = useState<string | null>(null)
  // Una reunión ya asignada: el tiempo que deja libre lo aprovechan las actividades siguientes de su cola.
  const { data: adelantos = [] } = useQuery(impactoCancelarQuery(tarea.id, abierto && tarea.actividad.requiereHoraFija && tarea.responsables.length > 0))
  const seAdelantan = adelantos.reduce((n, i) => n + i.tareas.length, 0)
  const form = useForm<{ motivo: string }>({ resolver: zodResolver(cancelarTareaSchema), defaultValues: { motivo: '' } })

  const enviar = form.handleSubmit(async ({ motivo }) => {
    setError(null)
    try {
      await cancelar.mutateAsync(motivo)
      toast.success(seAdelantan > 0 ? `Actividad cancelada: ${seAdelantan === 1 ? 'se adelantó 1 tarea' : `se adelantaron ${seAdelantan} tareas`} de la cola` : 'Actividad cancelada')
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['motivo']))
    }
  })

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Cancelar: {tarea.actividad.nombre}</DialogTitle>
            <DialogDescription>La actividad no se realizará. Queda en el historial con su motivo.</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {seAdelantan > 0 && (
            <div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-3 text-sm" aria-live="polite">
              <p className="font-medium">El tiempo no queda vacío: {seAdelantan === 1 ? 'se adelanta 1 tarea' : `se adelantan ${seAdelantan} tareas`} de su cola.</p>
              {adelantos
                .filter((i) => i.tareas.length > 0)
                .map((i) => (
                  <div key={i.usuario.id} className="flex flex-col gap-0.5 text-xs">
                    <span className="font-medium">{nombreCompleto(i.usuario)}</span>
                    {i.tareas.slice(0, 4).map((t) => (
                      <span key={t.tareaId}>
                        <span className="font-mono">{t.trabajoCodigo}</span> {t.titulo}: {t.finAntes ? formatearFechaHora(t.finAntes) : '—'} → {t.finDespues ? formatearFechaHora(t.finDespues) : '—'}
                      </span>
                    ))}
                    {i.tareas.length > 4 && <span className="text-muted-foreground">y {i.tareas.length - 4} más</span>}
                  </div>
                ))}
            </div>
          )}
          <Field data-invalid={Boolean(form.formState.errors.motivo)}>
            <FieldLabel htmlFor="can-motivo">
              <span>
                Motivo <Requerido />
              </span>
            </FieldLabel>
            <Textarea id="can-motivo" rows={2} {...form.register('motivo')} />
            <FieldError errors={[form.formState.errors.motivo]} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
              Volver
            </Button>
            <Button type="submit" variant="destructive" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Cancelar actividad
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
