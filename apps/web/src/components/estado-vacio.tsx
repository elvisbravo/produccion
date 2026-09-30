import { Link } from '@tanstack/react-router'
import { SearchX } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  icono: ReactNode
  titulo: ReactNode
  texto: string
  accion?: ReactNode
  /** Muestra el botón "Volver al inicio" (páginas completas). */
  volverAlInicio?: boolean
}

export function EstadoVacio({ icono, titulo, texto, accion, volverAlInicio = false }: Props) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl border bg-muted/40 [&_svg]:size-5">{icono}</div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">{titulo}</h2>
        <p className="text-sm text-muted-foreground">{texto}</p>
        {accion}
        {volverAlInicio && (
          <Button variant="outline" asChild className="mt-2">
            <Link to="/">Volver al inicio</Link>
          </Button>
        )}
      </div>
    </div>
  )
}

export function NoEncontrado() {
  return (
    <EstadoVacio
      icono={<SearchX />}
      titulo="Página no encontrada"
      texto="La página no existe o no tienes permiso para verla."
      volverAlInicio
    />
  )
}
