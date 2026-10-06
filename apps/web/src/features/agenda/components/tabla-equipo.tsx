import { NOMBRE_ESTADO_DIA, type AgendaPersona, type DiaAgenda, type ReunionPorAsignarAgenda } from '@grupoes/shared'
import { Link } from '@tanstack/react-router'
import { CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { nombreCompleto } from '@/lib/formato'
import { cabeceraDia, horas } from '../semanas'
import { COLOR_ESTADO_DIA } from './insignias'

interface Props {
  personas: AgendaPersona[]
  /** Reuniones con día y hora que aún esperan responsable. */
  porAsignar?: ReunionPorAsignarAgenda[]
  hoy: string
  onElegir: (persona: AgendaPersona) => void
}

/** Carga de cada persona día por día. Al tocar una fila se abre su semana. */
export function TablaEquipo({ personas, porAsignar = [], hoy, onElegir }: Props) {
  const dias = personas[0]?.dias.map((d) => d.fecha) ?? []
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th className="w-52 px-3 py-2 text-left font-medium text-muted-foreground">Persona</th>
            {dias.map((d) => (
              <th key={d} className={cn('px-2 py-2 text-left font-medium capitalize', d === hoy ? 'text-primary' : 'text-muted-foreground')}>
                {cabeceraDia(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {porAsignar.length > 0 && (
            <tr className="border-b bg-amber-50/60 dark:bg-amber-950/20">
              <td className="px-3 py-2">
                <Link to="/reuniones" className="flex flex-col hover:underline">
                  <span className="font-medium">Por asignar</span>
                  <span className="text-xs text-muted-foreground">Reuniones sin responsable</span>
                </Link>
              </td>
              {dias.map((d) => {
                const delDia = porAsignar.filter((r) => r.fecha === d)
                return (
                  <td key={d} className={cn('p-1 align-top', d === hoy && 'bg-primary/5')}>
                    {delDia.length > 0 && (
                      <Link
                        to="/reuniones"
                        className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-100 px-2 py-1.5 text-xs text-amber-950 hover:bg-amber-200 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-50"
                        title="Programar quién la hace"
                      >
                        {delDia.map((r) => (
                          <span key={r.tarea.id} className="flex items-center gap-1 whitespace-nowrap tabular-nums">
                            <CalendarClock className="size-3 shrink-0" />
                            {r.tarea.inicio !== null ? `${String(Math.floor(r.tarea.inicio / 60)).padStart(2, '0')}:${String(r.tarea.inicio % 60).padStart(2, '0')}` : ''} {r.tarea.actividad}
                          </span>
                        ))}
                      </Link>
                    )}
                  </td>
                )
              })}
            </tr>
          )}
          {personas.map((p) => (
            <tr key={p.usuario.id} className="border-b last:border-b-0">
              <td className="px-3 py-2">
                <button type="button" onClick={() => onElegir(p)} className="flex flex-col text-left hover:underline">
                  <span className="font-medium">{nombreCompleto(p.usuario)}</span>
                  <span className="text-xs text-muted-foreground">{p.roles.join(', ')}</span>
                </button>
              </td>
              {p.dias.map((d) => (
                <td key={d.fecha} className={cn('p-1', d.fecha === hoy && 'bg-primary/5')}>
                  <Celda dia={d} onClick={() => onElegir(p)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Celda({ dia, onClick }: { dia: DiaAgenda; onClick: () => void }) {
  const color = COLOR_ESTADO_DIA[dia.estado]
  const bloqueo = dia.bloqueos.find((b) => !b.intervalo)
  const porcentaje = dia.capacidad > 0 ? Math.min(100, (dia.ocupado / dia.capacidad) * 100) : 0
  const texto =
    dia.estado === 'no_laborable'
      ? (bloqueo?.nombre ?? dia.bloqueos.map((b) => b.nombre).join(', '))
      : dia.estado === 'descanso'
        ? dia.ocupado > 0
          ? `${horas(dia.ocupado)} (extra)`
          : 'Descanso'
        : `${horas(dia.ocupado)} / ${horas(dia.capacidad)}`

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${NOMBRE_ESTADO_DIA[dia.estado]}${dia.bloqueos.length ? ` · ${dia.bloqueos.map((b) => b.nombre).join(', ')}` : ''}`}
      className={cn(
        'flex w-full flex-col gap-1.5 rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-muted/60',
        dia.estado === 'no_laborable' && 'border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/50',
        dia.estado === 'descanso' && 'border-transparent bg-muted/40',
      )}
    >
      <span className={cn('truncate text-xs tabular-nums', dia.estado === 'no_laborable' ? 'font-medium text-violet-900 dark:text-violet-200' : 'text-muted-foreground')}>
        {texto}
      </span>
      {dia.capacidad > 0 && (
        <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <span className={cn('block h-full rounded-full', color.barra)} style={{ width: `${Math.max(porcentaje, dia.ocupado > 0 ? 6 : 0)}%` }} />
        </span>
      )}
      {dia.bloqueos.some((b) => b.intervalo) && dia.estado !== 'no_laborable' && (
        <span className="truncate text-[11px] text-violet-800 dark:text-violet-300">{dia.bloqueos.filter((b) => b.intervalo).map((b) => b.nombre).join(', ')}</span>
      )}
    </button>
  )
}
