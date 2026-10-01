import { createFileRoute, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { NoEncontrado } from '@/components/estado-vacio'
import { AppHeader } from '@/components/layout/app-header'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { BusquedaGlobal } from '@/components/layout/busqueda-global'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { FormularioCambiarClave } from '@/features/administracion/components/cambiar-clave'
import { useCanalNotificaciones } from '@/features/notificaciones/api'
import { useInactividad } from '@/hooks/use-inactividad'
import { cerrarSesion, restaurarSesion } from '@/lib/sesion'
import { useSesion } from '@/stores/sesion'

/** Layout de las páginas que requieren sesión. */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ location }) => {
    if (!(await restaurarSesion())) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
  },
  component: LayoutApp,
  notFoundComponent: NoEncontrado,
})

function LayoutApp() {
  const [buscando, setBuscando] = useState(false)
  const usuario = useSesion((s) => s.usuario)
  const inactividadMinutos = useSesion((s) => s.inactividadMinutos)
  const navigate = useNavigate()

  // Único punto de salida: al perder la sesión (logout, inactividad o expiración) se vuelve al login.
  useEffect(() => {
    if (usuario) return
    const motivo = useSesion.getState().motivoSalida
    if (motivo === 'logout') {
      void navigate({ to: '/login', replace: true })
    } else {
      const redirect = motivo === 'expirada' ? window.location.pathname + window.location.search : undefined
      void navigate({ to: '/login', search: { motivo: motivo ?? 'expirada', redirect }, replace: true })
    }
  }, [usuario, navigate])

  const porInactividad = useCallback(() => {
    toast.info('Tu sesión se cerró por inactividad')
    void cerrarSesion('inactividad')
  }, [])
  useInactividad(inactividadMinutos, porInactividad)
  // Avisos en vivo mientras haya sesión.
  useCanalNotificaciones()

  if (!usuario) return null

  // Primer ingreso o contraseña restablecida: no se entra al sistema sin cambiarla.
  if (usuario.debeCambiarClave) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
        <div className="flex w-full max-w-md flex-col gap-6 rounded-xl border bg-card p-6 shadow-sm">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Hola, {usuario.nombres}: crea tu contraseña</h1>
            <p className="text-sm text-muted-foreground">Ingresaste con una contraseña temporal. Elige una propia para continuar.</p>
          </div>
          <FormularioCambiarClave />
          <button type="button" className="w-fit text-sm text-muted-foreground underline" onClick={() => void cerrarSesion('logout')}>
            Salir
          </button>
        </div>
      </main>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar onBuscar={() => setBuscando(true)} />
      <SidebarInset>
        <AppHeader />
        <div className="flex flex-1 flex-col">
          <Outlet />
        </div>
      </SidebarInset>
      <BusquedaGlobal abierto={buscando} onAbiertoChange={setBuscando} />
    </SidebarProvider>
  )
}
