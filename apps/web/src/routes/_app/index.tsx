import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IconoModulo } from '@/components/icono-modulo'
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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-4 md:p-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground first-letter:uppercase">{formatoFecha.format(ahora)}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {saludo(horaLima)}, {usuario.nombres}
        </h1>
      </div>

      {usuario.menu.map((grupo) => (
        <section key={grupo.codigo} className="space-y-3" aria-labelledby={`grupo-${grupo.codigo}`}>
          <h2 id={`grupo-${grupo.codigo}`} className="text-sm font-medium text-muted-foreground">
            {grupo.nombre}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {grupo.hijos.map((modulo) => (
              <Link key={modulo.codigo} to="/$" params={splat(modulo.ruta ?? '/')} className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Card className="h-full transition-colors group-hover:bg-accent/60">
                  <CardHeader>
                    <div className="mb-2 flex size-9 items-center justify-center rounded-lg border bg-background">
                      <IconoModulo nombre={modulo.icono} className="size-4" />
                    </div>
                    <CardTitle className="flex items-center justify-between">
                      {modulo.nombre}
                      <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </CardTitle>
                    <CardDescription>{grupo.nombre}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
