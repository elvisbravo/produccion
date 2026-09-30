import { zodResolver } from '@hookform/resolvers/zod'
import {
  anularPagoSchema,
  armarEquipoSchema,
  diaEnLima,
  formatearSoles,
  pagoSchema,
  type ArmarEquipoDatos,
  type ArmarEquipoFormulario,
  type PagoDatos,
  type PagoDetalle,
  type PagoFormulario,
  type TrabajoDetalle,
} from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form'
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
import { Textarea } from '@/components/ui/textarea'
import { nombreCompleto } from '@/lib/formato'
import { aplicarErroresApi } from '@/lib/formularios'
import { candidatosEquipoQuery, useAnularPago, useArmarEquipo, useRegistrarPago } from '../api'
import { CamposPago } from './formulario-conversion'

interface PropsDialogo {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

export function DialogoEquipo({ trabajo, abierto, onAbiertoChange }: PropsDialogo & { trabajo: TrabajoDetalle }) {
  const { data: candidatos } = useQuery({ ...candidatosEquipoQuery, enabled: abierto })
  const armar = useArmarEquipo(trabajo.id)
  const [error, setError] = useState<string | null>(null)
  const actual = (f: string) => trabajo.equipo.filter((m) => m.funcion === f).map((m) => m.usuario.id)
  const hayEquipo = trabajo.equipo.length > 0

  const form = useForm<ArmarEquipoFormulario, unknown, ArmarEquipoDatos>({
    resolver: zodResolver(armarEquipoSchema),
    defaultValues: {
      // Sin equipo todavía, se sugiere quien dio el enfoque (si es auxiliar).
      auxiliarPrincipalId: actual('auxiliar_principal')[0] ?? (trabajo.dioElEnfoque?.rol === 'AUXILIAR' ? trabajo.dioElEnfoque.usuario.id : ''),
      jefeResponsableId: actual('jefe_responsable')[0] ?? (trabajo.dioElEnfoque?.rol === 'JEFE_PROD' ? trabajo.dioElEnfoque.usuario.id : ''),
      auxiliaresApoyo: actual('auxiliar_apoyo'),
      motivo: '',
    },
  })
  const e = form.formState.errors
  const principal = useWatch({ control: form.control, name: 'auxiliarPrincipalId' })

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await armar.mutateAsync(datos)
      toast.success(hayEquipo ? 'Equipo actualizado' : 'Equipo armado')
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['auxiliarPrincipalId', 'auxiliaresApoyo', 'jefeResponsableId', 'motivo']))
    }
  })

  const selectorUsuario = (nombre: 'auxiliarPrincipalId' | 'jefeResponsableId', lista: { id: string; nombres: string; apellidos: string }[], idCampo: string) => (
    <Controller
      control={form.control}
      name={nombre}
      render={({ field }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger id={idCampo} className="w-full" aria-invalid={Boolean(e[nombre])}>
            <SelectValue placeholder="Seleccionar…" />
          </SelectTrigger>
          <SelectContent>
            {lista.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {nombreCompleto(u)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  )

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{hayEquipo ? 'Cambiar equipo' : 'Armar equipo'}</DialogTitle>
            <DialogDescription>
              {trabajo.codigo} · Los cambios quedan en el historial. La disponibilidad de cada persona se verá con la agenda de producción.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!candidatos ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <>
              <Field data-invalid={Boolean(e.auxiliarPrincipalId)}>
                <FieldLabel htmlFor="eq-principal">
                  <span>
                    Auxiliar principal <Requerido />
                  </span>
                </FieldLabel>
                {selectorUsuario('auxiliarPrincipalId', candidatos.auxiliares, 'eq-principal')}
                {!hayEquipo && trabajo.dioElEnfoque && (
                  <FieldDescription>Dio el enfoque: {nombreCompleto(trabajo.dioElEnfoque.usuario)}.</FieldDescription>
                )}
                <FieldError errors={[e.auxiliarPrincipalId]} />
              </Field>
              <Field data-invalid={Boolean(e.auxiliaresApoyo)}>
                <FieldLabel>Auxiliares de apoyo</FieldLabel>
                <Controller
                  control={form.control}
                  name="auxiliaresApoyo"
                  render={({ field }) => {
                    const valor = field.value ?? []
                    return (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {candidatos.auxiliares
                          .filter((u) => u.id !== principal)
                          .map((u) => (
                            <Label key={u.id} className="flex items-center gap-2 font-normal">
                              <Checkbox
                                checked={valor.includes(u.id)}
                                onCheckedChange={(v) => field.onChange(v === true ? [...valor, u.id] : valor.filter((x) => x !== u.id))}
                              />
                              {nombreCompleto(u)}
                            </Label>
                          ))}
                      </div>
                    )
                  }}
                />
                <FieldError errors={[e.auxiliaresApoyo as { message?: string } | undefined]} />
              </Field>
              <Field data-invalid={Boolean(e.jefeResponsableId)}>
                <FieldLabel htmlFor="eq-jefe">
                  <span>
                    Jefe responsable <Requerido />
                  </span>
                </FieldLabel>
                {selectorUsuario('jefeResponsableId', candidatos.jefes, 'eq-jefe')}
                <FieldDescription>Revisa los entregables de este trabajo.</FieldDescription>
                <FieldError errors={[e.jefeResponsableId]} />
              </Field>
              {hayEquipo && (
                <Field>
                  <FieldLabel htmlFor="eq-motivo">Motivo del cambio</FieldLabel>
                  <Input id="eq-motivo" placeholder="Ej.: descanso médico, carga de trabajo…" {...form.register('motivo')} />
                </Field>
              )}
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!candidatos || form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Guardar equipo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DialogoPago({ contratoId, saldo, abierto, onAbiertoChange }: PropsDialogo & { contratoId: string; saldo: number }) {
  const registrar = useRegistrarPago(contratoId)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<PagoFormulario, unknown, PagoDatos>({
    resolver: zodResolver(pagoSchema),
    defaultValues: { monto: '' as unknown as number, fecha: diaEnLima(), metodo: 'yape', numeroOperacion: '', observaciones: '' },
  })

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      const trabajo = await registrar.mutateAsync(datos)
      toast.success(`Pago registrado · recibo ${trabajo.contrato?.pagos?.[0]?.numeroRecibo ?? ''}`)
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['monto', 'fecha', 'metodo', 'numeroOperacion', 'observaciones']))
    }
  })

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <FormProvider {...form}>
          {/* El aviso general se quita apenas se corrige algún campo. */}
          <form onSubmit={enviar} onChange={() => error && setError(null)} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Registrar pago</DialogTitle>
              <DialogDescription>Saldo pendiente: {formatearSoles(saldo)}. Se aplica a las cuotas más antiguas primero.</DialogDescription>
            </DialogHeader>
            {error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <CamposPago />
            </div>
            <Field>
              <FieldLabel htmlFor="pago-obs">Observaciones</FieldLabel>
              <Textarea id="pago-obs" rows={2} {...form.register('observaciones')} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                Registrar pago
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}

export function DialogoAnularPago({ pago, abierto, onAbiertoChange }: PropsDialogo & { pago: PagoDetalle }) {
  const anular = useAnularPago()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<{ motivo: string }>({ resolver: zodResolver(anularPagoSchema), defaultValues: { motivo: '' } })

  const enviar = form.handleSubmit(async ({ motivo }) => {
    setError(null)
    try {
      await anular.mutateAsync({ pagoId: pago.id, motivo })
      toast.success(`Pago ${pago.numeroRecibo} anulado`)
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
            <DialogTitle>Anular pago {pago.numeroRecibo}</DialogTitle>
            <DialogDescription>
              {formatearSoles(pago.monto)} del {pago.fecha}. Sale del saldo pagado, pero queda en el historial con su motivo.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={Boolean(form.formState.errors.motivo)}>
            <FieldLabel htmlFor="anular-motivo">
              <span>
                Motivo <Requerido />
              </span>
            </FieldLabel>
            <Textarea id="anular-motivo" rows={2} {...form.register('motivo')} />
            <FieldError errors={[form.formState.errors.motivo]} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
              Volver
            </Button>
            <Button type="submit" variant="destructive" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Anular pago
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
