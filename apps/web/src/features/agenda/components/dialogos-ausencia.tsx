import { zodResolver } from '@hookform/resolvers/zod'
import {
  diaEnLima,
  NOMBRE_TIPO_AUSENCIA,
  registrarAusenciaSchema,
  TIPOS_AUSENCIA,
  TIPOS_AUSENCIA_SOLICITABLES,
  type AusenciaItem,
  type RegistrarAusenciaDatos,
  type RegistrarAusenciaFormulario,
  type TipoAusencia,
} from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Loader2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { Requerido } from '@/components/requerido'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatearFecha, nombreCompleto } from '@/lib/formato'
import { aplicarErroresApi } from '@/lib/formularios'
import { personasAusenciaQuery, useRegistrarAusencia, useResolverAusencia, useSolicitarAusencia } from '../api'
import { describirAusencia } from './ausencias-formato'

interface PropsDialogo {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

/** Avisa si la ausencia cae sobre actividades ya programadas. */
function avisarAfectadas(a: AusenciaItem) {
  const n = a.tareasAfectadas.length
  if (n > 0) toast.warning(`${nombreCompleto(a.usuario)} tiene ${n} ${n === 1 ? 'actividad programada' : 'actividades programadas'} en esas fechas: hay que reprogramarlas o reasignarlas.`)
}

/**
 * Solicitar (la propia persona) o registrar (producción o el administrador, ya aprobada).
 * Al registrar, `tiposPermitidos` limita los tipos: producción solo registra descansos médicos.
 */
export function DialogoAusencia({
  modo,
  tiposPermitidos,
  abierto,
  onAbiertoChange,
}: PropsDialogo & { modo: 'solicitar' | 'registrar'; tiposPermitidos?: readonly TipoAusencia[] }) {
  const tipos = tiposPermitidos ?? (modo === 'solicitar' ? TIPOS_AUSENCIA_SOLICITABLES : TIPOS_AUSENCIA)
  const solicitar = useSolicitarAusencia()
  const registrar = useRegistrarAusencia()
  const { data: personas } = useQuery({ ...personasAusenciaQuery, enabled: abierto && modo === 'registrar' })
  const [error, setError] = useState<string | null>(null)
  const hoy = diaEnLima()

  // En "solicitar" el usuarioId no se envía: se completa con un valor que pase la validación y se descarta.
  const form = useForm<RegistrarAusenciaFormulario, unknown, RegistrarAusenciaDatos>({
    resolver: zodResolver(registrarAusenciaSchema),
    defaultValues: {
      usuarioId: modo === 'solicitar' ? '00000000-0000-4000-8000-000000000000' : '',
      tipo: tipos[0],
      fechaDesde: hoy,
      fechaHasta: hoy,
      horaDesde: '',
      horaHasta: '',
      motivo: '',
    },
  })
  const e = form.formState.errors
  const [tipo, fechaDesde, horaDesde] = useWatch({ control: form.control, name: ['tipo', 'fechaDesde', 'horaDesde'] })
  const [porHoras, setPorHoras] = useState(false)

  const cambiarPorHoras = (v: boolean) => {
    setPorHoras(v)
    if (v) {
      form.setValue('fechaHasta', fechaDesde)
      form.setValue('horaDesde', horaDesde || '15:00')
      form.setValue('horaHasta', '17:00')
    } else {
      form.setValue('horaDesde', '')
      form.setValue('horaHasta', '')
    }
  }

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      const { usuarioId, ...resto } = datos
      const a = modo === 'solicitar' ? await solicitar.mutateAsync(resto) : await registrar.mutateAsync({ ...resto, usuarioId })
      toast.success(modo === 'solicitar' ? 'Solicitud enviada: queda por aprobar' : `${NOMBRE_TIPO_AUSENCIA[a.tipo]} registrado para ${nombreCompleto(a.usuario)}`)
      avisarAfectadas(a)
      form.reset()
      setPorHoras(false)
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['usuarioId', 'tipo', 'fechaDesde', 'fechaHasta', 'horaDesde', 'horaHasta', 'motivo']))
    }
  })

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{modo === 'solicitar' ? 'Solicitar ausencia' : 'Registrar ausencia'}</DialogTitle>
            <DialogDescription>
              {modo === 'solicitar'
                ? 'El administrador la aprueba. Mientras tanto, tu agenda sigue disponible.'
                : 'Queda aprobada y bloquea la agenda de la persona en esas fechas.'}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {modo === 'registrar' && (
            <Field data-invalid={Boolean(e.usuarioId)}>
              <FieldLabel htmlFor="aus-persona">
                <span>
                  Persona <Requerido />
                </span>
              </FieldLabel>
              <Controller
                control={form.control}
                name="usuarioId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="aus-persona" className="w-full" aria-invalid={Boolean(e.usuarioId)}>
                      <SelectValue placeholder={personas ? 'Seleccionar…' : 'Cargando…'} />
                    </SelectTrigger>
                    <SelectContent>
                      {personas?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {nombreCompleto(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[e.usuarioId]} />
            </Field>
          )}

          <Field data-invalid={Boolean(e.tipo)}>
            <FieldLabel htmlFor="aus-tipo">
              <span>
                Tipo <Requerido />
              </span>
            </FieldLabel>
            <Controller
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v)
                    if (v !== 'permiso') cambiarPorHoras(false)
                  }}
                >
                  <SelectTrigger id="aus-tipo" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tipos.map((t) => (
                      <SelectItem key={t} value={t}>
                        {NOMBRE_TIPO_AUSENCIA[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[e.tipo]} />
          </Field>

          {tipo === 'permiso' && (
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox checked={porHoras} onCheckedChange={(v) => cambiarPorHoras(v === true)} />
              Solo unas horas de un día
            </Label>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(e.fechaDesde)}>
              <FieldLabel htmlFor="aus-desde">
                <span>
                  {porHoras ? 'Día' : 'Desde'} <Requerido />
                </span>
              </FieldLabel>
              <Input
                id="aus-desde"
                type="date"
                min={modo === 'solicitar' ? hoy : undefined}
                {...form.register('fechaDesde', {
                  onChange: (ev: React.ChangeEvent<HTMLInputElement>) => {
                    const valor = ev.target.value
                    if (porHoras || form.getValues('fechaHasta') < valor) form.setValue('fechaHasta', valor)
                  },
                })}
              />
              <FieldError errors={[e.fechaDesde]} />
            </Field>
            {!porHoras && (
              <Field data-invalid={Boolean(e.fechaHasta)}>
                <FieldLabel htmlFor="aus-hasta">
                  <span>
                    Hasta (inclusive) <Requerido />
                  </span>
                </FieldLabel>
                <Input id="aus-hasta" type="date" min={fechaDesde} {...form.register('fechaHasta')} />
                <FieldError errors={[e.fechaHasta]} />
              </Field>
            )}
            {porHoras && (
              <>
                <Field data-invalid={Boolean(e.horaDesde)}>
                  <FieldLabel htmlFor="aus-hora-desde">De</FieldLabel>
                  <Input id="aus-hora-desde" type="time" step={900} {...form.register('horaDesde')} />
                  <FieldError errors={[e.horaDesde]} />
                </Field>
                <Field data-invalid={Boolean(e.horaHasta)}>
                  <FieldLabel htmlFor="aus-hora-hasta">A</FieldLabel>
                  <Input id="aus-hora-hasta" type="time" step={900} {...form.register('horaHasta')} />
                  <FieldError errors={[e.horaHasta]} />
                </Field>
              </>
            )}
          </div>

          <Field data-invalid={Boolean(e.motivo)}>
            <FieldLabel htmlFor="aus-motivo">Motivo</FieldLabel>
            <Textarea id="aus-motivo" rows={2} {...form.register('motivo')} />
            {tipo === 'descanso_medico' && <FieldDescription>Guarda el certificado médico; más adelante se podrá adjuntar aquí.</FieldDescription>}
            <FieldError errors={[e.motivo]} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              {modo === 'solicitar' ? 'Enviar solicitud' : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const TEXTOS = {
  aprobar: { titulo: 'Aprobar', boton: 'Aprobar', etiqueta: 'Comentario (opcional)', exito: 'Ausencia aprobada' },
  rechazar: { titulo: 'Rechazar', boton: 'Rechazar', etiqueta: 'Motivo del rechazo', exito: 'Solicitud rechazada' },
  anular: { titulo: 'Anular', boton: 'Anular', etiqueta: 'Motivo (opcional)', exito: 'Ausencia anulada' },
} as const

export function DialogoResolverAusencia({
  ausencia: a,
  accion,
  abierto,
  onAbiertoChange,
}: PropsDialogo & { ausencia: AusenciaItem; accion: 'aprobar' | 'rechazar' | 'anular' }) {
  const resolver = useResolverAusencia()
  const [observacion, setObservacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const t = TEXTOS[accion]
  const obligatorio = accion === 'rechazar'

  const enviar = async () => {
    setError(null)
    try {
      const r = await resolver.mutateAsync({ id: a.id, accion, observacion: observacion.trim() || undefined })
      toast.success(t.exito)
      if (accion === 'aprobar') avisarAfectadas(r)
      setObservacion('')
      onAbiertoChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t.titulo} {NOMBRE_TIPO_AUSENCIA[a.tipo].toLowerCase()} de {nombreCompleto(a.usuario)}
          </DialogTitle>
          <DialogDescription>
            {describirAusencia(a)}
            {a.motivo && ` · ${a.motivo}`}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {accion === 'aprobar' && a.tareasAfectadas.length > 0 && (
          <Alert>
            <TriangleAlert />
            <AlertTitle>Tiene actividades programadas en esas fechas</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {a.tareasAfectadas.map((x) => (
                  <li key={x.id}>
                    {x.actividad} · {formatearFecha(x.fecha)}
                    {x.hora && `, ${x.hora}`}
                  </li>
                ))}
              </ul>
              Al aprobar, habrá que reprogramarlas o reasignarlas.
            </AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="aus-observacion">{t.etiqueta}</FieldLabel>
          <Textarea id="aus-observacion" rows={2} value={observacion} onChange={(ev) => setObservacion(ev.target.value)} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
            Volver
          </Button>
          <Button
            type="button"
            variant={accion === 'aprobar' ? 'default' : 'destructive'}
            disabled={resolver.isPending || (obligatorio && observacion.trim().length === 0)}
            onClick={() => void enviar()}
          >
            {resolver.isPending && <Loader2 className="animate-spin" />}
            {t.boton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
