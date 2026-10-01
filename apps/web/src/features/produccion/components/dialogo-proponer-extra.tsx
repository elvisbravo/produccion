import { zodResolver } from '@hookform/resolvers/zod'
import { proponerExtraSchema, type Paginado, type ProponerExtraDatos, type ProponerExtraFormulario, type TrabajoListadoItem } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { Requerido } from '@/components/requerido'
import { SelectorRemoto } from '@/components/selector-remoto'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { candidatosEquipoQuery } from '@/features/trabajos/api'
import { api } from '@/lib/api'
import { nombreCompleto } from '@/lib/formato'
import { aplicarErroresApi } from '@/lib/formularios'
import { useProponerExtra } from '../api-contingencias'

/** Proponer horas extra (un tramo fuera del horario) o un bono (monto libre) a una persona. */
export function DialogoProponerExtra({ onCerrar }: { onCerrar: () => void }) {
  const { data: personas } = useQuery(candidatosEquipoQuery)
  const proponer = useProponerExtra()
  const [error, setError] = useState<string | null>(null)
  const [etiquetaTrabajo, setEtiquetaTrabajo] = useState<string>()
  const form = useForm<ProponerExtraFormulario, unknown, ProponerExtraDatos>({
    resolver: zodResolver(proponerExtraSchema),
    defaultValues: { usuarioId: '', modalidad: 'horas_extra', trabajoId: '', descripcion: '', fecha: '', horaInicio: '19:00', horaFin: '21:00', monto: '' },
  })
  const e = form.formState.errors
  const modalidad = useWatch({ control: form.control, name: 'modalidad' })

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      const x = await proponer.mutateAsync(datos)
      toast.success(`Propuesta enviada a ${nombreCompleto(x.usuario)}: debe aceptarla`)
      if (x.avisos.length) toast.warning(x.avisos.join(' · '))
      onCerrar()
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['usuarioId', 'modalidad', 'trabajoId', 'descripcion', 'fecha', 'horaInicio', 'horaFin', 'monto']))
    }
  })

  const buscarTrabajos = async (q: string, signal: AbortSignal) => {
    const r = await api<Paginado<TrabajoListadoItem>>(`/trabajos?porPagina=20${q ? `&q=${encodeURIComponent(q)}` : ''}`, { signal })
    return r.datos
      .filter((t) => !['finalizado', 'cancelado'].includes(t.estado))
      .map((t) => ({ id: t.id, nombre: t.codigo, detalle: [nombreCompleto(t.titular), t.tipoTrabajo].filter(Boolean).join(' · ') }))
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Proponer horas extra o bono</DialogTitle>
            <DialogDescription>La persona la acepta o la rechaza; luego la aprueba el jefe de producción o el administrador.</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Controller
            control={form.control}
            name="modalidad"
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={field.onChange} className="grid grid-cols-2 gap-2">
                {[
                  ['horas_extra', 'Horas extra'],
                  ['bono', 'Bono'],
                ].map(([v, t]) => (
                  <Label key={v} htmlFor={`mod-${v}`} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 font-normal has-[[data-state=checked]]:border-primary">
                    <RadioGroupItem value={v} id={`mod-${v}`} />
                    {t}
                  </Label>
                ))}
              </RadioGroup>
            )}
          />
          <Field data-invalid={Boolean(e.usuarioId)}>
            <FieldLabel htmlFor="ext-persona">
              <span>
                Persona <Requerido />
              </span>
            </FieldLabel>
            <Controller
              control={form.control}
              name="usuarioId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="ext-persona" className="w-full" aria-invalid={Boolean(e.usuarioId)}>
                    <SelectValue placeholder={personas ? 'Seleccionar…' : 'Cargando…'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Auxiliares</SelectLabel>
                      {personas?.auxiliares.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {nombreCompleto(u)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Jefes de producción</SelectLabel>
                      {personas?.jefes.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {nombreCompleto(u)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[e.usuarioId]} />
          </Field>
          <Field data-invalid={Boolean(e.trabajoId)}>
            <FieldLabel htmlFor="ext-trabajo">
              <span>
                Trabajo <Requerido />
              </span>
            </FieldLabel>
            <Controller
              control={form.control}
              name="trabajoId"
              render={({ field }) => (
                <SelectorRemoto
                  id="ext-trabajo"
                  clave="trabajos-extra"
                  valor={field.value || undefined}
                  etiqueta={etiquetaTrabajo}
                  onCambio={(o) => {
                    field.onChange(o?.id ?? '')
                    setEtiquetaTrabajo(o?.nombre)
                  }}
                  buscar={buscarTrabajos}
                  placeholder="Buscar por código o cliente…"
                  minimo={0}
                  invalido={Boolean(e.trabajoId)}
                />
              )}
            />
            <FieldError errors={[e.trabajoId]} />
          </Field>
          {modalidad === 'horas_extra' ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field data-invalid={Boolean(e.fecha)}>
                <FieldLabel htmlFor="ext-fecha">Día</FieldLabel>
                <Input id="ext-fecha" type="date" {...form.register('fecha')} />
                <FieldError errors={[e.fecha]} />
              </Field>
              <Field data-invalid={Boolean(e.horaInicio)}>
                <FieldLabel htmlFor="ext-ini">De</FieldLabel>
                <Input id="ext-ini" type="time" step={900} {...form.register('horaInicio')} />
                <FieldError errors={[e.horaInicio]} />
              </Field>
              <Field data-invalid={Boolean(e.horaFin)}>
                <FieldLabel htmlFor="ext-fin">A</FieldLabel>
                <Input id="ext-fin" type="time" step={900} {...form.register('horaFin')} />
                <FieldError errors={[e.horaFin]} />
              </Field>
              <FieldDescription className="sm:col-span-3">
                Fuera de su horario (después de hora o fin de semana). En feriados o su cumpleaños, solo si acepta; nunca en vacaciones, permisos ni descanso médico.
              </FieldDescription>
            </div>
          ) : (
            <Field data-invalid={Boolean(e.monto)}>
              <FieldLabel htmlFor="ext-monto">Monto (S/)</FieldLabel>
              <Input id="ext-monto" type="number" inputMode="decimal" min={1} step={10} className="w-40" {...form.register('monto')} />
              <FieldError errors={[e.monto]} />
            </Field>
          )}
          <Field data-invalid={Boolean(e.descripcion)}>
            <FieldLabel htmlFor="ext-desc">
              <span>
                Qué se hará <Requerido />
              </span>
            </FieldLabel>
            <Textarea id="ext-desc" rows={2} {...form.register('descripcion')} />
            <FieldError errors={[e.descripcion]} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Proponer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
