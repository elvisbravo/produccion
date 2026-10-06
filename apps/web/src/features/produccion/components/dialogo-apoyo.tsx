import { NOMBRE_MOTIVO_CANDIDATO, type ApoyoTarea, type CandidatoApoyo } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ArrowRight, Clock, HandCoins, Loader2, Timer } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Can } from '@/components/can'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { duracion, formatearFecha, formatearFechaHora, nombreCompleto } from '@/lib/formato'
import { apoyoQuery, useProponerApoyo, useReasignarTarea } from '../api-contingencias'
import { describirHolgura, PuntoSemaforo } from './insignias'

const mensaje = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo completar la acción')

/**
 * Cuando una tarea no llega: quién puede tomarla y con qué. En horario normal se pasa de inmediato; con horas extra o un bono,
 * la persona acepta, se aprueba y recién entonces la tarea pasa a su cola.
 */
export function DialogoApoyo({ tareaId, onCerrar }: { tareaId: string; onCerrar: () => void }) {
  const { data, isPending, error } = useQuery(apoyoQuery(tareaId))

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Buscar apoyo{data && `: ${data.tarea.titulo}`}</DialogTitle>
          <DialogDescription>
            Quiénes pueden tomar esta tarea, en este orden: el equipo del trabajo, otros auxiliares y los jefes de producción. Si en horario normal no llega a su fecha, se sugieren horas extra o un bono.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{mensaje(error)}</AlertDescription>
          </Alert>
        )}
        {isPending && <Skeleton className="h-56" />}
        {data && <Contenido apoyo={data} onListo={onCerrar} />}
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Contenido({ apoyo, onListo }: { apoyo: ApoyoTarea; onListo: () => void }) {
  const { tarea, actual } = apoyo
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3 text-sm">
        <span className="font-medium">
          {tarea.titulo} <span className="font-normal text-muted-foreground">· {duracion(tarea.minutos)}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {tarea.referencia && <span className="font-mono">{tarea.referencia.codigo}</span>}
          {tarea.fechaLimite && ` · vence el ${formatearFecha(tarea.fechaLimite)}`} · hoy la tiene {nombreCompleto(apoyo.responsable)}
        </span>
        <span className="flex items-center gap-1.5 text-xs">
          <PuntoSemaforo semaforo={actual.semaforo} dias={actual.holguraDias} fin={actual.fin} />
          <span className={actual.semaforo === 'rojo' || actual.semaforo === 'sin_plan' ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground'}>{describirHolgura(actual.semaforo, actual.holguraDias)}</span>
        </span>
      </div>
      {apoyo.candidatos.length === 0 ? (
        <Alert>
          <AlertCircle />
          <AlertTitle>Nadie más puede tomarla</AlertTitle>
          <AlertDescription>Ninguna otra persona tiene un rol permitido para esta actividad. Revisa los roles en Configuración → Catálogos → Actividades.</AlertDescription>
        </Alert>
      ) : (
        <ul className="flex flex-col gap-3">
          {apoyo.candidatos.map((c) => (
            <Candidato key={c.usuario.id} tareaId={tarea.id} trabajoTitulo={tarea.titulo} candidato={c} onListo={onListo} />
          ))}
        </ul>
      )}
    </div>
  )
}

function Candidato({ tareaId, trabajoTitulo, candidato: c, onListo }: { tareaId: string; trabajoTitulo: string; candidato: CandidatoApoyo; onListo: () => void }) {
  const reasignar = useReasignarTarea(tareaId)
  const proponer = useProponerApoyo(tareaId)
  const [pasando, setPasando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verBono, setVerBono] = useState(false)
  const [monto, setMonto] = useState('')
  const [extra, setExtra] = useState({ fecha: c.horasExtra?.fecha ?? '', horaInicio: c.horasExtra?.horaInicio ?? '', horaFin: c.horasExtra?.horaFin ?? '' })
  const nombre = nombreCompleto(c.usuario)

  const pasar = async () => {
    setError(null)
    try {
      await reasignar.mutateAsync({ usuarioId: c.usuario.id, motivo: 'Apoyo por falta de disponibilidad' })
      toast.success(`La tarea pasó a ${nombre}`)
      onListo()
    } catch (err) {
      setError(mensaje(err))
    }
  }
  const proponerHoras = async () => {
    setError(null)
    try {
      await proponer.mutateAsync({ usuarioId: c.usuario.id, modalidad: 'horas_extra', ...extra, descripcion: `Apoyo: ${trabajoTitulo}` })
      toast.success(`Propuesta enviada a ${nombre}: la tarea le pasa cuando acepte y se apruebe`)
      onListo()
    } catch (err) {
      setError(mensaje(err))
    }
  }
  const proponerBono = async () => {
    setError(null)
    try {
      await proponer.mutateAsync({ usuarioId: c.usuario.id, modalidad: 'bono', monto, descripcion: `Apoyo: ${trabajoTitulo}` })
      toast.success(`Bono propuesto a ${nombre}: la tarea le pasa cuando acepte y se apruebe`)
      onListo()
    } catch (err) {
      setError(mensaje(err))
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{nombre}</span>
        <Badge variant="outline">{NOMBRE_MOTIVO_CANDIDATO[c.motivo]}</Badge>
        {c.llegaEnHorario && <Badge className="bg-green-600 text-white hover:bg-green-600">Llega en horario normal</Badge>}
      </div>
      {c.aviso && <p className="text-xs text-amber-700 dark:text-amber-400">{c.aviso}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 text-xs">
          <Clock className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">En horario normal:</span>
          <PuntoSemaforo semaforo={c.horario.semaforo} dias={c.horario.holguraDias} fin={c.horario.fin} />
          <span>{c.horario.fin ? `termina ${formatearFechaHora(c.horario.fin)}` : 'no entra en la agenda'}</span>
          <span className="text-muted-foreground">· {describirHolgura(c.horario.semaforo, c.horario.holguraDias)}</span>
        </span>
        {!c.aviso?.includes('jefe responsable') && (
          <Can permiso="programacion.reasignar">
            {pasando ? (
              <Button size="sm" onClick={() => void pasar()} disabled={reasignar.isPending}>
                {reasignar.isPending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                Confirmar: pasársela ahora
              </Button>
            ) : (
              <Button size="sm" variant={c.llegaEnHorario ? 'default' : 'outline'} onClick={() => setPasando(true)}>
                <ArrowRight />
                Pasársela en horario normal
              </Button>
            )}
          </Can>
        )}
      </div>

      {!c.llegaEnHorario && !c.aviso?.includes('jefe responsable') && (
        <Can permiso="programacion.proponer_extra">
          <div className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
            {c.horasExtra ? (
              <>
                <p className="flex items-start gap-1.5 text-sm">
                  <Timer className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Faltarían <strong>{duracion(c.horasExtra.faltanMinutos)}</strong> para llegar a la fecha límite.{' '}
                    {c.horasExtra.cubreTodo ? 'Una ventana de horas extra lo cubre:' : `Esta ventana cubre ${duracion(c.horasExtra.minutos)}; haría falta repetirla otro día:`}
                  </span>
                </p>
                <div className="grid gap-2 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end">
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Día
                    <Input type="date" min={new Date().toISOString().slice(0, 10)} value={extra.fecha} onChange={(e) => setExtra((x) => ({ ...x, fecha: e.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Desde
                    <Input type="time" value={extra.horaInicio} onChange={(e) => setExtra((x) => ({ ...x, horaInicio: e.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Hasta
                    <Input type="time" value={extra.horaFin} onChange={(e) => setExtra((x) => ({ ...x, horaFin: e.target.value }))} />
                  </label>
                  <Button size="sm" onClick={() => void proponerHoras()} disabled={proponer.isPending}>
                    {proponer.isPending ? <Loader2 className="animate-spin" /> : <Timer />}
                    Proponer horas extra
                  </Button>
                </div>
                {c.horasExtra.avisos.length > 0 && (
                  <ul className="list-disc pl-5 text-xs text-amber-700 dark:text-amber-400">
                    {c.horasExtra.avisos.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No hay un día disponible para horas extra antes de la fecha límite (ausencias o ya está al tope). Puedes probar con un bono.</p>
            )}
            {verBono ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Monto del bono (S/)
                  <Input type="number" inputMode="decimal" min={1} step="0.01" className="w-36" value={monto} onChange={(e) => setMonto(e.target.value)} />
                </label>
                <Button size="sm" onClick={() => void proponerBono()} disabled={proponer.isPending || !monto}>
                  {proponer.isPending ? <Loader2 className="animate-spin" /> : <HandCoins />}
                  Proponer bono
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="w-fit" onClick={() => setVerBono(true)}>
                <HandCoins />O proponer un bono
              </Button>
            )}
            <p className="text-xs text-muted-foreground">La persona acepta o rechaza; cuando se aprueba, la tarea pasa a su cola. Mientras tanto la sigue teniendo su dueño.</p>
          </div>
        </Can>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </li>
  )
}
