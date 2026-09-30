import type { LucideProps } from 'lucide-react'
import { createElement } from 'react'
import { iconoModulo } from '@/lib/iconos'

/** Ícono de un módulo del menú a partir de su nombre en el catálogo. */
export function IconoModulo({ nombre, ...props }: { nombre: string | null } & LucideProps) {
  return createElement(iconoModulo(nombre), props)
}
