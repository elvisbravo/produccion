import type { BloqueCarga, TrabajoCarga } from '@grupoes/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AlertCircle, Loader2, Sparkles, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ApiError } from '@/lib/api'
import { duracion, formatearFecha, formatearFechaHora, nombreCompleto } from '@/lib/formato'
import { cargaQuery, impactoCargaQuery, useAplicarCarga } from '../api-contingencias'
import { PuntoSemaforo } from './insignias'

const MANTENER = 'mantener'
const VARIOS = 'varios'
const claveDe = (trabajoId: string, b: BloqueCarga) => `${trabajoId}|${b.entregableId ?? ''}`

/**
 * Cuando una persona pasa a otras actividades: elige qué trabajos de su cola pasan a otro auxiliar. Cada trabajo completo va
 * a una sola persona (se puede dividir por entregable). Lo ya trabajado queda a su nombre; a quien lo recibe solo le falta lo restante.
 */
export function DialogoCarga({ usuarioId, onCerrar }: { usuarioId: string; onCerrar: () => void }) {
  const { data, isPending, error } = useQuery(cargaQuery(usuarioId))
  const aplicar = useAplicarCarga(usuarioId)
  const [elegidos, setElegidos] = useState<Record<string, string>>({})
  const [divididos, setDivididos] = useState<Set<string>>(new Set())
  const [motivo, setMotivo] = useState('')
  const [errorAplicar, setErrorAplicar] = useState<string | null>(null)

  const destinoDe = (trabajoId: string, b: BloqueCarga) => elegidos[claveDe(trabajoId, b)] ?? MANTENER
  const reparto = useMemo(
    () =>
      (data?.trabajos ?? []).flatMap((t) =>
        t.bloques.flatMap((b) => {
          const usuarioDestino = elegidos[claveDe(t.trabajo.id, b)] ?? MANTENER
          return usuarioDestino === MANTENER ? [] : [{ trabajoId: t.trabajo.id, entregableId: b.entregableId, usuarioId: usuarioDestino }]
        }),
      ),
    [data, elegidos],
  )
  const impacto = useQuery({ ...impactoCargaQuery(usuarioId, reparto), enabled: reparto.length > 0, placeholderData: keepPreviousData })

  const elegirTrabajo = (t: TrabajoCarga, valor: string) =>
    setElegidos((x) => ({ ...x, ...Object.fromEntries(t.bloques.map((b) => [claveDe(t.trabajo.id, b), valor])) }))
  const usarSugerencias = () => {
    const nuevo: Record<string, string> = {}
    for (const t of data?.trabajos ?? []) for (const b of t.bloques) if (b.sugerido) nuevo[claveDe(t.trabajo.id, b)] = b.sugerido.id
    setElegidos(nuevo)
    setDivididos(new Set((data?.trabajos ?? []).filter((t) => new Set(t.bloques.map((b) => b.sugerido?.id)).size > 1).map((t) => t.trabajo.id)))
  }
  const alternarDividir = (t: TrabajoCarga) =>
    setDivididos((d) => {
      const n = new Set(d)
      if (n.has(t.trabajo.id)) n.delete(t.trabajo.id)
      else n.add(t.trabajo.id)
      return n
    })

  const confirmar = async () => {
    setErrorAplicar(null)
    try {
      const r = await aplicar.mutateAsync({ reparto, motivo: motivo.trim() || undefined })
      toast.success(`${r.tareas} ${r.tareas === 1 ? 'tarea pasó' : 'tareas pasaron'} a otras personas`)
      onCerrar()
    } catch (err) {
      setErrorAplicar(err instanceof ApiError ? err.message : 'No se pudo reasignar')
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Reasignar la carga{data && ` de ${nombreCompleto(data.usuario)}`}</DialogTitle>
          <DialogDescription>
            Elige qué trabajos pasan a otro auxiliar; los que no elijas se quedan con esta persona. Cada trabajo va completo a una sola persona (puedes dividirlo por entregable). Lo que ya trabajó queda a su nombre y quien lo recibe solo
            hace lo que falta, al final de su cola.
          </DialogDescription>
        </DialogHeader>
        {(error || errorAplicar) && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{errorAplicar ?? (error instanceof Error ? error.message : 'No se pudo cargar')}</AlertDescription>
          </Alert>
        )}
        {isPending ? (
          <Skeleton className="h-56" />
        ) : data && data.trabajos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tiene trabajos pendientes en su cola.</p>
        ) : (
          data && (
            <div className="flex flex-col gap-4">
              <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" onClick={usarSugerencias}>
                  <Sparkles />
                  Usar la sugerencia para todos
                </Button>
              </div>
              <ul className="flex flex-col divide-y rounded-lg border">
                {data.trabajos.map((t) => {
                  const dividido = divididos.has(t.trabajo.id)
                  const valores = new Set(t.bloques.map((b) => destinoDe(t.trabajo.id, b)))
                  const valorTrabajo = valores.size === 1 ? [...valores][0] : VARIOS
                  return (
                    <li key={t.trabajo.id} className="flex flex-col gap-2 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex flex-wrap items-center gap-2 font-medium">
                            <span className="font-mono text-sm">{t.trabajo.codigo}</span>
                            {t.trabajo.titulo && <span className="truncate">{t.trabajo.titulo}</span>}
                          </span>
                          <span className="text-xs text-muted-foreground">Entrega el {formatearFecha(t.trabajo.fechaLimite)}</span>
                          <Resumen bloques={t.bloques} />
                        </div>
                        {!dividido && (
                          <Selector
                            valor={valorTrabajo}
                            elegibles={t.elegibles}
                            sugeridoId={t.sugerido?.id}
                            etiqueta={`Destino de ${t.trabajo.codigo}`}
                            onCambio={(v) => elegirTrabajo(t, v)}
                          />
                        )}
                      </div>
                      {t.bloques.length > 1 && (
                        <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
                          <Switch checked={dividido} onCheckedChange={() => alternarDividir(t)} />
                          Dividir por entregable
                        </label>
                      )}
                      {dividido && (
                        <ul className="flex flex-col gap-2 rounded-md bg-muted/40 p-2">
                          {t.bloques.map((b) => (
                            <li key={claveDe(t.trabajo.id, b)} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <div className="flex min-w-0 flex-1 flex-col text-sm">
                                <span className="font-medium">{b.nombre}</span>
                                <Resumen bloques={[b]} />
                              </div>
                              <Selector
                                valor={destinoDe(t.trabajo.id, b)}
                                elegibles={b.elegibles}
                                sugeridoId={b.sugerido?.id}
                                etiqueta={`Destino de ${b.nombre}`}
                                onCambio={(v) => setElegidos((x) => ({ ...x, [claveDe(t.trabajo.id, b)]: v }))}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>

              {reparto.length > 0 && (
                <section className="flex flex-col gap-2 rounded-lg border p-3" aria-live="polite">
                  <h3 className="text-sm font-medium">Cómo queda en la cola de quien recibe</h3>
                  {!impacto.data ? (
                    <Skeleton className="h-16" />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {impacto.data.personas.map((p) => (
                        <li key={p.usuario.id} className="flex flex-col gap-1 text-sm">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{nombreCompleto(p.usuario)}</span>
                            <span className="text-xs text-muted-foreground">
                              recibe {p.tareas.length} {p.tareas.length === 1 ? 'tarea' : 'tareas'} · {duracion(p.minutos)}
                            </span>
                            {p.sinLlegar > 0 && (
                              <Badge variant="destructive" className="gap-1">
                                <TriangleAlert className="size-3" />
                                {p.sinLlegar} no {p.sinLlegar === 1 ? 'llega' : 'llegan'} a su fecha
                              </Badge>
                            )}
                          </span>
                          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                            {p.tareas.map((tr) => (
                              <li key={tr.tareaId} className="flex items-center gap-1.5">
                                <PuntoSemaforo semaforo={tr.resultado.semaforo} dias={tr.resultado.holguraDias} fin={tr.resultado.fin} />
                                <span className="font-mono">{tr.trabajoCodigo}</span> {tr.titulo}
                                {tr.resultado.fin ? ` · termina ${formatearFechaHora(tr.resultado.fin)}` : ' · no entra en la agenda'}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              <label className="flex flex-col gap-1 text-sm">
                Motivo (opcional)
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: pasa a atender otras actividades" maxLength={300} />
              </label>
            </div>
          )
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void confirmar()} disabled={reparto.length === 0 || aplicar.isPending}>
            {aplicar.isPending && <Loader2 className="animate-spin" />}
            Pasar {reparto.length > 0 && `(${reparto.length} ${reparto.length === 1 ? 'entregable' : 'entregables'})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Cuánto falta y cuánto ya se trabajó. */
function Resumen({ bloques }: { bloques: BloqueCarga[] }) {
  const faltan = bloques.reduce((s, b) => s + b.minutosFaltan, 0)
  const hechos = bloques.reduce((s, b) => s + b.minutosHechos, 0)
  const tareas = bloques.reduce((s, b) => s + b.tareas, 0)
  const peor = (['sin_plan', 'rojo', 'ambar', 'verde'] as const).find((x) => bloques.some((b) => b.semaforo === x)) ?? 'verde'
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      <PuntoSemaforo semaforo={peor} />
      {tareas} {tareas === 1 ? 'tarea' : 'tareas'} · falta {duracion(faltan)}
      {hechos > 0 && <span>· ya trabajó {duracion(hechos)}</span>}
      {bloques.some((b) => b.enProceso) && <Badge variant="outline">En proceso</Badge>}
    </span>
  )
}

function Selector({
  valor,
  elegibles,
  sugeridoId,
  etiqueta,
  onCambio,
}: {
  valor: string
  elegibles: { id: string; nombres: string; apellidos: string }[]
  sugeridoId: string | undefined
  etiqueta: string
  onCambio: (v: string) => void
}) {
  return (
    <Select value={valor} onValueChange={onCambio}>
      <SelectTrigger className="w-full sm:w-64" aria-label={etiqueta}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={MANTENER}>Se queda con ella o él</SelectItem>
        {valor === VARIOS && (
          <SelectItem value={VARIOS} disabled>
            Varias personas (dividido)
          </SelectItem>
        )}
        {elegibles.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {nombreCompleto(c)}
            {c.id === sugeridoId && ' · sugerido'}
          </SelectItem>
        ))}
        {elegibles.length === 0 && (
          <SelectItem value="nadie" disabled>
            Nadie puede tomarlo completo
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  )
}
