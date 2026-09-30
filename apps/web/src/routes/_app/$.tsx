import { createFileRoute, useLocation } from '@tanstack/react-router'
import { Construction } from 'lucide-react'
import { EstadoVacio, NoEncontrado } from '@/components/estado-vacio'
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

  if (!ubicacion) return <NoEncontrado />

  return (
    <EstadoVacio
      icono={<IconoModulo nombre={ubicacion.modulo.icono} />}
      titulo={
        <>
          {ubicacion.modulo.nombre}
          <Construction className="size-4 text-muted-foreground" aria-hidden="true" />
        </>
      }
      texto="Este módulo está en construcción. Pronto estará disponible."
      volverAlInicio
    />
  )
}
