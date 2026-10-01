import { NOMBRE_TIPO_DOCUMENTO, TIPOS_DOCUMENTO, type EditarUsuarioFormulario } from '@grupoes/shared'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { Requerido } from '@/components/requerido'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BotonBuscarDni } from '@/features/consultas/components/boton-buscar-dni'

/**
 * Tipo y número de documento de un usuario (obligatorios). Con DNI se puede buscar y rellenar nombres,
 * apellidos y fecha de nacimiento. Va dentro de un FormProvider.
 */
export function CamposDocumentoUsuario({ prefijo }: { prefijo: string }) {
  const { control, register, setValue, formState } = useFormContext<EditarUsuarioFormulario>()
  const e = formState.errors
  const [tipo, numero] = useWatch({ control, name: ['tipoDocumento', 'numeroDocumento'] })

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field data-invalid={Boolean(e.tipoDocumento)}>
        <FieldLabel htmlFor={`${prefijo}-tipo-doc`}>
          <span>
            Tipo de documento <Requerido />
          </span>
        </FieldLabel>
        <Controller
          control={control}
          name="tipoDocumento"
          render={({ field }) => (
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <SelectTrigger id={`${prefijo}-tipo-doc`} className="w-full" aria-invalid={Boolean(e.tipoDocumento)}>
                <SelectValue placeholder="Elige el tipo" />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_DOCUMENTO.map((t) => (
                  <SelectItem key={t} value={t}>
                    {NOMBRE_TIPO_DOCUMENTO[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError errors={[e.tipoDocumento]} />
      </Field>
      <Field data-invalid={Boolean(e.numeroDocumento)}>
        <FieldLabel htmlFor={`${prefijo}-num-doc`}>
          <span>
            N.º de documento <Requerido />
          </span>
        </FieldLabel>
        <Input id={`${prefijo}-num-doc`} autoComplete="off" className="font-mono uppercase" aria-invalid={Boolean(e.numeroDocumento)} {...register('numeroDocumento')} />
        <FieldError errors={[e.numeroDocumento]} />
      </Field>
      <BotonBuscarDni
        className="sm:col-span-2"
        tipo={tipo}
        numero={numero}
        onEncontrado={(datos) => {
          const opciones = { shouldDirty: true, shouldValidate: true }
          setValue('nombres', datos.nombres, opciones)
          setValue('apellidos', datos.apellidos, opciones)
          // Los tres datos son de la misma persona: se reemplazan juntos para no dejar una fecha de otra búsqueda.
          if (datos.fechaNacimiento) setValue('fechaNacimiento', datos.fechaNacimiento, opciones)
        }}
      />
    </div>
  )
}
