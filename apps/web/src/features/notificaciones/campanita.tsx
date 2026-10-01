import { areaDe, type AreaNotificacion, type NotificacionItem } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  AlarmClock,
  Bell,
  BriefcaseBusiness,
  CalendarOff,
  CheckCheck,
  ClipboardList,
  Flame,
  PackageCheck,
  Timer,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { haceCuanto } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { bandejaNotificacionesQuery, useMarcarLeida, useMarcarTodas } from './api'

const ICONO: Record<AreaNotificacion, LucideIcon> = {
  tarea: ClipboardList,
  prospecto: UserRound,
  trabajo: BriefcaseBusiness,
  equipo: Users,
  entregable: PackageCheck,
  ausencia: CalendarOff,
  urgente: Flame,
  extra: Timer,
  cuota: Wallet,
  recordatorio: AlarmClock,
}

/** Campanita del encabezado: avisos recientes, no leídas y acceso directo a lo que corresponde. */
export function Campanita() {
  const { data } = useQuery(bandejaNotificacionesQuery)
  const [abierta, setAbierta] = useState(false)
  const leer = useMarcarLeida()
  const leerTodas = useMarcarTodas()
  const navigate = useNavigate()
  const noLeidas = data?.noLeidas ?? 0

  const abrir = (n: NotificacionItem) => {
    if (!n.leida) leer.mutate(n.id)
    setAbierta(false)
    if (n.enlace) void navigate({ href: n.enlace })
  }

  return (
    <Popover open={abierta} onOpenChange={setAbierta}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={noLeidas ? `Notificaciones: ${noLeidas} sin leer` : 'Notificaciones'}>
          <Bell />
          {noLeidas > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-none font-semibold text-white tabular-nums">
              {noLeidas > 9 ? '9+' : noLeidas}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-sm font-semibold">Notificaciones</span>
          {noLeidas > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => leerTodas.mutate()}>
              <CheckCheck />
              Marcar todas como leídas
            </Button>
          )}
        </div>
        {!data ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : data.items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">Aún no tienes avisos.</p>
        ) : (
          <ul className="max-h-[min(28rem,70svh)] divide-y overflow-y-auto">
            {data.items.map((n) => {
              const Icono = ICONO[areaDe(n.tipo)]
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => abrir(n)}
                    className={cn('flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60', !n.leida && 'bg-primary/5')}
                  >
                    <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted', areaDe(n.tipo) === 'urgente' && 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300')}>
                      <Icono className="size-3.5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={cn('text-sm leading-snug', !n.leida && 'font-medium')}>{n.titulo}</span>
                      {n.mensaje && <span className="line-clamp-2 text-xs text-muted-foreground">{n.mensaje}</span>}
                      <span className="text-[11px] text-muted-foreground">{haceCuanto(n.creadaEn)}</span>
                    </span>
                    {!n.leida && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Sin leer" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
