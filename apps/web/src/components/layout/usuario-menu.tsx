import { Link } from '@tanstack/react-router'
import { ChevronsUpDown, KeyRound, LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { useTema, type Tema } from '@/components/tema'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { iniciales } from '@/lib/menu'
import { cerrarSesion } from '@/lib/sesion'
import { useSesion } from '@/stores/sesion'

export function UsuarioMenu() {
  const usuario = useSesion((s) => s.usuario)
  const { isMobile } = useSidebar()
  const { tema, cambiarTema } = useTema()

  if (!usuario) return null
  const rolPrincipal = usuario.roles[0]?.nombre ?? 'Sin rol'

  const salir = () => void cerrarSesion('logout')

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg text-xs font-semibold">
                  {iniciales(usuario.nombres, usuario.apellidos)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {usuario.nombres} {usuario.apellidos}
                </span>
                <span className="truncate text-xs text-muted-foreground">{rolPrincipal}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-60"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="font-normal">
              <div className="grid text-sm leading-tight">
                <span className="truncate font-medium">
                  {usuario.nombres} {usuario.apellidos}
                </span>
                <span className="truncate text-xs text-muted-foreground">{usuario.email}</span>
                <span className="mt-1 truncate text-xs text-muted-foreground">
                  {usuario.roles.map((r) => r.nombre).join(' · ')}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Sun />
                Tema
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={tema} onValueChange={(v) => cambiarTema(v as Tema)}>
                  <DropdownMenuRadioItem value="light">
                    <Sun />
                    Claro
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon />
                    Oscuro
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor />
                    Según el sistema
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem asChild>
              <Link to="/cuenta">
                <KeyRound />
                Mi cuenta y contraseña
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={salir}>
              <LogOut />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
