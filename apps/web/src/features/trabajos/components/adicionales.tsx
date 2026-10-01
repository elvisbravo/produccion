import { zodResolver } from '@hookform/resolvers/zod'
import {
  aCentimos,
  adicionalSchema,
  deCentimos,
  diaEnLima,
  formatearSoles,
  motivoAdicionalSchema,
  NOMBRE_ESTADO_ADICIONAL,
  sumarDias,
  type AdicionalDatos,
  type AdicionalFormulario,
  type AdicionalItem,
  type ContratoDetalle,
  type EstadoAdicional,
} from '@grupoes/shared'
import { AlertCircle, Ban, Check, Loader2, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { Can } from '@/components/can'
import { Requerido } from '@/components/requerido'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { formatearFecha, nombreCompleto } from '@/lib/formato'
import { aplicarErroresApi } from '@/lib/formularios'
import { cn } from '@/lib/utils'
import { useProponerAdicional, useResponderAdicional } from '../api'

const ESTILO: Record<EstadoAdicional, string> = {
  propuesto: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  aceptado: 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200',
  rechazado: 'text-muted-foreground',
  anulado: 'text-muted-foreground line-through',
}

const mensaje = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo guardar')

/** Trabajos fuera de lo acordado: se proponen, el cliente los acepta o rechaza, y los aceptados suman sus cuotas. */
export function SeccionAdicionales({ contrato }: { contrato: ContratoDetalle }) {
  const [proponiendo, setProponiendo] = useState(false)
  const [conMotivo, setConMotivo] = useState<{ adicional: AdicionalItem; accion: 'rechazar' | 'anular' } | null>(null)
  const responder = useResponderAdicional()
  const vigente = contrato.estado === 'vigente'
  const adicionales = contrato.adicionales ?? []

  const aceptar = (a: AdicionalItem) =>
    responder.mutate(
      { id: a.id, accion: 'aceptar' },
      { onSuccess: () => toast.success(`Adicional ${a.numero} aceptado: sus cuotas ya están en la cuenta`), onError: (err) => toast.error(mensaje(err)) },
    )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Adicionales</h3>
        {vigente && (
          <Can permiso="contratos.editar">
            <Button size="sm" variant="outline" onClick={() => setProponiendo(true)}>
              <Plus />
              Proponer adicional
            </Button>
          </Can>
        )}
      </div>
      {adicionales.length === 0 ? (
        <p className="text-sm text-muted-foreground">Trabajos fuera de lo acordado (otro capítulo, cambio de tema, encuestas extra) se registran aquí con su monto y sus cuotas.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {adicionales.map((a) => (
            <li key={a.id} className={cn('flex flex-col gap-1.5 px-3 py-2.5 text-sm', (a.estado === 'rechazado' || a.estado === 'anulado') && 'text-muted-foreground')}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">Adicional {a.numero}</span>
                <Badge variant="outline" className={ESTILO[a.estado]}>
                  {NOMBRE_ESTADO_ADICIONAL[a.estado]}
                </Badge>
                <span className={cn('font-medium tabular-nums', a.estado === 'anulado' && 'line-through')}>{formatearSoles(a.monto)}</span>
                <span className="ml-auto flex flex-wrap gap-1">
                  {vigente && a.estado === 'propuesto' && (
                    <Can permiso="contratos.editar">
                      <Button size="sm" variant="outline" disabled={responder.isPending} onClick={() => aceptar(a)}>
                        <Check />
                        Aceptó el cliente
                      </Button>
                      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setConMotivo({ adicional: a, accion: 'rechazar' })}>
                        <X />
                        Rechazó
                      </Button>
                    </Can>
                  )}
                  {vigente && (a.estado === 'propuesto' || (a.estado === 'aceptado' && !a.conPagos)) && (
                    <Can permiso="contratos.anular">
                      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setConMotivo({ adicional: a, accion: 'anular' })}>
                        <Ban />
                        Anular
                      </Button>
                    </Can>
                  )}
                </span>
              </div>
              <p className="break-words">{a.descripcion}</p>
              <p className="text-xs text-muted-foreground">
                {a.cuotas
                  .map((q) => `${q.numero ? `cuota ${q.numero}: ` : ''}${formatearSoles(q.monto)} al ${formatearFecha(q.vencimiento)}`)
                  .join(' · ')}
              </p>
              <p className="text-xs text-muted-foreground">
                Propuesto por {nombreCompleto(a.propuestoPor)} el {formatearFecha(a.propuestoEn.slice(0, 10))}
                {a.respondido && ` · ${NOMBRE_ESTADO_ADICIONAL[a.estado].toLowerCase()} el ${formatearFecha(a.respondido.en.slice(0, 10))}${a.respondido.por ? ` por ${nombreCompleto(a.respondido.por)}` : ''}`}
                {a.motivo && ` · ${a.motivo}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      {proponiendo && <DialogoAdicional contratoId={contrato.id} abierto onAbiertoChange={setProponiendo} />}
      {conMotivo && <DialogoMotivo {...conMotivo} abierto onAbiertoChange={(v) => !v && setConMotivo(null)} />}
    </div>
  )
}

interface PropsDialogo {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

function DialogoAdicional({ contratoId, abierto, onAbiertoChange }: PropsDialogo & { contratoId: string }) {
  const proponer = useProponerAdicional(contratoId)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<AdicionalFormulario, unknown, AdicionalDatos>({
    resolver: zodResolver(adicionalSchema),
    defaultValues: { descripcion: '', monto: '' as unknown as number, cuotas: [{ monto: '' as unknown as number, vencimiento: sumarDias(diaEnLima(), 7) }] },
  })
  const cuotas = useFieldArray({ control: form.control, name: 'cuotas' })
  const [monto, lista] = useWatch({ control: form.control, name: ['monto', 'cuotas'] })
  const suma = (lista ?? []).reduce((s, q) => s + aCentimos(Number(q.monto) || 0), 0)
  const diferencia = aCentimos(Number(monto) || 0) - suma
  const errores = form.formState.errors

  /** Reparte el monto en partes iguales (el resto de céntimos va a la última cuota). */
  const repartir = () => {
    const total = aCentimos(Number(monto) || 0)
    const n = cuotas.fields.length
    if (!total || !n) return
    const parte = Math.floor(total / n)
    cuotas.fields.forEach((_, i) => form.setValue(`cuotas.${i}.monto`, deCentimos(i === n - 1 ? total - parte * (n - 1) : parte), { shouldValidate: form.formState.isSubmitted }))
  }

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await proponer.mutateAsync(datos)
      toast.success('Adicional propuesto. Cuando el cliente lo acepte, márcalo como aceptado.')
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['descripcion', 'monto', 'cuotas']))
    }
  })

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Proponer adicional</DialogTitle>
            <DialogDescription>Queda como propuesto; sus cuotas se suman a la cuenta recién cuando el cliente lo acepta.</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={Boolean(errores.descripcion)}>
            <FieldLabel htmlFor="adi-desc">
              <span>
                Descripción <Requerido />
              </span>
            </FieldLabel>
            <Textarea id="adi-desc" rows={2} placeholder="Por ejemplo: capítulo de antecedentes adicional pedido por el asesor" {...form.register('descripcion')} />
            <FieldError errors={[errores.descripcion]} />
          </Field>
          <Field data-invalid={Boolean(errores.monto)} className="w-48">
            <FieldLabel htmlFor="adi-monto">
              <span>
                Monto <Requerido />
              </span>
            </FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>S/</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput id="adi-monto" type="number" inputMode="decimal" min={0} step="0.01" {...form.register('monto')} />
            </InputGroup>
            <FieldError errors={[errores.monto]} />
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">
              Cuotas <Requerido />
            </legend>
            {cuotas.fields.map((campo, i) => (
              <div key={campo.id} className="grid grid-cols-[2rem_1fr_1fr_2rem] items-start gap-2">
                <span className="pt-2 text-sm text-muted-foreground">{i + 1}.</span>
                <Field data-invalid={Boolean(errores.cuotas?.[i]?.monto)}>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>S/</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput aria-label={`Monto de la cuota ${i + 1}`} type="number" inputMode="decimal" min={0} step="0.01" {...form.register(`cuotas.${i}.monto`)} />
                  </InputGroup>
                  <FieldError errors={[errores.cuotas?.[i]?.monto]} />
                </Field>
                <Field data-invalid={Boolean(errores.cuotas?.[i]?.vencimiento)}>
                  <Input aria-label={`Vencimiento de la cuota ${i + 1}`} type="date" {...form.register(`cuotas.${i}.vencimiento`)} />
                  <FieldError errors={[errores.cuotas?.[i]?.vencimiento]} />
                </Field>
                <Button type="button" variant="ghost" size="icon" aria-label={`Quitar la cuota ${i + 1}`} disabled={cuotas.fields.length === 1} onClick={() => cuotas.remove(i)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={cuotas.fields.length >= 12}
                onClick={() => {
                  const anterior = lista?.at(-1)?.vencimiento
                  cuotas.append({ monto: '' as unknown as number, vencimiento: anterior ? sumarDias(anterior, 30) : diaEnLima() })
                }}
              >
                <Plus />
                Agregar cuota
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={repartir} disabled={!Number(monto)}>
                Repartir el monto en partes iguales
              </Button>
              {Number(monto) > 0 && diferencia !== 0 && (
                <span className="ml-auto text-xs text-amber-700 dark:text-amber-400">
                  {diferencia > 0 ? `Faltan ${formatearSoles(deCentimos(diferencia))}` : `Sobran ${formatearSoles(deCentimos(-diferencia))}`}
                </span>
              )}
            </div>
            {errores.cuotas?.root?.message && <p className="text-sm text-destructive">{errores.cuotas.root.message}</p>}
            {errores.cuotas?.message && <p className="text-sm text-destructive">{errores.cuotas.message}</p>}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Proponer adicional
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DialogoMotivo({ adicional, accion, abierto, onAbiertoChange }: PropsDialogo & { adicional: AdicionalItem; accion: 'rechazar' | 'anular' }) {
  const responder = useResponderAdicional()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<{ motivo: string }>({ resolver: zodResolver(motivoAdicionalSchema), defaultValues: { motivo: '' } })
  const rechazar = accion === 'rechazar'

  const enviar = form.handleSubmit(async ({ motivo }) => {
    setError(null)
    try {
      await responder.mutateAsync({ id: adicional.id, accion, motivo })
      toast.success(`Adicional ${adicional.numero} ${rechazar ? 'rechazado' : 'anulado'}`)
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
            <DialogTitle>
              {rechazar ? 'El cliente rechazó' : 'Anular'} el adicional {adicional.numero}
            </DialogTitle>
            <DialogDescription>
              {adicional.descripcion} · {formatearSoles(adicional.monto)}.{' '}
              {rechazar ? 'Queda en el historial con el motivo.' : adicional.estado === 'aceptado' ? 'Sus cuotas se quitan de la cuenta.' : 'Queda en el historial con el motivo.'}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={Boolean(form.formState.errors.motivo)}>
            <FieldLabel htmlFor="adi-motivo">
              <span>
                Motivo <Requerido />
              </span>
            </FieldLabel>
            <Textarea id="adi-motivo" rows={2} {...form.register('motivo')} />
            <FieldError errors={[form.formState.errors.motivo]} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
              Volver
            </Button>
            <Button type="submit" variant={rechazar ? 'default' : 'destructive'} disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              {rechazar ? 'Registrar rechazo' : 'Anular adicional'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
