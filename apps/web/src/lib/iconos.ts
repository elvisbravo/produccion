import {
  BriefcaseBusiness,
  CalendarClock,
  CalendarCog,
  CalendarDays,
  CalendarOff,
  ChartColumn,
  Clock,
  FileCog,
  FileText,
  History,
  LayoutGrid,
  ListChecks,
  ShieldCheck,
  Blocks,
  SlidersHorizontal,
  SquareCheckBig,
  SquareKanban,
  Timer,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

/**
 * Íconos disponibles para los módulos (el nombre viene del catálogo en @grupoes/shared).
 * Se listan explícitamente para no incluir todos los íconos de lucide en el bundle.
 */
const ICONOS: Record<string, LucideIcon> = {
  Blocks,
  BriefcaseBusiness,
  CalendarClock,
  CalendarCog,
  CalendarDays,
  CalendarOff,
  ChartColumn,
  Clock,
  FileCog,
  FileText,
  History,
  ListChecks,
  ShieldCheck,
  SlidersHorizontal,
  SquareCheckBig,
  SquareKanban,
  Timer,
  UserCog,
  Users,
  Wallet,
}

export function iconoModulo(nombre: string | null): LucideIcon {
  return (nombre && ICONOS[nombre]) || LayoutGrid
}
