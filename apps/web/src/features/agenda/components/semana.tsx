import { NOMBRE_ESTADO_TAREA, type DiaAgenda, type TareaAgenda } from '@grupoes/shared'
import { Link } from '@tanstack/react-router'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { cabeceraDia, horaCorta, horas } from '../semanas'
import { InsigniaEstadoDia } from './insignias'

const PX_POR_HORA = 44
const RAYADO = 'bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--color-violet-500)_6px_7px)] opacity-25'

/** Reparte en carriles las tareas que se cruzan, para mostrarlas lado a lado. */
function carriles(tareas: TareaAgenda[]): Map<string, { carril: number; total: number }> {
  const resultado = new Map<string, { carril: number; total: number }>()
  const ordenadas = [...tareas].sort((a, b) => a.inicio! - b.inicio! || b.fin! - a.fin!)
  let grupo: string[] = []
  let finales: number[] = []
  let finGrupo = -1
  const cerrar = () => {
    for (const id of grupo) resultado.get(id)!.total = finales.length
    grupo = []
    finales = []
  }
  for (const t of ordenadas) {
    if (t.inicio! >= finGrupo) cerrar()
    let carril = finales.findIndex((fin) => fin <= t.inicio!)
    if (carril === -1) carril = finales.push(t.fin!) - 1
    else finales[carril] = t.fin!
    resultado.set(t.id, { carril, total: 1 })
    grupo.push(t.id)
    finGrupo = Math.max(finGrupo, t.fin!)
  }
  cerrar()
  return resultado
}

/** Semana de una persona: su horario, los días u horas no laborables y sus tareas. */
export function Semana({ dias, hoy }: { dias: DiaAgenda[]; hoy: string }) {
  const marcas = dias.flatMap((d) => [...d.tramos.flatMap((t) => [t.inicio, t.fin]), ...d.tareas.flatMap((t) => (t.inicio === null ? [] : [t.inicio, t.fin!]))])
  const desde = Math.floor(Math.min(7 * 60, ...marcas) / 60) * 60
  const hasta = Math.ceil(Math.max(20 * 60, ...marcas) / 60) * 60
  const alto = ((hasta - desde) / 60) * PX_POR_HORA
  const y = (minuto: number) => ((minuto - desde) / 60) * PX_POR_HORA
  const horasEje = Array.from({ length: (hasta - desde) / 60 }, (_, i) => desde + i * 60)

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <div className="grid min-w-[760px] grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
        {/* Cabeceras */}
        <div className="border-b" />
        {dias.map((d) => (
          <div key={d.fecha} className={cn('flex flex-col gap-1 border-b border-l p-2', d.fecha === hoy && 'bg-primary/5')}>
            <div className="flex items-center justify-between gap-1">
              <span className={cn('text-sm font-medium capitalize', d.fecha === hoy && 'text-primary')}>{cabeceraDia(d.fecha)}</span>
              {d.estado !== 'libre' && <InsigniaEstadoDia estado={d.estado} className="h-4 px-1.5 text-[10px]" />}
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {d.capacidad > 0 ? `${horas(d.ocupado)} de ${horas(d.capacidad)}` : d.bloqueos.map((b) => b.nombre).join(', ')}
            </span>
            {d.tareas
              .filter((t) => t.inicio === null)
              .map((t) => (
                <BloqueTarea key={t.id} tarea={t} className="truncate rounded px-1.5 py-0.5 text-xs" />
              ))}
          </div>
        ))}

        {/* Eje de horas */}
        <div className="relative" style={{ height: alto }}>
          {horasEje.map((m) => (
            <span key={m} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums" style={{ top: y(m) }}>
              {m > desde && horaCorta(m)}
            </span>
          ))}
        </div>

        {/* Días */}
        {dias.map((d) => {
          const total = d.bloqueos.find((b) => !b.intervalo)
          const conHora = d.tareas.filter((t) => t.inicio !== null)
          const posicion = carriles(conHora)
          return (
            <div key={d.fecha} className="relative border-l bg-muted/50" style={{ height: alto }}>
              {/* Horario (tiempo de trabajo) */}
              {d.tramos.map((t) => (
                <div key={t.inicio} className="absolute inset-x-0 bg-background" style={{ top: y(t.inicio), height: y(t.fin) - y(t.inicio) }} />
              ))}
              {horasEje.map((m) => (
                <div key={m} className="absolute inset-x-0 border-t border-dashed border-border/60" style={{ top: y(m) }} />
              ))}
              {/* Bloqueos */}
              {total ? (
                <>
                  <div className={cn('absolute inset-0', RAYADO)} />
                  <span className="absolute inset-x-1 top-2 rounded bg-violet-100 px-1.5 py-0.5 text-center text-xs font-medium text-violet-900 dark:bg-violet-950 dark:text-violet-200">
                    {total.nombre}
                  </span>
                </>
              ) : (
                d.bloqueos.map((b) => (
                  <div key={b.nombre} className="absolute inset-x-0" style={{ top: y(b.intervalo!.inicio), height: y(b.intervalo!.fin) - y(b.intervalo!.inicio) }}>
                    <div className={cn('absolute inset-0', RAYADO)} />
                    <span className="absolute inset-x-1 top-1 truncate text-center text-[11px] font-medium text-violet-900 dark:text-violet-200">{b.nombre}</span>
                  </div>
                ))
              )}
              {/* Tareas con hora */}
              {conHora.map((t) => {
                const { carril, total: carrilesDelGrupo } = posicion.get(t.id)!
                const ancho = 100 / carrilesDelGrupo
                return (
                  <BloqueTarea
                    key={t.id}
                    tarea={t}
                    className="absolute overflow-hidden rounded-md px-1.5 py-1 text-xs leading-tight"
                    style={{
                      top: y(t.inicio!) + 1,
                      height: Math.max(y(t.fin!) - y(t.inicio!) - 2, 18),
                      left: `calc(${carril * ancho}% + 2px)`,
                      width: `calc(${ancho}% - 4px)`,
                    }}
                    conHora
                  />
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BloqueTarea({ tarea: t, className, style, conHora }: { tarea: TareaAgenda; className?: string; style?: React.CSSProperties; conHora?: boolean }) {
  const hecha = t.estado !== 'pendiente' && t.estado !== 'en_proceso'
  const color = t.color ?? 'var(--color-zinc-500)'
  const contenido = (
    <>
      <span className={cn('block truncate font-medium', hecha && 'line-through')}>{t.actividad}</span>
      {conHora && (
        <span className="block truncate text-muted-foreground tabular-nums">
          {horaCorta(t.inicio!)}–{horaCorta(t.fin!)}
          {t.referencia && ` · ${t.referencia.nombre ?? t.referencia.codigo}`}
        </span>
      )}
    </>
  )
  const estilo: React.CSSProperties = {
    ...style,
    backgroundColor: `color-mix(in oklab, ${color} 16%, var(--background))`,
    borderLeft: `3px solid ${color}`,
  }
  const clases = cn('text-foreground', hecha && 'opacity-60', className)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {t.referencia ? (
          <Link to="/prospectos/$id" params={{ id: t.referencia.id }} className={cn(clases, 'hover:ring-2 hover:ring-ring/40')} style={estilo}>
            {contenido}
          </Link>
        ) : (
          <div className={clases} style={estilo}>
            {contenido}
          </div>
        )}
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium">{t.actividad}</p>
        <p>
          {t.inicio !== null ? `${horaCorta(t.inicio)}–${horaCorta(t.fin!)}` : `Sin hora fija · ${horas(t.minutos)}`} · {NOMBRE_ESTADO_TAREA[t.estado]}
        </p>
        {t.referencia && (
          <p>
            {t.referencia.codigo}
            {t.referencia.nombre && ` · ${t.referencia.nombre}`}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
