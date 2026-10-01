import { Link, useLocation } from '@tanstack/react-router'
import { Fragment } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Campanita } from '@/features/notificaciones/campanita'
import { ubicarModulo } from '@/lib/menu'
import { useSesion } from '@/stores/sesion'

export function AppHeader() {
  const menu = useSesion((s) => s.usuario?.menu ?? [])
  const { pathname } = useLocation()
  const ubicacion = ubicarModulo(menu, pathname)

  const migas = ubicacion ? [ubicacion.grupo.nombre, ubicacion.modulo.nombre] : pathname === '/' ? ['Inicio'] : []

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4 self-center!" />
      <Breadcrumb>
        <BreadcrumbList>
          {pathname !== '/' && (
            <>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link to="/">Inicio</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              {migas.length > 0 && <BreadcrumbSeparator className="hidden md:block" />}
            </>
          )}
          {migas.map((miga, i) => (
            <Fragment key={miga}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {i === migas.length - 1 ? <BreadcrumbPage>{miga}</BreadcrumbPage> : <span>{miga}</span>}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-1">
        <Campanita />
      </div>
    </header>
  )
}
