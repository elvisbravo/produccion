import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ApiError } from '@/lib/api'
import { duracion } from '@/lib/formato'
import { usePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { tiempoActivoQuery, useIniciarCronometro, usePausarCronometro } from '../api'

/** Segundos transcurridos desde un instante, actualizados cada segundo. */
export function useTranscurrido(desde: string | null | undefined): number {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    if (!desde) return
    const id = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [desde])
  return desde ? Math.max(0, Math.floor((ahora - Date.parse(desde)) / 1000)) : 0
}

/** 1:05:09 */
export const reloj = (segundos: number) => {
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  const s = segundos % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const mensaje = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo guardar')

/** En el encabezado: lo que está corriendo ahora, con el tiempo en vivo y el botón de pausa. */
export function CronometroActivo() {
  const puede = usePermiso('tareas.ver')
  const { data: activo } = useQuery({ ...tiempoActivoQuery, enabled: puede })
  const pausar = usePausarCronometro()
  const navigate = useNavigate()
  const segundos = useTranscurrido(activo?.inicio)
  if (!activo) return null
  const total = activo.minutosPrevios + Math.floor(segundos / 60)
  const pasado = total > activo.minutosEstimados

  return (
    <div className="flex max-w-[min(22rem,55vw)] items-center gap-1 rounded-full border bg-card py-0.5 pr-0.5 pl-3 text-sm">
      <span className="relative flex size-2 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ backgroundColor: activo.tarea.color }} />
        <span className="relative inline-flex size-2 rounded-full" style={{ backgroundColor: activo.tarea.color }} />
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => void navigate({ href: activo.tarea.enlace })} className="ml-1.5 min-w-0 truncate text-left hover:underline">
            {activo.tarea.titulo}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{activo.tarea.titulo}</p>
          {activo.tarea.referencia && <p>{activo.tarea.referencia}</p>}
          <p>
            Llevas {duracion(total)} de {duracion(activo.minutosEstimados)} estimadas
          </p>
        </TooltipContent>
      </Tooltip>
      <span className={cn('ml-1 font-mono text-xs tabular-nums', pasado ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>{reloj(segundos)}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full"
        aria-label="Pausar cronómetro"
        disabled={pausar.isPending}
        onClick={() => pausar.mutate(activo.tarea.id, { onError: (err) => toast.error(mensaje(err)) })}
      >
        {pausar.isPending ? <Loader2 className="animate-spin" /> : <Pause />}
      </Button>
    </div>
  )
}

/** Botón ▶ / ⏸ para una tarea (para quien la realiza). */
export function BotonCronometro({ tareaId, enCurso, compacto }: { tareaId: string; enCurso: boolean; compacto?: boolean }) {
  const iniciar = useIniciarCronometro()
  const pausar = usePausarCronometro()
  const ocupado = iniciar.isPending || pausar.isPending
  const alternar = () =>
    enCurso
      ? pausar.mutate(tareaId, { onError: (err) => toast.error(mensaje(err)) })
      : iniciar.mutate(tareaId, { onError: (err) => toast.error(mensaje(err)) })
  return (
    <Button
      size={compacto ? 'icon-sm' : 'sm'}
      variant={enCurso ? 'secondary' : 'outline'}
      onClick={alternar}
      disabled={ocupado}
      aria-label={enCurso ? 'Pausar cronómetro' : 'Iniciar cronómetro'}
      className={cn(enCurso && 'text-green-700 dark:text-green-400')}
    >
      {ocupado ? <Loader2 className="animate-spin" /> : enCurso ? <Pause /> : <Play />}
      {!compacto && (enCurso ? 'Pausar' : 'Iniciar')}
    </Button>
  )
}

/** "1 h 30 min de 6 h": los tramos cerrados más el que está corriendo, en vivo. */
export function TiempoTarea({ minutosReales, minutosEstimados, enCursoDesde, className }: { minutosReales: number; minutosEstimados: number; enCursoDesde?: string | null; className?: string }) {
  const segundos = useTranscurrido(enCursoDesde)
  const real = minutosReales + Math.floor(segundos / 60)
  if (real === 0 && !enCursoDesde) return null
  return (
    <span className={cn('tabular-nums', real > minutosEstimados ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground', className)}>
      {duracion(real)} de {duracion(minutosEstimados)}
    </span>
  )
}
