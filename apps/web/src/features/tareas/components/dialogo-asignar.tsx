import { useQuery } from '@tanstack/react-query'
import { AlertCircle, CalendarClock, Loader2, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { describirCuando, formatearHora, nombreCompleto } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { candidatosQuery, useAsignarTarea } from '../api'

interface Props {
  tareaId: string
  hoy: string
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

const NINGUNO = 'ninguno'

export function DialogoAsignar({ tareaId, hoy, abierto, onAbiertoChange }: Props) {
  const { data, isPending, refetch } = useQuery({ ...candidatosQuery(tareaId), enabled: abierto })
  const asignar = useAsignarTarea(tareaId)
  const [elegidos, setElegidos] = useState<Record<string, string>>({})
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Por defecto, el primer candidato sin choques de cada participación obligatoria (ya vienen ordenados por prioridad).
  const seleccion = useMemo(() => {
    if (!data) return {}
    const base: Record<string, string> = {}
    for (const p of data.participaciones) {
      const actual = data.tarea.responsables.find((r) => r.participacion === p.nombre)
      const sugerido = p.obligatoria ? p.candidatos.find((c) => c.conflictos.length === 0) : undefined
      base[p.id] = actual?.usuario.id ?? sugerido?.usuario.id ?? NINGUNO
    }
    return { ...base, ...elegidos }
  }, [data, elegidos])

  const conChoque = data?.participaciones.flatMap((p) => p.candidatos.filter((c) => seleccion[p.id] === c.usuario.id && c.conflictos.length > 0)) ?? []
  const faltan = data?.participaciones.filter((p) => p.obligatoria && seleccion[p.id] === NINGUNO) ?? []

  const enviar = async () => {
    if (!data) return
    setError(null)
    try {
      const responsables = data.participaciones
        .filter((p) => seleccion[p.id] && seleccion[p.id] !== NINGUNO)
        .map((p) => ({ participacionId: p.id, usuarioId: seleccion[p.id] }))
      const tarea = await asignar.mutateAsync({ responsables, motivoForzado: conChoque.length ? motivo : undefined })
      toast.success(`${tarea.actividad.nombre} asignado a ${tarea.responsables.map((r) => nombreCompleto(r.usuario)).join(', ')}`)
      setElegidos({})
      setMotivo('')
      onAbiertoChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo asignar')
      if (err instanceof ApiError && err.status === 409) void refetch()
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Asignar {data?.tarea.actividad.nombre ?? 'actividad'}</DialogTitle>
          <DialogDescription>
            {data ? (
              <>
                {data.tarea.prospecto?.codigo} · {describirCuando(data.tarea, hoy)}
                {data.tarea.inicio && ` a ${formatearHora(new Date(new Date(data.tarea.inicio).getTime() + data.tarea.minutosEstimados * 60_000).toISOString())}`}
              </>
            ) : (
              'Cargando candidatos…'
            )}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isPending || !data ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {data.participaciones.map((p) => (
              <fieldset key={p.id} className="flex flex-col gap-2">
                <legend className="mb-1 flex items-center gap-2 text-sm font-medium">
                  {p.nombre}
                  {!p.obligatoria && <span className="font-normal text-muted-foreground">(opcional)</span>}
                </legend>
                {p.candidatos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay personas con un rol permitido.</p>
                ) : (
                  <RadioGroup
                    value={seleccion[p.id] ?? NINGUNO}
                    onValueChange={(v) => setElegidos((x) => ({ ...x, [p.id]: v }))}
                    className="gap-0 overflow-hidden rounded-lg border"
                  >
                    {p.candidatos.map((c) => {
                      const id = `cand-${p.id}-${c.usuario.id}`
                      const ocupado = c.conflictos.length > 0
                      return (
                        <Label
                          key={c.usuario.id}
                          htmlFor={id}
                          className={cn(
                            'flex cursor-pointer items-start gap-3 border-b px-3 py-2.5 font-normal last:border-b-0 hover:bg-muted/50',
                            seleccion[p.id] === c.usuario.id && 'bg-muted/60',
                          )}
                        >
                          <RadioGroupItem value={c.usuario.id} id={id} className="mt-0.5" />
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{nombreCompleto(c.usuario)}</span>
                              <Badge variant={c.prioridad.nivel === 1 ? 'secondary' : 'outline'}>{c.prioridad.nombre}</Badge>
                              <span className="text-xs text-muted-foreground">{c.rol.nombre}</span>
                            </div>
                            <span className={cn('flex items-center gap-1 text-xs', ocupado ? 'text-destructive' : 'text-muted-foreground')}>
                              {ocupado ? <TriangleAlert className="size-3.5" /> : <CalendarClock className="size-3.5" />}
                              {ocupado
                                ? `Choca con ${c.conflictos.map((x) => `${x.actividad} (${formatearHora(x.inicio)}–${formatearHora(x.fin)})`).join(', ')}`
                                : c.tareasDelDia === 0
                                  ? 'Libre ese día'
                                  : `${c.tareasDelDia} ${c.tareasDelDia === 1 ? 'actividad' : 'actividades'} ese día`}
                            </span>
                          </div>
                        </Label>
                      )
                    })}
                    {!p.obligatoria && (
                      <Label htmlFor={`cand-${p.id}-ninguno`} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 font-normal hover:bg-muted/50">
                        <RadioGroupItem value={NINGUNO} id={`cand-${p.id}-ninguno`} />
                        <span className="text-muted-foreground">Nadie</span>
                      </Label>
                    )}
                  </RadioGroup>
                )}
              </fieldset>
            ))}

            {conChoque.length > 0 && (
              <Field>
                <FieldLabel htmlFor="motivo-forzado">Motivo para asignar con choque de horario</FieldLabel>
                <Input id="motivo-forzado" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Ej.: el cliente solo puede a esa hora" />
                <FieldDescription>Queda registrado junto a la asignación.</FieldDescription>
              </Field>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void enviar()}
            disabled={!data || asignar.isPending || faltan.length > 0 || (conChoque.length > 0 && motivo.trim().length < 3)}
          >
            {asignar.isPending && <Loader2 className="animate-spin" />}
            Asignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
