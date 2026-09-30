import { sumarDias } from '@grupoes/shared'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { describirSemana } from '../semanas'

interface Props {
  lunes: string
  lunesActual: string
  onCambiar: (lunes: string | undefined) => void
}

/** Semana anterior / siguiente / esta semana. `undefined` vuelve a la semana actual. */
export function NavegacionSemana({ lunes, lunesActual, onCambiar }: Props) {
  const ir = (dia: string) => onCambiar(dia === lunesActual ? undefined : dia)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center">
        <Button variant="outline" size="icon" className="rounded-r-none" onClick={() => ir(sumarDias(lunes, -7))} aria-label="Semana anterior">
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon" className="-ml-px rounded-l-none" onClick={() => ir(sumarDias(lunes, 7))} aria-label="Semana siguiente">
          <ChevronRight />
        </Button>
      </div>
      <Button variant="outline" onClick={() => ir(lunesActual)} disabled={lunes === lunesActual}>
        Esta semana
      </Button>
      <span className="text-sm font-medium">{describirSemana(lunes)}</span>
    </div>
  )
}
