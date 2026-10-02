import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { IconoModulo } from '@/components/icono-modulo'
import { Skeleton } from '@/components/ui/skeleton'
import { panelInicioQuery } from '@/features/inicio/api'
import { ActividadReciente, AusenciasHoy, Graficos, Indicadores, MiCola, Pendientes } from '@/features/inicio/components/panel'
import { splat } from '@/lib/menu'
import { useSesion } from '@/stores/sesion'

export const Route = createFileRoute('/_app/')({
  component: Inicio,
})

function saludo(hora: number) {
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Lima',
})

function Inicio() {
  const usuario = useSesion((s) => s.usuario)!
  const [ahora] = useState(() => new Date())
  const horaLima = Number(new Intl.DateTimeFormat('es-PE', { hour: 'numeric', hour12: false, timeZone: 'America/Lima' }).format(ahora))
  const { data: panel, isError } = useQuery(panelInicioQuery)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground first-letter:uppercase">{formatoFecha.format(ahora)}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {saludo(horaLima)}, {usuario.nombres}
        </h1>
      </div>

      {!panel && !isError && (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </div>
      )}
      {isError && <p className="text-sm text-muted-foreground">No se pudo cargar el resumen. Usa el menú para ir a cada módulo.</p>}

      {panel && (
        <>
          <Pendientes panel={panel} />
          <Indicadores panel={panel} />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <MiCola panel={panel} />
            </div>
            <AusenciasHoy panel={panel} />
          </div>
          <Graficos panel={panel} />
          <ActividadReciente panel={panel} />
        </>
      )}

      <section className="space-y-3 border-t pt-6" aria-labelledby="accesos">
        <h2 id="accesos" className="text-sm font-medium text-muted-foreground">
          Accesos
        </h2>
        <div className="flex flex-wrap gap-2">
          {usuario.menu.flatMap((grupo) =>
            grupo.hijos.map((modulo) => (
              <Link
                key={modulo.codigo}
                to="/$"
                params={splat(modulo.ruta ?? '/')}
                className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <IconoModulo nombre={modulo.icono} className="size-4" />
                {modulo.nombre}
              </Link>
            )),
          )}
        </div>
      </section>
    </div>
  )
}
