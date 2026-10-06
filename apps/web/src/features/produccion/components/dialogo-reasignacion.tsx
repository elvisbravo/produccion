import { NOMBRE_MOTIVO_CANDIDATO, type CandidatoReasignacion, type PropuestaReasignacion } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, CalendarClock, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { duracion, formatearFecha, formatearFechaHora, nombreCompleto } from '@/lib/formato'
import { reasignacionQuery, useAplicarReasignacion } from '../api-contingencias'
import { DialogoApoyo } from './dialogo-apoyo'
import { describirHolgura, PuntoSemaforo } from './insignias'

const MANTENER = 'mantener'
const SUGERENCIA = { posponer: 'Se corre sola y llega', reasignar: 'Conviene reasignarla', coordinar: 'Nadie libre: coordinar con el cliente' } as const

/** Propuesta de reasignación de las tareas de una persona ausente, con el resultado simulado de cada opción. */
export function DialogoReasignacion({ ausenciaId, onCerrar }: { ausenciaId: string; onCerrar: () => void }) {
  const { data, isPending, error } = useQuery(reasignacionQuery(ausenciaId))
  const aplicar = useAplicarReasignacion(ausenciaId)
  const [elegidos, setElegidos] = useState<Record<string, string>>({})
  const [errorAplicar, setErrorAplicar] = useState<string | null>(null)
  const [apoyoDe, setApoyoDe] = useState<string | null>(null)

  const destino = (p: PropuestaReasignacion) => elegidos[p.tarea.id] ?? p.sugerido ?? MANTENER
  const cambios = data?.propuestas.filter((p) => destino(p) !== MANTENER).map((p) => ({ tareaId: p.tarea.id, usuarioId: destino(p) })) ?? []

  const confirmar = async () => {
    setErrorAplicar(null)
    try {
      const r = await aplicar.mutateAsync({ cambios })
      toast.success(`${r.reasignadas} ${r.reasignadas === 1 ? 'tarea reasignada' : 'tareas reasignadas'}`)
      onCerrar()
    } catch (err) {
      setErrorAplicar(err instanceof ApiError ? err.message : 'No se pudo reasignar')
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Reasignar tareas{data && ` de ${nombreCompleto(data.usuario)}`}</DialogTitle>
          <DialogDescription>
            Su cola se corre sola mientras no está. Pasa a otra persona lo que ya no llega a su fecha y las reuniones de esos días. Ya viene marcada la sugerencia.
          </DialogDescription>
        </DialogHeader>
        {(error || errorAplicar) && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{errorAplicar ?? (error instanceof Error ? error.message : 'No se pudo cargar')}</AlertDescription>
          </Alert>
        )}
        {isPending ? (
          <Skeleton className="h-48" />
        ) : data && data.propuestas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tiene reuniones en esas fechas ni tareas en cola pendientes.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {data?.propuestas.map((p) => (
              <li key={p.tarea.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: p.tarea.color }} aria-hidden="true" />
                    {p.tarea.titulo}
                    {p.tarea.referencia && <span className="font-mono text-xs font-normal text-muted-foreground">{p.tarea.referencia.codigo}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {p.tarea.enCola ? (
                      <>
                        {duracion(p.tarea.minutos)}
                        {p.tarea.fechaLimite && ` · vence el ${formatearFecha(p.tarea.fechaLimite)}`}
                        {p.actual && (
                          <span className="inline-flex items-center gap-1">
                            · <PuntoSemaforo semaforo={p.actual.semaforo} dias={p.actual.holguraDias} fin={p.actual.fin} />
                            {describirHolgura(p.actual.semaforo, p.actual.holguraDias)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-3.5" />
                        Reunión el {formatearFecha(p.tarea.fecha)} a las {p.tarea.hora}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{SUGERENCIA[p.sugerencia]}</Badge>
                    {p.tarea.enCola && p.sugerencia === 'reasignar' && (
                      <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setApoyoDe(p.tarea.id)}>
                        Si nadie llega a tiempo: horas extra o bono
                      </Button>
                    )}
                  </span>
                </div>
                <Select value={destino(p)} onValueChange={(v) => setElegidos((x) => ({ ...x, [p.tarea.id]: v }))}>
                  <SelectTrigger className="w-full sm:w-72" aria-label={`Destino de ${p.tarea.titulo}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MANTENER}>{p.tarea.enCola ? 'Mantener (se pospone)' : 'Mantener (coordinar después)'}</SelectItem>
                    {(['equipo', 'auxiliar', 'jefe'] as const).map((motivo) => {
                      const grupo = p.candidatos.filter((c) => c.motivo === motivo)
                      if (grupo.length === 0) return null
                      return (
                        <SelectGroup key={motivo}>
                          <SelectLabel>{NOMBRE_MOTIVO_CANDIDATO[motivo]}</SelectLabel>
                          {grupo.map((c) => (
                            <SelectItem key={c.usuario.id} value={c.usuario.id} disabled={!p.tarea.enCola && !c.disponible && Boolean(c.aviso?.startsWith('No'))}>
                              <OpcionCandidato c={c} enCola={p.tarea.enCola} />
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )
                    })}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void confirmar()} disabled={cambios.length === 0 || aplicar.isPending}>
            {aplicar.isPending && <Loader2 className="animate-spin" />}
            Reasignar {cambios.length > 0 && `(${cambios.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
      {apoyoDe && <DialogoApoyo tareaId={apoyoDe} onCerrar={() => setApoyoDe(null)} />}
    </Dialog>
  )
}

function OpcionCandidato({ c, enCola }: { c: CandidatoReasignacion; enCola: boolean }) {
  if (enCola && c.resultado) {
    return (
      <span className="flex items-center gap-1.5">
        <PuntoSemaforo semaforo={c.resultado.semaforo} dias={c.resultado.holguraDias} fin={c.resultado.fin} />
        {nombreCompleto(c.usuario)}
        <span className="text-xs text-muted-foreground">{c.resultado.fin ? `termina ${formatearFechaHora(c.resultado.fin)}` : 'sin fecha'}</span>
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className={c.disponible ? 'size-2 rounded-full bg-green-500' : 'size-2 rounded-full bg-amber-500'} aria-hidden="true" />
      {nombreCompleto(c.usuario)}
      <span className="text-xs text-muted-foreground">{c.disponible ? 'libre a esa hora' : (c.aviso ?? 'ocupado')}</span>
    </span>
  )
}
