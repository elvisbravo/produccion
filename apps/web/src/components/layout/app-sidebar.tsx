import { Link, useLocation } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { Monograma } from '@/components/marca'
import { Kbd } from '@/components/ui/kbd'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { IconoModulo } from '@/components/icono-modulo'
import { splat } from '@/lib/menu'
import { useSesion } from '@/stores/sesion'
import { UsuarioMenu } from './usuario-menu'

export function AppSidebar({ onBuscar }: { onBuscar: () => void }) {
  const menu = useSesion((s) => s.usuario?.menu ?? [])
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  // En el celular el menú es un panel superpuesto: se cierra al elegir una opción.
  const alNavegar = () => isMobile && setOpenMobile(false)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/" onClick={alNavegar}>
                <Monograma />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">Producción</span>
                  <span className="truncate text-xs text-muted-foreground">GRUPO ES</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onBuscar} tooltip="Buscar (Ctrl K)" className="text-muted-foreground">
              <Search />
              <span>Buscar…</span>
              <Kbd className="ml-auto">Ctrl K</Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {menu.map((grupo) => (
          <SidebarGroup key={grupo.codigo}>
            <SidebarGroupLabel>{grupo.nombre}</SidebarGroupLabel>
            <SidebarMenu>
              {grupo.hijos.map((modulo) => {
                const ruta = modulo.ruta ?? '/'
                const activo = pathname === ruta || pathname.startsWith(`${ruta}/`)
                return (
                  <SidebarMenuItem key={modulo.codigo}>
                    <SidebarMenuButton asChild isActive={activo} tooltip={modulo.nombre}>
                      <Link to="/$" params={splat(ruta)} onClick={alNavegar}>
                        <IconoModulo nombre={modulo.icono} />
                        <span>{modulo.nombre}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <UsuarioMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
