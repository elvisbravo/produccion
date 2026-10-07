import type { ImpactoReunion } from '@grupoes/shared'
import { TriangleAlert } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { formatearFechaHora, nombreCompleto } from '@/lib/formato'
import { cn } from '@/lib/utils'

/** Lo que exige confirmar el impacto: tareas que dejan de llegar a su fecha y trabajos de fechas inamovibles. */
export function resumenImpacto(impactos: ImpactoReunion[]) {
  return {
    seCorre: impactos.reduce((n, i) => n + i.tareas.length, 0),
    enRojo: impactos.reduce((n, i) => n + i.pasanARojo, 0),
    fijas: [...new Set(impactos.flatMap((i) => i.fijasAfectadas))],
  }
}

/**
 * Qué pasa en la cola de quien toma la reunión: se corren tareas (informativo) y, si alguna deja de llegar a su fecha límite
 * o hay un trabajo de fechas inamovibles, hay que aceptarlo expresamente. Solo aparece si algo se corre.
 */
export function AvisoImpacto({
  impactos,
  confirmado,
  onConfirmado,
  fijasAceptadas,
  onFijas,
  puedeForzarFijas,
}: {
  impactos: ImpactoReunion[]
  confirmado: boolean
  onConfirmado: (v: boolean) => void
  fijasAceptadas: boolean
  onFijas: (v: boolean) => void
  puedeForzarFijas: boolean
}) {
  const r = resumenImpacto(impactos)
  if (r.seCorre === 0) return null
  const conRiesgo = r.enRojo > 0 || r.fijas.length > 0
  return (
    <div className={cn('flex flex-col gap-2 rounded-md border p-3 text-sm', conRiesgo ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-50' : 'bg-muted/40')} aria-live="polite">
      <p className="flex items-start gap-2 font-medium">
        {conRiesgo && <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
        Con esta reunión se {r.seCorre === 1 ? 'corre 1 tarea' : `corren ${r.seCorre} tareas`} de su cola
        {r.enRojo > 0 && ` y ${r.enRojo === 1 ? '1 deja' : `${r.enRojo} dejan`} de llegar a su fecha límite`}.
      </p>
      {impactos
        .filter((i) => i.tareas.length > 0)
        .map((i) => (
          <div key={i.usuario.id} className="flex flex-col gap-0.5 text-xs">
            <span className="font-medium">{nombreCompleto(i.usuario)}</span>
            {i.tareas.slice(0, 6).map((t) => (
              <span key={t.tareaId} className={cn(t.pasaARojo && 'font-medium text-destructive')}>
                <span className="font-mono">{t.trabajoCodigo}</span> {t.titulo}: {t.finAntes ? formatearFechaHora(t.finAntes) : '—'} → {t.finDespues ? formatearFechaHora(t.finDespues) : 'fuera de plazo'}
                {t.urgente && ' · urgente'}
                {t.fechasFijas && ' · fechas inamovibles'}
                {t.pasaARojo && ' · ya no llega a su fecha límite'}
              </span>
            ))}
            {i.tareas.length > 6 && <span className="text-muted-foreground">y {i.tareas.length - 6} más</span>}
          </div>
        ))}
      {r.fijas.length > 0 && (
        <label className="flex items-start gap-2 text-xs">
          <Checkbox checked={fijasAceptadas} onCheckedChange={(v) => onFijas(v === true)} disabled={!puedeForzarFijas} className="mt-0.5" />
          <span>
            Acepto atrasar trabajos con fechas inamovibles ({r.fijas.join(', ')})
            {!puedeForzarFijas && <span className="block text-destructive">Solo quien puede fijar o liberar fechas puede aceptarlo: cambia la hora o elige a otra persona.</span>}
          </span>
        </label>
      )}
      {r.enRojo > 0 && (
        <label className="flex items-start gap-2 text-xs">
          <Checkbox checked={confirmado} onCheckedChange={(v) => onConfirmado(v === true)} className="mt-0.5" />
          <span>Entiendo que {r.enRojo === 1 ? 'esa tarea no llegará' : 'esas tareas no llegarán'} a su fecha límite; después puedo reordenar la cola o buscar apoyo.</span>
        </label>
      )}
    </div>
  )
}
