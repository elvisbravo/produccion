import { diaEnLima, editarTrabajoSchema, reprogramarTrabajoSchema, type EditarTrabajoDatos, type EditarTrabajoFormulario, type ReprogramarTrabajoDatos, type ReprogramarTrabajoFormulario, type TrabajoDetalle } from '@grupoes/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSuspenseQuery } from '@tanstack/react-query'
import { AlertCircle, CalendarClock, Loader2, Pencil } from 'lucide-react'
import { Suspense, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Can } from '@/components/can'
import { Requerido } from '@/components/requerido'
import { SelectorRemoto } from '@/components/selector-remoto'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { buscarCatalogo, catalogosProspectoQuery, crearEnCatalogo } from '@/features/prospectos/api'
import { formatearFecha } from '@/lib/formato'
import { aplicarErroresApi } from '@/lib/formularios'
import { useEditarTrabajo, useReprogramarTrabajo } from '../api'

/** Botón de la ficha: mover la fecha de entrega del trabajo con su motivo. */
export function BotonReprogramar({ t }: { t: TrabajoDetalle }) {
  const [abierto, setAbierto] = useState(false)
  if (['finalizado', 'cancelado'].includes(t.estado)) return null
  return (
    <Can permiso="trabajos.reprogramar">
      <Button variant="outline" size="sm" onClick={() => setAbierto(true)} disabled={Boolean(t.fechasFijas)} title={t.fechasFijas ? 'Las fechas son inamovibles: libéralas primero' : undefined}>
        <CalendarClock />
        Reprogramar entrega
      </Button>
      {abierto && <DialogoReprogramar t={t} abierto onAbiertoChange={setAbierto} />}
    </Can>
  )
}

export function DialogoReprogramar({ t, abierto, onAbiertoChange }: { t: TrabajoDetalle; abierto: boolean; onAbiertoChange: (a: boolean) => void }) {
  const reprogramar = useReprogramarTrabajo(t.id)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<ReprogramarTrabajoFormulario, unknown, ReprogramarTrabajoDatos>({ resolver: zodResolver(reprogramarTrabajoSchema), defaultValues: { fechaLimite: '', motivo: '' } })
  const e = form.formState.errors
  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await reprogramar.mutateAsync(datos)
      toast.success(`Entrega de ${t.codigo} reprogramada`)
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['fechaLimite', 'motivo']))
    }
  })
  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Reprogramar la entrega de {t.codigo}</DialogTitle>
            <DialogDescription>
              Hoy vence el {formatearFecha(t.fechaLimite)}. La entrega final se mueve con el trabajo y los entregables que quedarían después de la nueva fecha se ajustan. Queda en el historial y se avisa al equipo.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={Boolean(e.fechaLimite)}>
            <FieldLabel htmlFor="rep-fecha">
              <span>
                Nueva fecha de entrega <Requerido />
              </span>
            </FieldLabel>
            <Input id="rep-fecha" type="date" min={diaEnLima()} aria-invalid={Boolean(e.fechaLimite)} {...form.register('fechaLimite')} />
            <FieldError errors={[e.fechaLimite]} />
          </Field>
          <Field data-invalid={Boolean(e.motivo)}>
            <FieldLabel htmlFor="rep-motivo">
              <span>
                Motivo <Requerido />
              </span>
            </FieldLabel>
            <Textarea id="rep-motivo" rows={3} maxLength={300} placeholder="Ej.: el cliente pidió más plazo" aria-invalid={Boolean(e.motivo)} {...form.register('motivo')} />
            <FieldError errors={[e.motivo]} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Reprogramar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Botón de la tarjeta «Datos del trabajo»: corregir título, universidad, carrera, Drive y observaciones. */
export function BotonEditarDatos({ t }: { t: TrabajoDetalle }) {
  const [abierto, setAbierto] = useState(false)
  if (t.estado === 'cancelado') return null
  return (
    <Can permiso="trabajos.editar">
      <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
        <Pencil />
        Editar datos
      </Button>
      {abierto && (
        <Suspense fallback={null}>
          <DialogoEditar t={t} abierto onAbiertoChange={setAbierto} />
        </Suspense>
      )}
    </Can>
  )
}

function DialogoEditar({ t, abierto, onAbiertoChange }: { t: TrabajoDetalle; abierto: boolean; onAbiertoChange: (a: boolean) => void }) {
  const { data: catalogos } = useSuspenseQuery(catalogosProspectoQuery)
  const editar = useEditarTrabajo(t.id)
  const [error, setError] = useState<string | null>(null)
  const [etiquetas, setEtiquetas] = useState({ universidad: t.universidad?.nombre, carrera: t.carrera?.nombre })
  const form = useForm<EditarTrabajoFormulario, unknown, EditarTrabajoDatos>({
    resolver: zodResolver(editarTrabajoSchema),
    defaultValues: {
      titulo: t.titulo ?? '',
      nivelAcademicoId: t.nivelAcademico?.id ?? '',
      universidadId: t.universidad?.id ?? '',
      carreraId: t.carrera?.id ?? '',
      linkDrive: t.linkDrive ?? '',
      observaciones: t.observaciones ?? '',
      detalles: t.detalles ?? '',
    },
  })
  const e = form.formState.errors
  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await editar.mutateAsync(datos)
      toast.success('Datos del trabajo actualizados')
      onAbiertoChange(false)
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['titulo', 'nivelAcademicoId', 'universidadId', 'carreraId', 'linkDrive', 'observaciones', 'detalles']))
    }
  })
  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Editar los datos de {t.codigo}</DialogTitle>
            <DialogDescription>Las fechas se cambian con «Reprogramar entrega». Lo que cambies queda en el historial.</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(e.titulo)} className="sm:col-span-2">
              <FieldLabel htmlFor="ed-titulo">Título del trabajo</FieldLabel>
              <Input id="ed-titulo" {...form.register('titulo')} />
              <FieldError errors={[e.titulo]} />
            </Field>
            <Field data-invalid={Boolean(e.nivelAcademicoId)}>
              <FieldLabel htmlFor="ed-nivel">
                <span>
                  Nivel académico <Requerido />
                </span>
              </FieldLabel>
              <Controller
                control={form.control}
                name="nivelAcademicoId"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger id="ed-nivel" className="w-full" aria-invalid={Boolean(e.nivelAcademicoId)}>
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogos.nivelesAcademicos.map((n) => (
                        <SelectItem key={n.id} value={n.id}>
                          {n.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[e.nivelAcademicoId]} />
            </Field>
            <Field data-invalid={Boolean(e.universidadId)}>
              <FieldLabel htmlFor="ed-universidad">
                <span>
                  Universidad <Requerido />
                </span>
              </FieldLabel>
              <Controller
                control={form.control}
                name="universidadId"
                render={({ field }) => (
                  <SelectorRemoto
                    id="ed-universidad"
                    clave="universidades"
                    valor={field.value}
                    etiqueta={etiquetas.universidad}
                    onCambio={(o) => {
                      field.onChange(o?.id ?? '')
                      setEtiquetas((x) => ({ ...x, universidad: o?.nombre }))
                    }}
                    buscar={(q, signal) => buscarCatalogo('universidades', q, signal)}
                    crear={(nombre) => crearEnCatalogo('universidades', nombre)}
                    placeholder="Buscar universidad…"
                  />
                )}
              />
              <FieldError errors={[e.universidadId]} />
            </Field>
            <Field data-invalid={Boolean(e.carreraId)} className="sm:col-span-2">
              <FieldLabel htmlFor="ed-carrera">
                <span>
                  Carrera <Requerido />
                </span>
              </FieldLabel>
              <Controller
                control={form.control}
                name="carreraId"
                render={({ field }) => (
                  <SelectorRemoto
                    id="ed-carrera"
                    clave="carreras"
                    valor={field.value}
                    etiqueta={etiquetas.carrera}
                    onCambio={(o) => {
                      field.onChange(o?.id ?? '')
                      setEtiquetas((x) => ({ ...x, carrera: o?.nombre }))
                    }}
                    buscar={(q, signal) => buscarCatalogo('carreras', q, signal)}
                    crear={(nombre) => crearEnCatalogo('carreras', nombre)}
                    placeholder="Buscar carrera…"
                  />
                )}
              />
              <FieldError errors={[e.carreraId]} />
            </Field>
            <Field data-invalid={Boolean(e.linkDrive)} className="sm:col-span-2">
              <FieldLabel htmlFor="ed-drive">
                <span>
                  Enlace de Drive <Requerido />
                </span>
              </FieldLabel>
              <Input id="ed-drive" type="url" placeholder="https://drive.google.com/…" aria-invalid={Boolean(e.linkDrive)} {...form.register('linkDrive')} />
              <FieldError errors={[e.linkDrive]} />
            </Field>
            <Field data-invalid={Boolean(e.observaciones)} className="sm:col-span-2">
              <FieldLabel htmlFor="ed-obs">Observaciones</FieldLabel>
              <Textarea id="ed-obs" rows={3} {...form.register('observaciones')} />
              <FieldError errors={[e.observaciones]} />
            </Field>
            <Field data-invalid={Boolean(e.detalles)} className="sm:col-span-2">
              <FieldLabel htmlFor="ed-detalles">Detalles</FieldLabel>
              <Textarea id="ed-detalles" rows={3} {...form.register('detalles')} />
              <FieldDescription>Indicaciones del trabajo (formato, requisitos del asesor, etc.).</FieldDescription>
              <FieldError errors={[e.detalles]} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
