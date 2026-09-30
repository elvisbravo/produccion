import { createFileRoute, Link, useLocation } from '@tanstack/react-router'
import { Construction, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconoModulo } from '@/components/icono-modulo'
import { ubicarModulo } from '@/lib/menu'
import { useSesion } from '@/stores/sesion'

/**
 * Ruta comodín: muestra "en construcción" para los módulos del menú que aún no
 * tienen pantalla, y "no encontrado" para cualquier otra ruta o sin permiso.
 */
export const Route = createFileRoute('/_app/$')({
  component: PaginaComodin,
})

function PaginaComodin() {
  const menu = useSesion((s) => s.usuario?.menu ?? [])
  const { pathname } = useLocation()
  const ubicacion = ubicarModulo(menu, pathname)

  if (!ubicacion) {
    return (
      <EstadoVacio
        icono={<SearchX />}
        titulo="Página no encontrada"
        texto="La página no existe o no tienes permiso para verla."
      />
    )
  }

  return (
    <EstadoVacio
      icono={<IconoModulo nombre={ubicacion.modulo.icono} />}
      titulo={ubicacion.modulo.nombre}
      texto="Este módulo está en construcción. Pronto estará disponible."
      extra={<Construction className="size-4 text-muted-foreground" aria-hidden="true" />}
    />
  )
}

function EstadoVacio({ icono, titulo, texto, extra }: { icono: React.ReactNode; titulo: string; texto: string; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl border bg-muted/40 [&_svg]:size-5">{icono}</div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          {titulo}
          {extra}
        </h1>
        <p className="text-sm text-muted-foreground">{texto}</p>
        <Button variant="outline" asChild className="mt-2">
          <Link to="/">Volver al inicio</Link>
        </Button>
      </div>
    </div>
  )
}
