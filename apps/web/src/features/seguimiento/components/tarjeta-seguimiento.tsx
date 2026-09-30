import { enlaceWhatsapp, formatearCelular, type TarjetaSeguimiento } from '@grupoes/shared'
import { Link } from '@tanstack/react-router'
import { CalendarClock, CircleAlert, MessageCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { InsigniaTemperatura } from '@/features/prospectos/components/insignias'
import { describirCuando, nombreCompleto } from '@/lib/formato'
import { iniciales } from '@/lib/menu'
import { cn } from '@/lib/utils'

/** Estado del próximo paso de un prospecto (para colorear y filtrar). */
export type EstadoSeguimiento = 'vencido' | 'hoy' | 'proximo' | 'sin'

export function estadoSeguimiento(p: TarjetaSeguimiento, hoy: string): EstadoSeguimiento {
  if (!p.proxima) return 'sin'
  if (p.proxima.vencida) return 'vencido'
  return p.proxima.fecha === hoy ? 'hoy' : 'proximo'
}

const ESTILO_PROXIMA: Record<EstadoSeguimiento, string> = {
  vencido: 'bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-200',
  hoy: 'bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200',
  proximo: 'bg-muted text-foreground/80',
  sin: 'bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200',
}

export function ProximoPaso({ p, hoy }: { p: TarjetaSeguimiento; hoy: string }) {
  const estado = estadoSeguimiento(p, hoy)
  return (
    <div className={cn('flex items-center gap-1.5 rounded-md px-2 py-1 text-xs', ESTILO_PROXIMA[estado])}>
      {p.proxima ? <CalendarClock className="size-3.5 shrink-0" /> : <CircleAlert className="size-3.5 shrink-0" />}
      <span className="truncate">
        {p.proxima
          ? `${estado === 'vencido' ? 'Vencido · ' : ''}${describirCuando(p.proxima, hoy)} · ${p.proxima.actividad}${p.proxima.estado === 'por_asignar' ? ' (por asignar)' : ''}`
          : 'Sin próximo seguimiento'}
      </span>
    </div>
  )
}

interface Props {
  p: TarjetaSeguimiento
  hoy: string
  arrastrando?: boolean
}

export function Tarjeta({ p, hoy, arrastrando }: Props) {
  const contacto = p.contactoPrincipal
  return (
    <article
      className={cn(
        'group relative flex flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground shadow-xs transition-shadow hover:border-foreground/25',
        arrastrando && 'rotate-1 shadow-lg ring-2 ring-ring/40',
      )}
    >
      <div className="flex items-center gap-2">
        <Link
          to="/prospectos/$id"
          params={{ id: p.id }}
          className="font-mono text-xs text-muted-foreground after:absolute after:inset-0 hover:text-foreground"
          draggable={false}
        >
          {p.codigo}
        </Link>
        <span className="ml-auto">
          <InsigniaTemperatura temperatura={p.temperatura} />
        </span>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold">
          {p.tipoTrabajo}
          {p.nivelAcademico && <span className="font-normal text-muted-foreground"> · {p.nivelAcademico}</span>}
        </span>
        <span className="truncate text-sm">
          {nombreCompleto(contacto) ?? (contacto ? formatearCelular(contacto.celular) : '—')}
          {p.totalContactos > 1 && <span className="text-muted-foreground"> +{p.totalContactos - 1}</span>}
        </span>
        {(p.universidad || p.carrera) && (
          <span className="truncate text-xs text-muted-foreground">{[p.universidad, p.carrera].filter(Boolean).join(' · ')}</span>
        )}
      </div>
      <ProximoPaso p={p} hoy={hoy} />
      <div className="flex items-center gap-2">
        <span
          className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold"
          title={`Responsable: ${nombreCompleto(p.responsable)}`}
        >
          {iniciales(p.responsable.nombres, p.responsable.apellidos)}
        </span>
        {p.intentosSinRespuesta > 0 && (
          <Badge variant="outline" className="text-[11px] text-muted-foreground">
            {p.intentosSinRespuesta} sin respuesta
          </Badge>
        )}
        {contacto && (
          <a
            href={enlaceWhatsapp(contacto.celular)}
            target="_blank"
            rel="noreferrer"
            draggable={false}
            aria-label={`Abrir WhatsApp de ${nombreCompleto(contacto) ?? contacto.celular}`}
            className="relative z-10 ml-auto flex size-7 items-center justify-center rounded-md border text-green-700 hover:bg-muted dark:text-green-400"
          >
            <MessageCircle className="size-3.5" />
          </a>
        )}
      </div>
    </article>
  )
}
