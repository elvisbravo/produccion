import { zodResolver } from '@hookform/resolvers/zod'
import { diaEnLima, tiempoManualSchema, type TiempoManualDatos, type TiempoManualFormulario } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Loader2, PenLine, Trash2, Zap } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { duracion, formatearFechaHora, formatearHora, nombreCompleto } from '@/lib/formato'
import { aplicarErroresApi } from '@/lib/formularios'
import { useAlcance, usePermiso } from '@/lib/permisos'
import { useSesion } from '@/stores/sesion'
import { tiemposTareaQuery, useQuitarTiempo, useTiempoManual } from '../api'

interface Props {
  tareaId: string
  titulo: string
  /** Solo quien realiza la tarea registra tiempo a mano. */
  esResponsable: boolean
  onCerrar: () => void
}

/** Tiempo registrado en una tarea: tramos (cronómetro o manual) y registro manual si se olvidó marcar. */
export function DialogoTiempos({ tareaId, titulo, esResponsable, onCerrar }: Props) {
  const { data } = useQuery(tiemposTareaQuery(tareaId))
  const quitar = useQuitarTiempo(tareaId)
  const usuarioId = useSesion((s) => s.usuario?.id)
  const puedeManual = usePermiso('tareas.tiempo_manual') && esResponsable
  const editaTodas = useAlcance('tareas.editar') === 'todos'

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tiempo en «{titulo}»</DialogTitle>
          <DialogDescription>
            {data ? `${duracion(data.minutosReales)} reales de ${duracion(data.minutosEstimados)} estimadas.` : 'Cargando…'} Se compara para ajustar los tiempos del catálogo.
          </DialogDescription>
        </DialogHeader>
        {!data ? (
          <Skeleton className="h-32" />
        ) : data.registros.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay tiempo registrado.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {data.registros.map((r) => {
              const puedeQuitar = editaTodas || (r.usuario.id === usuarioId && r.manual)
              return (
                <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="tabular-nums">
                      {formatearFechaHora(r.inicio)}
                      {r.fin ? ` – ${formatearHora(r.fin)}` : ' – en curso'}
                      {r.minutos !== null && <span className="text-muted-foreground"> · {duracion(r.minutos)}</span>}
                    </span>
                    <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      {nombreCompleto(r.usuario)}
                      {r.manual && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                          <PenLine /> manual
                        </Badge>
                      )}
                      {r.autoCerrado && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                          <Zap /> cerrado por el sistema
                        </Badge>
                      )}
                      {r.motivo && ` · ${r.motivo}`}
                    </span>
                  </div>
                  {puedeQuitar && r.fin && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Quitar registro"
                      onClick={() => quitar.mutate(r.id, { onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo quitar') })}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {puedeManual && <FormularioManual tareaId={tareaId} />}
      </DialogContent>
    </Dialog>
  )
}

function FormularioManual({ tareaId }: { tareaId: string }) {
  const registrar = useTiempoManual(tareaId)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<TiempoManualFormulario, unknown, TiempoManualDatos>({
    resolver: zodResolver(tiempoManualSchema),
    defaultValues: { fecha: diaEnLima(), horaInicio: '', horaFin: '', motivo: '' },
  })
  const e = form.formState.errors
  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await registrar.mutateAsync(datos)
      toast.success('Tiempo registrado (queda marcado como manual)')
      form.reset({ fecha: datos.fecha, horaInicio: '', horaFin: '', motivo: '' })
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['fecha', 'horaInicio', 'horaFin', 'motivo']))
    }
  })
  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <span className="text-sm font-medium">¿Olvidaste usar el cronómetro? Regístralo a mano</span>
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Field data-invalid={Boolean(e.fecha)}>
          <FieldLabel htmlFor="tm-fecha">Día</FieldLabel>
          <Input id="tm-fecha" type="date" max={diaEnLima()} {...form.register('fecha')} />
          <FieldError errors={[e.fecha]} />
        </Field>
        <Field data-invalid={Boolean(e.horaInicio)}>
          <FieldLabel htmlFor="tm-ini">De</FieldLabel>
          <Input id="tm-ini" type="time" step={300} {...form.register('horaInicio')} />
          <FieldError errors={[e.horaInicio]} />
        </Field>
        <Field data-invalid={Boolean(e.horaFin)}>
          <FieldLabel htmlFor="tm-fin">A</FieldLabel>
          <Input id="tm-fin" type="time" step={300} {...form.register('horaFin')} />
          <FieldError errors={[e.horaFin]} />
        </Field>
      </div>
      <Field data-invalid={Boolean(e.motivo)}>
        <FieldLabel htmlFor="tm-motivo">Motivo</FieldLabel>
        <Input id="tm-motivo" placeholder="Ej.: olvidé iniciar el cronómetro" {...form.register('motivo')} />
        <FieldError errors={[e.motivo]} />
      </Field>
      <Button type="submit" size="sm" className="w-fit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
        Registrar tiempo
      </Button>
    </form>
  )
}
