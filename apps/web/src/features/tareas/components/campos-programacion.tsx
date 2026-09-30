import { diaEnLima, MODALIDADES, NOMBRE_MODALIDAD, type ActividadCatalogo } from '@grupoes/shared'
import { Clock, Info } from 'lucide-react'
import { Controller, get, useFormContext, useWatch } from 'react-hook-form'
import { Requerido } from '@/components/requerido'
import { Badge } from '@/components/ui/badge'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { duracion } from '@/lib/formato'

interface Props {
  /** Prefijo de los campos en el formulario (p. ej. "primeraActividad."). */
  prefijo?: string
  actividades: ActividadCatalogo[]
  /** Muestra quién puede hacerla y a quién le llega (útil al programar desde cero). */
  mostrarDetalle?: boolean
  mostrarNotas?: boolean
}

/** Campos para programar una actividad: actividad, día, hora, modalidad y notas. */
export function CamposProgramacion({ prefijo = '', actividades, mostrarDetalle = true, mostrarNotas = true }: Props) {
  const { control, register, formState } = useFormContext()
  const n = (campo: string) => `${prefijo}${campo}`
  const error = (campo: string) => get(formState.errors, n(campo)) as { message?: string } | undefined
  const actividadId = useWatch({ control, name: n('actividadId') }) as string | undefined
  const actividad = actividades.find((a) => a.id === actividadId)
  const esReunion = actividad?.tipo.comportamiento === 'reunion'
  const id = (campo: string) => `${prefijo.replace(/\W/g, '-')}${campo}`

  return (
    <div className="flex flex-col gap-4">
      <Field data-invalid={Boolean(error('actividadId'))}>
        <FieldLabel htmlFor={id('actividad')}>
          <span>
            Actividad <Requerido />
          </span>
        </FieldLabel>
        <Controller
          control={control}
          name={n('actividadId')}
          render={({ field }) => (
            <Select value={field.value ?? ''} onValueChange={field.onChange}>
              <SelectTrigger id={id('actividad')} className="w-full" aria-invalid={Boolean(error('actividadId'))}>
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                {actividades.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="size-2 rounded-full" style={{ backgroundColor: a.tipo.color }} aria-hidden="true" />
                    {a.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError errors={[error('actividadId')]} />
        {actividad && (
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{actividad.tipo.nombre}</Badge>
            <Badge variant="outline">
              <Clock />
              {duracion(actividad.minutosEstimados)}
            </Badge>
            {actividad.modoAsignacion === 'coordinada' && <Badge variant="outline">Coordinada</Badge>}
          </div>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field data-invalid={Boolean(error('fecha'))}>
          <FieldLabel htmlFor={id('fecha')}>
            <span>
              Día <Requerido />
            </span>
          </FieldLabel>
          <Input id={id('fecha')} type="date" min={diaEnLima()} aria-invalid={Boolean(error('fecha'))} {...register(n('fecha'))} />
          <FieldError errors={[error('fecha')]} />
        </Field>
        <Field data-invalid={Boolean(error('hora'))}>
          <FieldLabel htmlFor={id('hora')}>
            <span>
              Hora {actividad?.requiereHoraFija ? <Requerido /> : <span className="font-normal text-muted-foreground">(opcional)</span>}
            </span>
          </FieldLabel>
          <Input id={id('hora')} type="time" step={900} aria-invalid={Boolean(error('hora'))} {...register(n('hora'))} />
          <FieldError errors={[error('hora')]} />
        </Field>
      </div>

      {esReunion && (
        <Field data-invalid={Boolean(error('modalidad'))}>
          <FieldLabel id={id('modalidad-label')}>
            <span>
              Modalidad <Requerido />
            </span>
          </FieldLabel>
          <Controller
            control={control}
            name={n('modalidad')}
            render={({ field }) => (
              <ToggleGroup
                type="single"
                variant="outline"
                className="w-full"
                aria-labelledby={id('modalidad-label')}
                value={field.value ?? ''}
                onValueChange={field.onChange}
              >
                {MODALIDADES.map((m) => (
                  <ToggleGroupItem key={m} value={m} className="flex-1">
                    {NOMBRE_MODALIDAD[m]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          />
          <FieldError errors={[error('modalidad')]} />
        </Field>
      )}

      {mostrarNotas && (
        <Field data-invalid={Boolean(error('notas'))}>
          <FieldLabel htmlFor={id('notas')}>Notas</FieldLabel>
          <Textarea id={id('notas')} rows={2} placeholder="Lo que hay que saber para esta actividad" {...register(n('notas'))} />
          <FieldError errors={[error('notas')]} />
        </Field>
      )}

      {mostrarDetalle && actividad && <DetalleAsignacion actividad={actividad} />}
    </div>
  )
}

/** Quién puede realizarla (con su prioridad) y a quién llega la tarea. */
export function DetalleAsignacion({ actividad }: { actividad: ActividadCatalogo }) {
  const principal = actividad.participaciones.find((p) => p.obligatoria) ?? actividad.participaciones[0]
  return (
    <div className="flex flex-col gap-3">
      {principal && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{principal.nombre}</span>
          <ul className="divide-y rounded-lg border text-sm">
            {principal.roles.map((r) => (
              <li key={r.codigo} className="flex items-center justify-between px-3 py-2">
                {r.nombre}
                <Badge variant={r.prioridad.nivel === 1 ? 'secondary' : 'outline'}>{r.prioridad.nombre}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex gap-2 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          {actividad.modoAsignacion === 'coordinada'
            ? 'Llegará a la bandeja del coordinador (asistente de producción) para asignar al responsable según su disponibilidad.'
            : actividad.modoAsignacion === 'creador'
              ? 'Quedará a tu cargo.'
              : 'Elige al responsable al programarla.'}
        </span>
      </div>
    </div>
  )
}
