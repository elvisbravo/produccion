import { reasignarProspectoSchema, type ProspectoDetalle } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Info, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import { nombreCompleto } from '@/lib/formato'
import { posiblesResponsablesQuery, useReasignarProspecto } from '../api'

/** Cambia quién sigue al prospecto. Las tareas pendientes no se mueven solas: tienen día, hora y agenda propios. */
export function DialogoReasignarProspecto({ prospecto: p, abierto, onAbiertoChange }: { prospecto: ProspectoDetalle; abierto: boolean; onAbiertoChange: (abierto: boolean) => void }) {
  const { data: personas } = useQuery({ ...posiblesResponsablesQuery, enabled: abierto })
  const reasignar = useReasignarProspecto(p.id)
  const [usuarioId, setUsuarioId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorCampo, setErrorCampo] = useState<string | null>(null)
  const tareasPendientes = p.tareas.filter((t) => ['pendiente', 'en_proceso'].includes(t.estado) && t.responsables.some((r) => r.usuario.id === p.responsable.id)).length

  const enviar = async () => {
    setError(null)
    setErrorCampo(null)
    const datos = reasignarProspectoSchema.safeParse({ usuarioId, motivo })
    if (!datos.success) return setErrorCampo(datos.error.issues[0]?.message ?? 'Revisa los datos')
    try {
      await reasignar.mutateAsync(datos.data)
      toast.success(`${p.codigo} ahora lo sigue ${nombreCompleto(personas?.find((x) => x.id === usuarioId))}`)
      onAbiertoChange(false)
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo reasignar')
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reasignar {p.codigo}</DialogTitle>
          <DialogDescription>
            Hoy lo sigue {nombreCompleto(p.responsable)}. La persona elegida lo verá en su seguimiento y recibirá un aviso; el cambio queda en la línea de tiempo.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field data-invalid={Boolean(errorCampo)}>
          <FieldLabel htmlFor="reasignar-persona">Nuevo responsable</FieldLabel>
          <Select value={usuarioId} onValueChange={setUsuarioId}>
            <SelectTrigger id="reasignar-persona" className="w-full" aria-invalid={Boolean(errorCampo)}>
              <SelectValue placeholder={personas ? 'Elegir…' : 'Cargando…'} />
            </SelectTrigger>
            <SelectContent>
              {personas
                ?.filter((x) => x.id !== p.responsable.id)
                .map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {nombreCompleto(x)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <FieldError>{errorCampo}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="reasignar-motivo">Motivo (opcional)</FieldLabel>
          <Input id="reasignar-motivo" value={motivo} maxLength={300} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Ej.: vacaciones, cambio de cartera…" />
        </Field>
        {tareasPendientes > 0 && (
          <Alert>
            <Info />
            <AlertDescription>
              Tiene {tareasPendientes} {tareasPendientes === 1 ? 'tarea pendiente' : 'tareas pendientes'} a nombre de {nombreCompleto(p.responsable)}. No se mueven solas: reasígnalas desde cada tarea.
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbiertoChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={reasignar.isPending || !usuarioId}>
            {reasignar.isPending && <Loader2 className="animate-spin" />}
            Reasignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
