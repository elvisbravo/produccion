import { costoHoraSchema, diaEnLima, formatearSoles } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Lock, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { formatearFecha, nombreCompleto } from '@/lib/formato'
import { usePermiso } from '@/lib/permisos'
import { costosHoraQuery, useGuardarCostoHora, useQuitarCostoHora } from '../api'

const mensaje = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo guardar')

/** Costo por hora con vigencia (confidencial): se usa para la rentabilidad de los trabajos. */
export function CostoHoraUsuario({ usuarioId }: { usuarioId: string }) {
  const puedeVer = usePermiso('usuarios.ver_costo_hora')
  const puedeEditar = usePermiso('usuarios.editar')
  const { data } = useQuery({ ...costosHoraQuery(usuarioId), enabled: puedeVer })
  const guardar = useGuardarCostoHora(usuarioId)
  const quitar = useQuitarCostoHora(usuarioId)
  const [costo, setCosto] = useState('')
  const [desde, setDesde] = useState(diaEnLima())
  if (!puedeVer) return null
  const hoy = diaEnLima()
  const vigente = data?.find((c) => c.vigenteDesde <= hoy)

  const enviar = async () => {
    const datos = costoHoraSchema.safeParse({ costo, vigenteDesde: desde })
    if (!datos.success) return toast.error(datos.error.issues[0]?.message ?? 'Revisa los datos')
    try {
      await guardar.mutateAsync(datos.data)
      toast.success('Costo por hora guardado')
      setCosto('')
    } catch (err) {
      toast.error(mensaje(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-4" />
          Costo por hora
        </CardTitle>
        <CardDescription>
          Confidencial. Se usa para la rentabilidad de los trabajos. Cada cambio rige desde su fecha, así no altera los cálculos pasados.
          {vigente ? ` Hoy: ${formatearSoles(vigente.costo)} por hora.` : ' Aún no tiene costo vigente.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data && data.length > 0 && (
          <ul className="divide-y rounded-lg border text-sm">
            {data.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-28 font-medium tabular-nums">{formatearSoles(c.costo)}/h</span>
                <span className="flex-1 text-muted-foreground">
                  desde el {formatearFecha(c.vigenteDesde)}
                  {c.vigenteDesde > hoy && ' (programado)'} · {nombreCompleto(c.creadoPor) ?? '—'}
                </span>
                {puedeEditar && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Quitar este costo"
                    onClick={() => quitar.mutate(c.id, { onSuccess: () => toast.success('Costo quitado'), onError: (err) => toast.error(mensaje(err)) })}
                  >
                    <X />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {puedeEditar && (
          <div className="flex flex-wrap items-end gap-3">
            <Field className="w-40">
              <FieldLabel htmlFor="costo-monto">Costo por hora</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>S/</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput id="costo-monto" type="number" inputMode="decimal" min={0} step={0.5} value={costo} onChange={(ev) => setCosto(ev.target.value)} />
              </InputGroup>
            </Field>
            <Field className="w-44">
              <FieldLabel htmlFor="costo-desde">Rige desde</FieldLabel>
              <Input id="costo-desde" type="date" value={desde} onChange={(ev) => setDesde(ev.target.value)} />
            </Field>
            <Button variant="outline" onClick={() => void enviar()} disabled={!costo || guardar.isPending}>
              {guardar.isPending && <Loader2 className="animate-spin" />}
              Guardar costo
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
