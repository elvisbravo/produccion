import { useNavigate } from '@tanstack/react-router'
import { House } from 'lucide-react'
import { useEffect } from 'react'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { IconoModulo } from '@/components/icono-modulo'
import { splat } from '@/lib/menu'
import { useSesion } from '@/stores/sesion'

interface Props {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

/**
 * Búsqueda global (Ctrl+K). Por ahora navega entre módulos;
 * luego buscará prospectos, trabajos y personas por celular, nombre o código.
 */
export function BusquedaGlobal({ abierto, onAbiertoChange }: Props) {
  const menu = useSesion((s) => s.usuario?.menu ?? [])
  const navigate = useNavigate()

  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        onAbiertoChange(!abierto)
      }
    }
    document.addEventListener('keydown', alPresionar)
    return () => document.removeEventListener('keydown', alPresionar)
  }, [abierto, onAbiertoChange])

  const ir = (ruta: string) => {
    onAbiertoChange(false)
    void (ruta === '/' ? navigate({ to: '/' }) : navigate({ to: '/$', params: splat(ruta) }))
  }

  return (
    <CommandDialog
      open={abierto}
      onOpenChange={onAbiertoChange}
      title="Búsqueda global"
      description="Busca un módulo para ir a él"
    >
      <Command>
        <CommandInput placeholder="Buscar módulo…" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          <CommandGroup heading="General">
            <CommandItem onSelect={() => ir('/')}>
              <House />
              Inicio
            </CommandItem>
          </CommandGroup>
          {menu.map((grupo) => (
            <CommandGroup key={grupo.codigo} heading={grupo.nombre}>
              {grupo.hijos.map((modulo) => (
                <CommandItem key={modulo.codigo} value={`${grupo.nombre} ${modulo.nombre}`} onSelect={() => ir(modulo.ruta ?? '/')}>
                  <IconoModulo nombre={modulo.icono} />
                  {modulo.nombre}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
