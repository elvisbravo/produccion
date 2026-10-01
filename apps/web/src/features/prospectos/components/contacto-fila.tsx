import {
  NOMBRE_TIPO_DOCUMENTO,
  TIPOS_DOCUMENTO,
  formatearCelular,
  normalizarCelular,
  type ProspectoFormulario,
} from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { TriangleAlert, Trash2, UserCheck } from 'lucide-react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Requerido } from '@/components/requerido'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BotonBuscarDni } from '@/features/consultas/components/boton-buscar-dni'
import { useDebounce } from '@/hooks/use-debounce'
import { nombreCompleto } from '@/lib/formato'
import { buscarPorCelular } from '../api'

interface Props {
  indice: number
  puedeQuitar: boolean
  onQuitar: () => void
  onMarcarPrincipal: () => void
  /** Prospecto que se está editando (no se avisa de él mismo como duplicado). */
  prospectoId?: string
  /** Personas que ya son contactos de ese prospecto: no se muestran como coincidencia. */
  personasDelProspecto?: string[]
}

export function ContactoFila({ indice, puedeQuitar, onQuitar, onMarcarPrincipal, prospectoId, personasDelProspecto = [] }: Props) {
  const { control, register, setValue, getValues, formState } = useFormContext<ProspectoFormulario>()
  const errores = formState.errors.contactos?.[indice]
  const esPrincipal = useWatch({ control, name: `contactos.${indice}.esPrincipal` })
  const celular = useWatch({ control, name: `contactos.${indice}.celular` })
  const [tipoDoc, numeroDoc] = useWatch({ control, name: [`contactos.${indice}.tipoDocumento`, `contactos.${indice}.numeroDocumento`] })
  const normalizado = useDebounce(normalizarCelular(celular ?? ''), 400)

  const { data } = useQuery({
    queryKey: ['personas', 'por-celular', normalizado],
    queryFn: ({ signal }) => buscarPorCelular(normalizado!, signal),
    enabled: Boolean(normalizado),
    staleTime: 30_000,
  })
  const coincidencia = data?.coincidencia && !personasDelProspecto.includes(data.coincidencia.persona.id) ? data.coincidencia : null
  const otrosProspectos = coincidencia?.prospectos.filter((p) => p.id !== prospectoId) ?? []

  const campo = (nombre: 'nombres' | 'apellidos' | 'email' | 'numeroDocumento') => `contactos.${indice}.${nombre}` as const

  /** Completa los campos vacíos con los datos ya registrados de la persona. */
  const usarDatos = () => {
    if (!coincidencia) return
    const p = coincidencia.persona
    const vacio = (n: Parameters<typeof campo>[0]) => !getValues(campo(n))
    const opciones = { shouldDirty: true, shouldValidate: true }
    if (p.nombres && vacio('nombres')) setValue(campo('nombres'), p.nombres, opciones)
    if (p.apellidos && vacio('apellidos')) setValue(campo('apellidos'), p.apellidos, opciones)
    if (p.email && vacio('email')) setValue(campo('email'), p.email, opciones)
    if (p.tipoDocumento && p.numeroDocumento && vacio('numeroDocumento')) {
      setValue(`contactos.${indice}.tipoDocumento`, p.tipoDocumento, opciones)
      setValue(campo('numeroDocumento'), p.numeroDocumento, opciones)
    }
  }

  const id = (n: string) => `contacto-${indice}-${n}`

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border p-4">
      <legend className="sr-only">Contacto {indice + 1}</legend>
      <div className="flex items-center gap-2">
        {esPrincipal ? (
          <Badge>Principal</Badge>
        ) : (
          <Button type="button" variant="ghost" size="xs" onClick={onMarcarPrincipal}>
            Marcar como principal
          </Button>
        )}
        <span className="text-sm text-muted-foreground">Contacto {indice + 1}</span>
        {puedeQuitar && (
          <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Quitar contacto ${indice + 1}`} onClick={onQuitar}>
            <Trash2 />
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field data-invalid={Boolean(errores?.celular)}>
          <FieldLabel htmlFor={id('celular')}>
            <span>
              Celular (WhatsApp) <Requerido />
            </span>
          </FieldLabel>
          <Input
            id={id('celular')}
            inputMode="tel"
            autoComplete="off"
            placeholder="987 654 321"
            className="font-mono"
            aria-invalid={Boolean(errores?.celular)}
            {...register(`contactos.${indice}.celular`)}
          />
          <FieldError errors={[errores?.celular]} />
        </Field>
        <Field data-invalid={Boolean(errores?.nombres)}>
          <FieldLabel htmlFor={id('nombres')}>Nombres</FieldLabel>
          <Input id={id('nombres')} autoComplete="off" aria-invalid={Boolean(errores?.nombres)} {...register(campo('nombres'))} />
          <FieldError errors={[errores?.nombres]} />
        </Field>
        <Field data-invalid={Boolean(errores?.apellidos)}>
          <FieldLabel htmlFor={id('apellidos')}>Apellidos</FieldLabel>
          <Input id={id('apellidos')} autoComplete="off" aria-invalid={Boolean(errores?.apellidos)} {...register(campo('apellidos'))} />
          <FieldError errors={[errores?.apellidos]} />
        </Field>
        <Field data-invalid={Boolean(errores?.tipoDocumento)}>
          <FieldLabel htmlFor={id('tipo-doc')}>Tipo de documento</FieldLabel>
          <Controller
            control={control}
            name={`contactos.${indice}.tipoDocumento`}
            render={({ field }) => (
              <Select value={field.value || 'ninguno'} onValueChange={(v) => field.onChange(v === 'ninguno' ? '' : v)}>
                <SelectTrigger id={id('tipo-doc')} className="w-full" aria-invalid={Boolean(errores?.tipoDocumento)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Sin documento</SelectItem>
                  {TIPOS_DOCUMENTO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {NOMBRE_TIPO_DOCUMENTO[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError errors={[errores?.tipoDocumento]} />
        </Field>
        <Field data-invalid={Boolean(errores?.numeroDocumento)}>
          <FieldLabel htmlFor={id('num-doc')}>N.º de documento</FieldLabel>
          <Input
            id={id('num-doc')}
            autoComplete="off"
            className="font-mono uppercase"
            aria-invalid={Boolean(errores?.numeroDocumento)}
            {...register(campo('numeroDocumento'))}
          />
          <FieldError errors={[errores?.numeroDocumento]} />
        </Field>
        <BotonBuscarDni
          tipo={tipoDoc}
          numero={numeroDoc}
          onEncontrado={(datos) => {
            const opciones = { shouldDirty: true, shouldValidate: true }
            setValue(campo('nombres'), datos.nombres, opciones)
            setValue(campo('apellidos'), datos.apellidos, opciones)
          }}
        />
        <Field data-invalid={Boolean(errores?.email)}>
          <FieldLabel htmlFor={id('email')}>Correo</FieldLabel>
          <Input
            id={id('email')}
            type="email"
            autoComplete="off"
            placeholder="nombre@correo.com"
            aria-invalid={Boolean(errores?.email)}
            {...register(campo('email'))}
          />
          <FieldError errors={[errores?.email]} />
        </Field>
      </div>

      {coincidencia && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <TriangleAlert />
          <AlertTitle>
            Este celular ya está registrado{nombreCompleto(coincidencia.persona) ? `: ${nombreCompleto(coincidencia.persona)}` : ''}
          </AlertTitle>
          <AlertDescription className="text-amber-900/90 dark:text-amber-100/90">
            <p>
              Se reutilizará su registro ({formatearCelular(coincidencia.persona.celular)}).
              {otrosProspectos.length > 0 && ' Tiene estos prospectos: '}
              {otrosProspectos.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <Link to="/prospectos/$id" params={{ id: p.id }} target="_blank" className="font-mono font-medium underline underline-offset-2">
                    {p.codigo}
                  </Link>{' '}
                  ({p.tipoTrabajo}, {p.etapa.toLowerCase()})
                </span>
              ))}
            </p>
            <Button type="button" variant="outline" size="xs" className="mt-2 bg-transparent" onClick={usarDatos}>
              <UserCheck />
              Completar con sus datos
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </fieldset>
  )
}
