import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** 0,875 → "87,5 %" */
export const pct = (v: number | null, decimales = 0) => (v === null ? '—' : `${(v * 100).toLocaleString('es-PE', { maximumFractionDigits: decimales })} %`)

/** Tarjeta de un indicador con su valor grande. */
export function Indicador({ etiqueta, valor, detalle, tono }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode; tono?: 'bien' | 'atencion' | 'mal' }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-card px-4 py-3">
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      <span
        className={cn(
          'text-2xl font-semibold tabular-nums',
          tono === 'bien' && 'text-green-700 dark:text-green-400',
          tono === 'atencion' && 'text-amber-700 dark:text-amber-400',
          tono === 'mal' && 'text-red-700 dark:text-red-400',
        )}
      >
        {valor}
      </span>
      {detalle && <span className="text-xs text-muted-foreground">{detalle}</span>}
    </div>
  )
}

/** Tono según un porcentaje "más es mejor" con dos umbrales. */
export const tonoPorcentaje = (v: number | null, bien = 0.9, atencion = 0.75) => (v === null ? undefined : v >= bien ? 'bien' : v >= atencion ? 'atencion' : 'mal')

/** Barra de porcentaje con color según el tono. */
export function Barra({ valor, tono }: { valor: number | null; tono?: 'bien' | 'atencion' | 'mal' }) {
  const ancho = Math.min(100, Math.max(0, (valor ?? 0) * 100))
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <span
          className={cn('block h-full rounded-full', tono === 'mal' ? 'bg-red-500' : tono === 'atencion' ? 'bg-amber-500' : 'bg-green-500')}
          style={{ width: `${ancho}%` }}
        />
      </span>
      <span className="text-sm tabular-nums">{pct(valor)}</span>
    </span>
  )
}

export function PorcentajeInsignia({ valor, invertido }: { valor: number | null; invertido?: boolean }) {
  if (valor === null) return <span className="text-muted-foreground">—</span>
  const malo = invertido ? valor > 0.25 : valor < 0
  return (
    <Badge variant="outline" className={cn(malo && 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200')}>
      {pct(valor, 1)}
    </Badge>
  )
}

export function Cargando() {
  return <Skeleton className="h-96" />
}

export function SinDatos({ icono, titulo, descripcion }: { icono: ReactNode; titulo: string; descripcion: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icono}</EmptyMedia>
        <EmptyTitle>{titulo}</EmptyTitle>
        <EmptyDescription>{descripcion}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
