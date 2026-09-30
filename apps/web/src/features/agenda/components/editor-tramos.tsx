import { NOMBRE_DIA_SEMANA, type TramoFormulario, type TramoSemanal, minutosAHora } from '@grupoes/shared'
import { CopyPlus, Plus, X } from 'lucide-react'
import { useFieldArray, useFormContext } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type ConTramos = { tramos: TramoFormulario[] }

/** Tramos en minutos (API) → tramos en "HH:mm" (formulario). */
export const aTramosFormulario = (tramos: TramoSemanal[]): TramoFormulario[] =>
  tramos.map((t) => ({ diaSemana: t.diaSemana, inicio: minutosAHora(t.inicio), fin: minutosAHora(t.fin) }))

/** Horario semanal: uno o más tramos por día (turno partido). Un día sin tramos es de descanso. */
export function EditorTramos() {
  const { control, register, formState, getValues } = useFormContext<ConTramos>()
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'tramos' })
  const errores = formState.errors.tramos

  const copiarLunes = () => {
    const lunes = getValues('tramos').filter((t) => t.diaSemana === 1)
    const resto = getValues('tramos').filter((t) => t.diaSemana > 5)
    replace([...[1, 2, 3, 4, 5].flatMap((diaSemana) => lunes.map((t) => ({ ...t, diaSemana }))), ...resto])
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Horario semanal</span>
        <Button type="button" variant="ghost" size="sm" onClick={copiarLunes}>
          <CopyPlus />
          Copiar el lunes a martes–viernes
        </Button>
      </div>
      <div className="divide-y rounded-lg border">
        {[1, 2, 3, 4, 5, 6, 7].map((dia) => {
          const delDia = fields.map((f, indice) => ({ f, indice })).filter(({ f }) => f.diaSemana === dia)
          const ultimo = delDia.at(-1)
          return (
            <div key={dia} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-start">
              <span className="w-24 shrink-0 pt-1.5 text-sm">{NOMBRE_DIA_SEMANA[dia]}</span>
              <div className="flex flex-1 flex-col gap-2">
                {delDia.length === 0 && <span className="pt-1.5 text-sm text-muted-foreground">Descanso</span>}
                {delDia.map(({ f, indice }) => {
                  const error = errores?.[indice]
                  return (
                    <div key={f.id} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Input type="time" step={900} className="w-32" aria-label={`${NOMBRE_DIA_SEMANA[dia]}: inicio`} aria-invalid={Boolean(error?.inicio)} {...register(`tramos.${indice}.inicio`)} />
                        <span className="text-muted-foreground">a</span>
                        <Input type="time" step={900} className="w-32" aria-label={`${NOMBRE_DIA_SEMANA[dia]}: fin`} aria-invalid={Boolean(error?.fin)} {...register(`tramos.${indice}.fin`)} />
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(indice)} aria-label="Quitar tramo">
                          <X />
                        </Button>
                      </div>
                      {(error?.inicio || error?.fin) && <span className="text-xs text-destructive">{error.inicio?.message ?? error.fin?.message}</span>}
                    </div>
                  )
                })}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => {
                  const previo = ultimo ? getValues(`tramos.${ultimo.indice}`) : null
                  append(previo ? { diaSemana: dia, inicio: previo.fin < '15:00' ? '15:00' : previo.fin, fin: '19:00' } : { diaSemana: dia, inicio: '08:00', fin: '13:00' })
                }}
              >
                <Plus />
                Tramo
              </Button>
            </div>
          )
        })}
      </div>
      {errores?.message && <span className="text-xs text-destructive">{errores.message}</span>}
      {errores?.root?.message && <span className="text-xs text-destructive">{errores.root.message}</span>}
    </div>
  )
}
