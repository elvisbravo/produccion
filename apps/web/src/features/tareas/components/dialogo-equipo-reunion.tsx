import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Loader2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { nombreCompleto } from '@/lib/formato'
import { usePermiso } from '@/lib/permisos'
import { candidatosQuery, useEquipoReunion } from '../api'

const NINGUNO = 'ninguno'

/** Elige el jefe de producción y, si hace falta, un auxiliar de apoyo (opcional) para una reunión; avisa si alguien tiene un choque. */
export function DialogoEquipoReunion({ tareaId, actividad, jefeId, auxiliarId, onCerrar }: { tareaId: string; actividad: string; jefeId: string | null; auxiliarId: string | null; onCerrar: () => void }) {
  const { data, isPending } = useQuery(candidatosQuery(tareaId))
  const guardar = useEquipoReunion(tareaId)
  const puedeForzar = usePermiso('tareas.forzar_agenda')
  const [jefe, setJefe] = useState(jefeId ?? NINGUNO)
  const [auxiliar, setAuxiliar] = useState(auxiliarId ?? NINGUNO)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Todas las personas que pueden tomar la reunión, separadas por su rol.
  const candidatos = data?.participaciones.flatMap((p) => p.candidatos) ?? []
  const unicos = (codigo: string) => [...new Map(candidatos.filter((c) => c.rol.codigo === codigo).map((c) => [c.usuario.id, c])).values()]
  const jefes = unicos('JEFE_PROD')
  const auxiliares = unicos('AUXILIAR')
  const aviso = (id: string) => candidatos.find((c) => c.usuario.id === id)?.disponibilidad
  const choques = [jefe, auxiliar].flatMap((id) => (id === NINGUNO ? [] : [{ id, d: aviso(id) }])).filter((x) => x.d && x.d.avisos.length > 0)
  const sinNadie = jefe === NINGUNO && auxiliar === NINGUNO

  const enviar = async () => {
    setError(null)
    try {
      await guardar.mutateAsync({ jefeId: jefe === NINGUNO ? undefined : jefe, auxiliarId: auxiliar === NINGUNO ? undefined : auxiliar, motivoForzado: choques.length > 0 ? motivo : undefined })
      toast.success('Equipo de la reunión actualizado')
      onCerrar()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar')
    }
  }

  const campo = (etiqueta: string, ayuda: string, valor: string, cambiar: (v: string) => void, opciones: typeof jefes, vacio: string) => (
    <Field>
      <FieldLabel>{etiqueta}</FieldLabel>
      <Select value={valor} onValueChange={cambiar}>
        <SelectTrigger className="w-full" aria-label={etiqueta}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NINGUNO}>{vacio}</SelectItem>
          {opciones.map((c) => (
            <SelectItem key={c.usuario.id} value={c.usuario.id} disabled={c.disponibilidad.estado === 'no_laborable'}>
              {nombreCompleto(c.usuario)}
              {c.disponibilidad.estado === 'no_laborable' ? ` · no trabaja (${c.disponibilidad.bloqueo})` : c.disponibilidad.avisos.length > 0 ? ' · con aviso de agenda' : ' · libre'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{ayuda}</FieldDescription>
    </Field>
  )

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Equipo de {actividad}</DialogTitle>
          <DialogDescription>Elige al jefe de producción y, si hace falta, un auxiliar de apoyo. El auxiliar es opcional.</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {isPending || !data ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="flex flex-col gap-4">
            {campo('Jefe de producción', 'Quien da la reunión.', jefe, setJefe, jefes, 'Sin jefe')}
            {campo('Auxiliar de apoyo (opcional)', 'Quien acompaña al jefe.', auxiliar, setAuxiliar, auxiliares, 'Sin auxiliar')}
            {choques.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="flex items-start gap-1.5 text-xs text-destructive">
                  <TriangleAlert className="mt-px size-3.5 shrink-0" />
                  {choques.map((x) => x.d!.avisos.join(' · ')).join(' | ')}
                </p>
                <Field>
                  <FieldLabel htmlFor="equipo-motivo">Motivo para asignar pese a los avisos</FieldLabel>
                  <Input id="equipo-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: el cliente solo puede a esa hora" />
                  {!puedeForzar && <FieldDescription>No tienes permiso para forzar la agenda: elige a otra persona o cambia la hora.</FieldDescription>}
                </Field>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={!data || guardar.isPending || sinNadie || (choques.length > 0 && (!puedeForzar || motivo.trim().length < 3))}>
            {guardar.isPending && <Loader2 className="animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
