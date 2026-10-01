import { zodResolver } from '@hookform/resolvers/zod'
import {
  aCentimos,
  anularCotizacionSchema,
  cotizacionSchema,
  deCentimos,
  diaEnLima,
  formatearSoles,
  type CotizacionDatos,
  type CotizacionFormulario,
  type CotizacionResumen,
} from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertCircle, Ban, FileText, Loader2, Plus, Printer, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useFieldArray, useForm, useWatch, type Control } from 'react-hook-form'
import { toast } from 'sonner'
import { Can } from '@/components/can'
import { Requerido } from '@/components/requerido'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Textarea } from '@/components/ui/textarea'
import { formatearFecha, nombreCompleto } from '@/lib/formato'
import { aplicarErroresApi } from '@/lib/formularios'
import { usePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { cotizacionesProspectoQuery, useAnularCotizacion, useCrearCotizacion } from '../api'
import { InsigniaEstadoCotizacion } from './insignias'

/** Cotizaciones emitidas a un prospecto, con su impresión. */
export function CotizacionesProspecto({ prospectoId, abierto, descripcionSugerida }: { prospectoId: string; abierto: boolean; descripcionSugerida: string }) {
  const puedeVer = usePermiso('cotizaciones.ver')
  const { data } = useQuery({ ...cotizacionesProspectoQuery(prospectoId), enabled: puedeVer })
  const [creando, setCreando] = useState(false)
  const [anulando, setAnulando] = useState<CotizacionResumen | null>(null)
  if (!puedeVer) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Cotizaciones</CardTitle>
          <CardDescription>Al emitir una, el prospecto pasa a la etapa de cotizado y se guarda el monto.</CardDescription>
        </div>
        {abierto && (
          <Can permiso="cotizaciones.crear">
            <Button size="sm" onClick={() => setCreando(true)}>
              <Plus />
              Nueva cotización
            </Button>
          </Can>
        )}
      </CardHeader>
      <CardContent>
        {!data ? null : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no se le ha enviado una cotización.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {data.map((c) => (
              <li key={c.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-sm', c.estado === 'anulada' && 'text-muted-foreground')}>
                <span className="font-mono text-xs">{c.numero}</span>
                <span className={cn('font-medium tabular-nums', c.estado === 'anulada' && 'line-through')}>{formatearSoles(c.total)}</span>
                <InsigniaEstadoCotizacion cotizacion={c} />
                <span className="text-muted-foreground">
                  {formatearFecha(c.fecha)} · {nombreCompleto(c.creadoPor)}
                  {c.anulada?.motivo && ` · ${c.anulada.motivo}`}
                </span>
                <span className="ml-auto flex gap-1">
                  <Can permiso="cotizaciones.imprimir">
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/imprimir/cotizacion/$id" params={{ id: c.id }} target="_blank">
                        <Printer />
                        Imprimir
                      </Link>
                    </Button>
                  </Can>
                  {c.estado === 'emitida' && (
                    <Can permiso="cotizaciones.anular">
                      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setAnulando(c)}>
                        <Ban />
                        Anular
                      </Button>
                    </Can>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {creando && <DialogoCotizacion prospectoId={prospectoId} descripcionSugerida={descripcionSugerida} abierto onAbiertoChange={setCreando} />}
      {anulando && <DialogoAnularCotizacion prospectoId={prospectoId} cotizacion={anulando} abierto onAbiertoChange={(v) => !v && setAnulando(null)} />}
    </Card>
  )
}

interface PropsDialogo {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

function Total({ control }: { control: Control<CotizacionFormulario, unknown, CotizacionDatos> }) {
  const items = useWatch({ control, name: 'items' }) ?? []
  const total = items.reduce((s, i) => s + Math.round((Number(i.cantidad) || 0) * aCentimos(Number(i.precio) || 0)), 0)
  return (
    <p className="text-right text-sm">
      Total <span className="ml-2 text-lg font-semibold tabular-nums">{formatearSoles(deCentimos(total))}</span>
    </p>
  )
}

function DialogoCotizacion({ prospectoId, descripcionSugerida, abierto, onAbiertoChange }: PropsDialogo & { prospectoId: string; descripcionSugerida: string }) {
  const crear = useCrearCotizacion(prospectoId)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<CotizacionFormulario, unknown, CotizacionDatos>({
    resolver: zodResolver(cotizacionSchema),
    defaultValues: { fecha: diaEnLima(), validezDias: 15, formaPago: '', observaciones: '', items: [{ descripcion: descripcionSugerida, cantidad: 1, precio: '' as unknown as number }] },
  })
  const items = useFieldArray({ control: form.control, name: 'items' })
  const errores = form.formState.errors

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      const c = await crear.mutateAsync(datos)
      toast.success(`Cotización ${c.numero} emitida`, {
        action: { label: 'Imprimir', onClick: () => window.open(`/imprimir/cotizacion/${c.id}`, '_blank') },
      })
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['fecha', 'validezDias', 'formaPago', 'observaciones', 'items']))
    }
  })

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Nueva cotización</DialogTitle>
            <DialogDescription>Detalla los servicios; el total se calcula solo. Luego podrás imprimirla o guardarla en PDF.</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errores.fecha)}>
              <FieldLabel htmlFor="cot-fecha">
                <span>
                  Fecha <Requerido />
                </span>
              </FieldLabel>
              <Input id="cot-fecha" type="date" {...form.register('fecha')} />
              <FieldError errors={[errores.fecha]} />
            </Field>
            <Field data-invalid={Boolean(errores.validezDias)}>
              <FieldLabel htmlFor="cot-validez">
                <span>
                  Validez <Requerido />
                </span>
              </FieldLabel>
              <InputGroup>
                <InputGroupInput id="cot-validez" type="number" inputMode="numeric" min={1} max={365} {...form.register('validezDias')} />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>días</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldError errors={[errores.validezDias]} />
            </Field>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">
              Ítems <Requerido />
            </legend>
            <div className="hidden grid-cols-[1fr_5rem_8rem_2rem] gap-2 text-xs text-muted-foreground sm:grid">
              <span>Descripción</span>
              <span>Cantidad</span>
              <span>Precio unitario</span>
            </div>
            {items.fields.map((campo, i) => (
              <div key={campo.id} className="grid grid-cols-[1fr_5rem_8rem_2rem] items-start gap-2">
                <Field data-invalid={Boolean(errores.items?.[i]?.descripcion)}>
                  <Input aria-label={`Descripción del ítem ${i + 1}`} placeholder="Descripción" {...form.register(`items.${i}.descripcion`)} />
                  <FieldError errors={[errores.items?.[i]?.descripcion]} />
                </Field>
                <Field data-invalid={Boolean(errores.items?.[i]?.cantidad)}>
                  <Input aria-label={`Cantidad del ítem ${i + 1}`} type="number" inputMode="decimal" min={0} step="any" {...form.register(`items.${i}.cantidad`)} />
                </Field>
                <Field data-invalid={Boolean(errores.items?.[i]?.precio)}>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>S/</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput aria-label={`Precio del ítem ${i + 1}`} type="number" inputMode="decimal" min={0} step="0.01" {...form.register(`items.${i}.precio`)} />
                  </InputGroup>
                </Field>
                <Button type="button" variant="ghost" size="icon" aria-label={`Quitar el ítem ${i + 1}`} disabled={items.fields.length === 1} onClick={() => items.remove(i)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => items.append({ descripcion: '', cantidad: 1, precio: '' as unknown as number })} disabled={items.fields.length >= 30}>
                <Plus />
                Agregar ítem
              </Button>
              <Total control={form.control} />
            </div>
            {errores.items?.root?.message && <p className="text-sm text-destructive">{errores.items.root.message}</p>}
            {errores.items?.message && <p className="text-sm text-destructive">{errores.items.message}</p>}
          </fieldset>

          <Field data-invalid={Boolean(errores.formaPago)}>
            <FieldLabel htmlFor="cot-forma">Forma de pago sugerida</FieldLabel>
            <Input id="cot-forma" placeholder="Por ejemplo: 3 cuotas mensuales; la primera a la firma" {...form.register('formaPago')} />
            <FieldError errors={[errores.formaPago]} />
          </Field>
          <Field data-invalid={Boolean(errores.observaciones)}>
            <FieldLabel htmlFor="cot-obs">Observaciones</FieldLabel>
            <Textarea id="cot-obs" rows={2} {...form.register('observaciones')} />
            <FieldError errors={[errores.observaciones]} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : <FileText />}
              Emitir cotización
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DialogoAnularCotizacion({ prospectoId, cotizacion, abierto, onAbiertoChange }: PropsDialogo & { prospectoId: string; cotizacion: CotizacionResumen }) {
  const anular = useAnularCotizacion(prospectoId)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<{ motivo: string }>({ resolver: zodResolver(anularCotizacionSchema), defaultValues: { motivo: '' } })

  const enviar = form.handleSubmit(async ({ motivo }) => {
    setError(null)
    try {
      await anular.mutateAsync({ id: cotizacion.id, motivo })
      toast.success(`Cotización ${cotizacion.numero} anulada`)
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
            <DialogTitle>Anular cotización {cotizacion.numero}</DialogTitle>
            <DialogDescription>{formatearSoles(cotizacion.total)}. Queda en el historial con su motivo y deja de contar como monto cotizado.</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={Boolean(form.formState.errors.motivo)}>
            <FieldLabel htmlFor="anular-cot-motivo">
              <span>
                Motivo <Requerido />
              </span>
            </FieldLabel>
            <Textarea id="anular-cot-motivo" rows={2} {...form.register('motivo')} />
            <FieldError errors={[form.formState.errors.motivo]} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
              Volver
            </Button>
            <Button type="submit" variant="destructive" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Anular cotización
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
