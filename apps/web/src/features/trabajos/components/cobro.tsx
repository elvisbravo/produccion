import { aCentimos, cobroSchema, deCentimos, diaEnLima, formatearSoles, sumarDias, type CobroFormulario, type TrabajoDetalle } from '@grupoes/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, HandCoins, Loader2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, FormProvider, useFieldArray, useForm, useFormContext, useWatch, type Control, type FieldValues, type UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { Can } from '@/components/can'
import { Requerido } from '@/components/requerido'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { aplicarErroresApi } from '@/lib/formularios'
import { useRegistrarCobro } from '../api'

const numero = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Valores iniciales del cobro: al contado, con un pago que vence hoy. */
export const cobroVacio = (): CobroFormulario => ({ montoTotal: '' as unknown as number, formaPago: 'contado', cuotas: [{ monto: '' as unknown as number, vencimiento: diaEnLima() }] })

/**
 * Monto, forma de pago y pagos de un cobro. Se usa dentro de un formulario react-hook-form cuyo valor del cobro
 * está en `prefijo` (por ejemplo "cobro" en el registro del trabajo, o la raíz en el cuadro de cobro).
 */
export function CamposCobro({ prefijo = '' }: { prefijo?: string }) {
  const { control, register, formState } = useFormContext<FieldValues>()
  const ruta = (c: string) => (prefijo ? `${prefijo}.${c}` : c)
  const cuotas = useFieldArray({ control: control as Control<FieldValues>, name: ruta('cuotas') })
  const formaPago = useWatch({ control, name: ruta('formaPago') }) as string
  const montoTotal = numero(useWatch({ control, name: ruta('montoTotal') }))
  const valores = (useWatch({ control, name: ruta('cuotas') }) ?? []) as { monto: unknown; vencimiento: string }[]
  const errores = (prefijo ? (formState.errors as Record<string, unknown>)[prefijo] : formState.errors) as
    | { montoTotal?: { message?: string }; cuotas?: ({ monto?: { message?: string }; vencimiento?: { message?: string } } | undefined)[] & { root?: { message?: string }; message?: string } }
    | undefined

  // Al contado: un solo pago por el total.
  useEffect(() => {
    if (formaPago === 'contado') cuotas.replace([{ monto: montoTotal || ('' as unknown as number), vencimiento: valores[0]?.vencimiento || diaEnLima() }])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cuotas.replace es estable
  }, [formaPago, montoTotal])

  const suma = valores.reduce((s, c) => s + aCentimos(numero(c?.monto)), 0)
  const cuadra = montoTotal > 0 && suma === aCentimos(montoTotal)
  const errorSuma = errores?.cuotas?.root?.message ?? errores?.cuotas?.message

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={Boolean(errores?.montoTotal)}>
          <FieldLabel htmlFor={`${prefijo}-cobro-total`}>
            <span>
              Monto total (S/) <Requerido />
            </span>
          </FieldLabel>
          <Input id={`${prefijo}-cobro-total`} type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00" aria-invalid={Boolean(errores?.montoTotal)} {...register(ruta('montoTotal'))} />
          <FieldError errors={[errores?.montoTotal]} />
        </Field>
        <Field>
          <FieldLabel id={`${prefijo}-cobro-forma`}>Forma de pago</FieldLabel>
          <Controller
            control={control}
            name={ruta('formaPago')}
            render={({ field }) => (
              <ToggleGroup type="single" variant="outline" className="w-full" aria-labelledby={`${prefijo}-cobro-forma`} value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                <ToggleGroupItem value="contado" className="flex-1">
                  Al contado
                </ToggleGroupItem>
                <ToggleGroupItem value="cuotas" className="flex-1">
                  En pagos
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          />
        </Field>
      </div>

      {formaPago === 'contado' ? (
        <Field data-invalid={Boolean(errores?.cuotas?.[0]?.vencimiento)} className="sm:max-w-xs">
          <FieldLabel htmlFor={`${prefijo}-cobro-vence`}>Fecha de pago</FieldLabel>
          <Input id={`${prefijo}-cobro-vence`} type="date" {...register(ruta('cuotas.0.vencimiento'))} />
          <FieldError errors={[errores?.cuotas?.[0]?.vencimiento]} />
        </Field>
      ) : (
        <div className="flex flex-col gap-2">
          {cuotas.fields.length > 0 && (
            <div className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2 px-1 text-xs font-medium text-muted-foreground">
              <span>N.º</span>
              <span>Monto (S/)</span>
              <span>Vence</span>
            </div>
          )}
          {cuotas.fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_2rem] items-start gap-2">
              <span className="pt-1.5 text-center text-sm text-muted-foreground">{i + 1}</span>
              <div>
                <Input type="number" inputMode="decimal" step="0.01" aria-label={`Monto del pago ${i + 1}`} aria-invalid={Boolean(errores?.cuotas?.[i]?.monto)} {...register(ruta(`cuotas.${i}.monto`))} />
                <FieldError errors={[errores?.cuotas?.[i]?.monto]} />
              </div>
              <div>
                <Input type="date" aria-label={`Vencimiento del pago ${i + 1}`} aria-invalid={Boolean(errores?.cuotas?.[i]?.vencimiento)} {...register(ruta(`cuotas.${i}.vencimiento`))} />
                <FieldError errors={[errores?.cuotas?.[i]?.vencimiento]} />
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Quitar el pago ${i + 1}`} onClick={() => cuotas.remove(i)} disabled={cuotas.fields.length === 1}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => {
              const ultima = valores.at(-1)?.vencimiento
              cuotas.append({ monto: '' as unknown as number, vencimiento: ultima ? sumarDias(ultima, 15) : diaEnLima() })
            }}
          >
            <Plus />
            Agregar pago
          </Button>
        </div>
      )}
      {montoTotal > 0 && (
        <p className={cuadra ? 'text-sm text-green-700 dark:text-green-400' : 'text-sm text-muted-foreground'}>
          Los pagos suman {formatearSoles(deCentimos(suma))} de {formatearSoles(montoTotal)}
        </p>
      )}
      {errorSuma && <p className="text-sm text-destructive">{errorSuma}</p>}
    </div>
  )
}

/** Cuadro de la ficha de un trabajo de proveedor que aún no tiene cobro. */
export function CobroPendiente({ t }: { t: TrabajoDetalle }) {
  const [abierto, setAbierto] = useState(false)
  if (!t.proveedor || t.contrato || ['cancelado'].includes(t.estado)) return null
  return (
    <Can permiso="contratos.crear">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Cobro</CardTitle>
            <CardDescription>Todavía no se registró lo que paga el proveedor por este trabajo.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setAbierto(true)}>
            <HandCoins />
            Registrar cobro
          </Button>
        </CardHeader>
        <CardContent />
      </Card>
      {abierto && <DialogoCobro t={t} abierto onAbiertoChange={setAbierto} />}
    </Can>
  )
}

function DialogoCobro({ t, abierto, onAbiertoChange }: { t: TrabajoDetalle; abierto: boolean; onAbiertoChange: (a: boolean) => void }) {
  const registrar = useRegistrarCobro(t.id)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<CobroFormulario>({ resolver: zodResolver(cobroSchema), defaultValues: cobroVacio() })
  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await registrar.mutateAsync(datos)
      toast.success(`Cobro de ${t.codigo} registrado`)
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['montoTotal', 'formaPago', 'cuotas']))
    }
  })
  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Registrar el cobro de {t.codigo}</DialogTitle>
            <DialogDescription>Lo que el proveedor paga por este trabajo. Después se registran sus pagos, con recibo.</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FormProviderCobro form={form} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Registrar cobro
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FormProviderCobro({ form }: { form: UseFormReturn<CobroFormulario> }) {
  return (
    <FormProvider {...(form as unknown as UseFormReturn<FieldValues>)}>
      <CamposCobro />
    </FormProvider>
  )
}
