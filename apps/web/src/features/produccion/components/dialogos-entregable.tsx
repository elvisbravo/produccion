import { zodResolver } from '@hookform/resolvers/zod'
import {
  CANALES_ENTREGA,
  entregableSchema,
  entregarSchema,
  NOMBRE_CANAL_ENTREGA,
  NOMBRE_FUNCION_EQUIPO,
  respuestaClienteSchema,
  revisarEntregableSchema,
  tareaEntregableSchema,
  type EntregableDatos,
  type EntregableFormulario,
  type EntregableItem,
  type EntregarDatos,
  type EntregarFormulario,
  type RespuestaClienteDatos,
  type RespuestaClienteFormulario,
  type RevisarEntregableDatos,
  type RevisarEntregableFormulario,
  type TareaEntregableDatos,
  type TareaEntregableFormulario,
  type TrabajoDetalle,
} from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { Requerido } from '@/components/requerido'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { actividadesQuery } from '@/features/tareas/api'
import { nombreCompleto } from '@/lib/formato'
import { aplicarErroresApi } from '@/lib/formularios'
import { usePermiso } from '@/lib/permisos'
import { useAgregarTarea, useCrearEntregable, useEditarEntregable, useEntregar, useRespuestaCliente, useRevisar } from '../api'

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

function Pie({ enviando, texto, onCancelar, destructivo }: { enviando: boolean; texto: string; onCancelar: () => void; destructivo?: boolean }) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancelar}>
        Cancelar
      </Button>
      <Button type="submit" variant={destructivo ? 'destructive' : 'default'} disabled={enviando}>
        {enviando && <Loader2 className="animate-spin" />}
        {texto}
      </Button>
    </DialogFooter>
  )
}

/** Campo de horas que guarda minutos. */
function CampoHoras({ id, value, onChange, invalido }: { id: string; value: unknown; onChange: (minutos: number | '') => void; invalido?: boolean }) {
  const minutos = typeof value === 'number' ? value : Number(value) || 0
  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0.25}
        step={0.25}
        className="w-28"
        aria-invalid={invalido}
        value={value === '' || value === undefined ? '' : minutos / 60}
        onChange={(ev) => onChange(ev.target.value === '' ? '' : Math.round(Number(ev.target.value) * 60))}
      />
      <span className="text-sm text-muted-foreground">horas</span>
    </div>
  )
}

export function DialogoEntregable({ trabajo, entregable, abierto, onAbiertoChange }: PropsDialogo & { trabajo: TrabajoDetalle; entregable: EntregableItem | null }) {
  const crear = useCrearEntregable(trabajo.id)
  const editar = useEditarEntregable(entregable?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const form = useForm<EntregableFormulario, unknown, EntregableDatos>({
    resolver: zodResolver(entregableSchema),
    defaultValues: entregable
      ? { nombre: entregable.nombre, fechaLimite: entregable.fechaLimite, esFinal: entregable.esFinal }
      : { nombre: '', fechaLimite: trabajo.fechaLimite, esFinal: false },
  })
  const e = form.formState.errors

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await (entregable ? editar : crear).mutateAsync(datos)
      toast.success(entregable ? 'Entregable actualizado' : 'Entregable agregado')
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['nombre', 'fechaLimite', 'esFinal']))
    }
  })

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{entregable ? 'Editar entregable' : 'Nuevo entregable'}</DialogTitle>
            <DialogDescription>
              {trabajo.codigo} · plazo del trabajo hasta el {trabajo.fechaLimite}
            </DialogDescription>
          </DialogHeader>
          <AvisoError error={error} />
          <Field data-invalid={Boolean(e.nombre)}>
            <FieldLabel htmlFor="ent-nombre">
              <span>
                Nombre <Requerido />
              </span>
            </FieldLabel>
            <Input id="ent-nombre" placeholder="Ej.: Capítulo III" {...form.register('nombre')} />
            <FieldError errors={[e.nombre]} />
          </Field>
          <Field data-invalid={Boolean(e.fechaLimite)}>
            <FieldLabel htmlFor="ent-fecha">
              <span>
                Fecha límite <Requerido />
              </span>
            </FieldLabel>
            <Input id="ent-fecha" type="date" min={trabajo.fechaInicio} max={trabajo.fechaLimite} {...form.register('fechaLimite')} />
            <FieldError errors={[e.fechaLimite]} />
          </Field>
          <Controller
            control={form.control}
            name="esFinal"
            render={({ field }) => (
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                Es el entregable final (al cerrarlo, el trabajo termina)
              </Label>
            )}
          />
          <Pie enviando={form.formState.isSubmitting} texto="Guardar" onCancelar={() => onAbiertoChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

const AUTOMATICO = 'automatico'

export function DialogoTareaEntregable({ trabajo, entregable, abierto, onAbiertoChange }: PropsDialogo & { trabajo: TrabajoDetalle; entregable: EntregableItem }) {
  const { data: actividades } = useQuery({ ...actividadesQuery('cliente'), enabled: abierto })
  const agregar = useAgregarTarea(entregable.id)
  const [error, setError] = useState<string | null>(null)
  const opciones = actividades?.filter((a) => !a.requiereHoraFija && a.aplicaA !== 'prospecto' && a.tipo.comportamiento !== 'revision') ?? []
  const form = useForm<TareaEntregableFormulario, unknown, TareaEntregableDatos>({
    resolver: zodResolver(tareaEntregableSchema),
    defaultValues: { actividadId: '', titulo: '', minutosEstimados: 240, usuarioId: '', noAntesDe: '' },
  })
  const e = form.formState.errors

  const elegirActividad = (id: string) => {
    form.setValue('actividadId', id)
    const a = opciones.find((x) => x.id === id)
    if (a) {
      form.setValue('minutosEstimados', a.minutosEstimados)
      if (!form.getValues('titulo')) form.setValue('titulo', `${a.nombre}: ${entregable.nombre}`)
    }
  }

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await agregar.mutateAsync(datos)
      toast.success('Tarea agregada a la cola')
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['actividadId', 'titulo', 'minutosEstimados', 'usuarioId', 'noAntesDe']))
    }
  })

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Nueva tarea</DialogTitle>
            <DialogDescription>
              {entregable.nombre}. Entra al final de la cola de la persona y el sistema calcula cuándo empieza y termina.
            </DialogDescription>
          </DialogHeader>
          <AvisoError error={error} />
          <Field data-invalid={Boolean(e.actividadId)}>
            <FieldLabel htmlFor="tar-actividad">
              <span>
                Actividad <Requerido />
              </span>
            </FieldLabel>
            <Controller
              control={form.control}
              name="actividadId"
              render={({ field }) => (
                <Select value={field.value as string} onValueChange={elegirActividad}>
                  <SelectTrigger id="tar-actividad" className="w-full" aria-invalid={Boolean(e.actividadId)}>
                    <SelectValue placeholder={actividades ? 'Seleccionar…' : 'Cargando…'} />
                  </SelectTrigger>
                  <SelectContent>
                    {opciones.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="size-2 rounded-full" style={{ backgroundColor: a.tipo.color }} aria-hidden="true" />
                        {a.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[e.actividadId]} />
          </Field>
          <Field data-invalid={Boolean(e.titulo)}>
            <FieldLabel htmlFor="tar-titulo">
              <span>
                Descripción <Requerido />
              </span>
            </FieldLabel>
            <Input id="tar-titulo" placeholder="Ej.: Redacción del marco teórico" {...form.register('titulo')} />
            <FieldError errors={[e.titulo]} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(e.minutosEstimados)}>
              <FieldLabel htmlFor="tar-horas">Tiempo estimado</FieldLabel>
              <Controller
                control={form.control}
                name="minutosEstimados"
                render={({ field }) => <CampoHoras id="tar-horas" value={field.value} onChange={field.onChange} invalido={Boolean(e.minutosEstimados)} />}
              />
              <FieldError errors={[e.minutosEstimados]} />
            </Field>
            <Field data-invalid={Boolean(e.noAntesDe)}>
              <FieldLabel htmlFor="tar-desde">No empezar antes del</FieldLabel>
              <Input id="tar-desde" type="date" {...form.register('noAntesDe')} />
              <FieldError errors={[e.noAntesDe]} />
            </Field>
          </div>
          <Field data-invalid={Boolean(e.usuarioId)}>
            <FieldLabel htmlFor="tar-responsable">Responsable</FieldLabel>
            <Controller
              control={form.control}
              name="usuarioId"
              render={({ field }) => (
                <Select value={(field.value as string) || AUTOMATICO} onValueChange={(v) => field.onChange(v === AUTOMATICO ? '' : v)}>
                  <SelectTrigger id="tar-responsable" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTOMATICO}>Auxiliar principal del trabajo</SelectItem>
                    {trabajo.equipo.map((m) => (
                      <SelectItem key={m.id} value={m.usuario.id}>
                        {nombreCompleto(m.usuario)} ({NOMBRE_FUNCION_EQUIPO[m.funcion].toLowerCase()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[e.usuarioId]} />
          </Field>
          <Pie enviando={form.formState.isSubmitting} texto="Agregar" onCancelar={() => onAbiertoChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DialogoRevisar({ entregable, abierto, onAbiertoChange }: PropsDialogo & { entregable: EntregableItem }) {
  const revisar = useRevisar(entregable.id)
  const puedeAprobar = usePermiso('entregables.aprobar')
  const puedeObservar = usePermiso('entregables.observar')
  const [error, setError] = useState<string | null>(null)
  const form = useForm<RevisarEntregableFormulario, unknown, RevisarEntregableDatos>({
    resolver: zodResolver(revisarEntregableSchema),
    defaultValues: { resultado: puedeAprobar ? 'aprobado' : 'observado', observaciones: '', similitud: '', ia: '', minutosCorreccion: 120 },
  })
  const e = form.formState.errors
  const resultado = useWatch({ control: form.control, name: 'resultado' })

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await revisar.mutateAsync(datos)
      toast.success(datos.resultado === 'aprobado' ? `${entregable.nombre} aprobado` : 'Observado: la corrección quedó primera en la cola del auxiliar')
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['resultado', 'observaciones', 'similitud', 'ia', 'minutosCorreccion']))
    }
  })

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Revisar {entregable.nombre}</DialogTitle>
            <DialogDescription>Revisión interna antes de enviarlo al cliente.</DialogDescription>
          </DialogHeader>
          <AvisoError error={error} />
          <Controller
            control={form.control}
            name="resultado"
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={field.onChange} className="grid grid-cols-2 gap-2">
                {(['aprobado', 'observado'] as const).map((r) => (
                  <Label
                    key={r}
                    htmlFor={`rev-${r}`}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 font-normal has-[[data-state=checked]]:border-primary has-[[data-disabled]]:opacity-50"
                  >
                    <RadioGroupItem value={r} id={`rev-${r}`} disabled={r === 'aprobado' ? !puedeAprobar : !puedeObservar} />
                    {r === 'aprobado' ? 'Aprobar' : 'Observar'}
                  </Label>
                ))}
              </RadioGroup>
            )}
          />
          <Field data-invalid={Boolean(e.observaciones)}>
            <FieldLabel htmlFor="rev-obs">
              {resultado === 'observado' ? (
                <span>
                  Observaciones <Requerido />
                </span>
              ) : (
                'Comentario (opcional)'
              )}
            </FieldLabel>
            <Textarea id="rev-obs" rows={4} placeholder={resultado === 'observado' ? 'Qué hay que corregir…' : undefined} {...form.register('observaciones')} />
            {resultado === 'observado' && <FieldDescription>El auxiliar las verá en su tarea de corrección.</FieldDescription>}
            <FieldError errors={[e.observaciones]} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field data-invalid={Boolean(e.similitud)}>
              <FieldLabel htmlFor="rev-sim">% similitud</FieldLabel>
              <Input id="rev-sim" type="number" inputMode="decimal" min={0} max={100} step={0.1} {...form.register('similitud')} />
              <FieldError errors={[e.similitud]} />
            </Field>
            <Field data-invalid={Boolean(e.ia)}>
              <FieldLabel htmlFor="rev-ia">% IA</FieldLabel>
              <Input id="rev-ia" type="number" inputMode="decimal" min={0} max={100} step={0.1} {...form.register('ia')} />
              <FieldError errors={[e.ia]} />
            </Field>
            {resultado === 'observado' && (
              <Field>
                <FieldLabel htmlFor="rev-horas">Corrección</FieldLabel>
                <Controller
                  control={form.control}
                  name="minutosCorreccion"
                  render={({ field }) => <CampoHoras id="rev-horas" value={field.value} onChange={field.onChange} />}
                />
              </Field>
            )}
          </div>
          <Pie enviando={form.formState.isSubmitting} texto={resultado === 'aprobado' ? 'Aprobar' : 'Observar'} onCancelar={() => onAbiertoChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DialogoEntregar({ entregable, trabajo, abierto, onAbiertoChange }: PropsDialogo & { entregable: EntregableItem; trabajo: TrabajoDetalle }) {
  const entregar = useEntregar(entregable.id)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<EntregarFormulario, unknown, EntregarDatos>({ resolver: zodResolver(entregarSchema), defaultValues: { canal: 'whatsapp', notas: '' } })

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await entregar.mutateAsync(datos)
      toast.success(`${entregable.nombre} entregado al cliente`)
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['canal', 'notas']))
    }
  })

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Registrar entrega de {entregable.nombre}</DialogTitle>
            <DialogDescription>
              Para {trabajo.integrantes.map((i) => nombreCompleto(i) ?? i.celular).join(', ')}. Luego registra si el cliente quedó conforme.
            </DialogDescription>
          </DialogHeader>
          <AvisoError error={error} />
          <Field>
            <FieldLabel htmlFor="entr-canal">Canal</FieldLabel>
            <Controller
              control={form.control}
              name="canal"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="entr-canal" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CANALES_ENTREGA.map((c) => (
                      <SelectItem key={c} value={c}>
                        {NOMBRE_CANAL_ENTREGA[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="entr-notas">Notas</FieldLabel>
            <Textarea id="entr-notas" rows={2} {...form.register('notas')} />
          </Field>
          <Pie enviando={form.formState.isSubmitting} texto="Registrar entrega" onCancelar={() => onAbiertoChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DialogoRespuestaCliente({ entregable, abierto, onAbiertoChange }: PropsDialogo & { entregable: EntregableItem }) {
  const responder = useRespuestaCliente(entregable.id)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<RespuestaClienteFormulario, unknown, RespuestaClienteDatos>({
    resolver: zodResolver(respuestaClienteSchema),
    defaultValues: { conforme: true, observaciones: '', minutosCorreccion: 120 },
  })
  const conforme = useWatch({ control: form.control, name: 'conforme' })

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await responder.mutateAsync(datos)
      toast.success(datos.conforme ? `${entregable.nombre} cerrado` : 'Observaciones registradas: la corrección quedó primera en la cola del auxiliar')
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['conforme', 'observaciones', 'minutosCorreccion']))
    }
  })

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Respuesta del cliente</DialogTitle>
            <DialogDescription>{entregable.nombre}</DialogDescription>
          </DialogHeader>
          <AvisoError error={error} />
          <Controller
            control={form.control}
            name="conforme"
            render={({ field }) => (
              <RadioGroup value={field.value ? 'si' : 'no'} onValueChange={(v) => field.onChange(v === 'si')} className="grid grid-cols-2 gap-2">
                {[
                  ['si', 'Conforme'],
                  ['no', 'Tiene observaciones'],
                ].map(([v, texto]) => (
                  <Label
                    key={v}
                    htmlFor={`resp-${v}`}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 font-normal has-[[data-state=checked]]:border-primary"
                  >
                    <RadioGroupItem value={v} id={`resp-${v}`} />
                    {texto}
                  </Label>
                ))}
              </RadioGroup>
            )}
          />
          {!conforme && (
            <>
              <Field data-invalid={Boolean(form.formState.errors.observaciones)}>
                <FieldLabel htmlFor="resp-obs">
                  <span>
                    Observaciones del cliente <Requerido />
                  </span>
                </FieldLabel>
                <Textarea id="resp-obs" rows={4} {...form.register('observaciones')} />
                <FieldError errors={[form.formState.errors.observaciones]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="resp-horas">Tiempo estimado de la corrección</FieldLabel>
                <Controller
                  control={form.control}
                  name="minutosCorreccion"
                  render={({ field }) => <CampoHoras id="resp-horas" value={field.value} onChange={field.onChange} />}
                />
              </Field>
            </>
          )}
          <Pie enviando={form.formState.isSubmitting} texto={conforme ? 'Cerrar entregable' : 'Registrar observaciones'} onCancelar={() => onAbiertoChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  )
}
