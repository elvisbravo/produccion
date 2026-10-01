import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { NoEncontrado } from '@/components/estado-vacio'
import { restaurarSesion } from '@/lib/sesion'
import { useSesion } from '@/stores/sesion'

/** Hojas para imprimir o guardar en PDF: con sesión, pero sin el menú del sistema. */
export const Route = createFileRoute('/imprimir')({
  beforeLoad: async ({ location }) => {
    if (!(await restaurarSesion())) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
  },
  component: LayoutImpresion,
  notFoundComponent: () => (
    <div className="p-8">
      <NoEncontrado />
    </div>
  ),
})

function LayoutImpresion() {
  const usuario = useSesion((s) => s.usuario)
  if (!usuario) return null
  return (
    <main className="min-h-svh bg-muted/40 print:min-h-0 print:bg-white">
      <Outlet />
    </main>
  )
}
