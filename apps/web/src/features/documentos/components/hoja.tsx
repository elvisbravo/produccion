import { bloquesPlantilla, type EmpresaDatos } from '@grupoes/shared'
import { ArrowLeft, Printer } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Barra superior de la vista previa; no sale en la impresión. */
export function BarraImpresion({ titulo }: { titulo: string }) {
  useEffect(() => {
    const anterior = document.title
    // El título sugiere el nombre del PDF al guardarlo.
    document.title = titulo
    return () => {
      document.title = anterior
    }
  }, [titulo])

  return (
    <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-3 px-4 py-3">
        <Button variant="ghost" size="sm" onClick={() => (window.history.length > 1 ? window.history.back() : window.close())}>
          <ArrowLeft />
          Volver
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{titulo}</span>
        <Button size="sm" onClick={() => window.print()}>
          <Printer />
          Imprimir o guardar PDF
        </Button>
      </div>
      <p className="mx-auto max-w-[210mm] px-4 pb-2 text-xs text-muted-foreground">
        Para guardar el PDF, elige "Guardar como PDF" en la ventana de impresión y desactiva "Encabezados y pies de página".
      </p>
    </div>
  )
}

/** Hoja A4 en pantalla; al imprimir, solo el contenido con los márgenes de la página. */
export function Hoja({ children, anulada }: { children: ReactNode; anulada?: boolean }) {
  return (
    <div className="overflow-x-auto px-4 py-6 print:overflow-visible print:p-0">
      <style>{'@page { size: A4; margin: 15mm 17mm; } @media print { html, body { background: white !important; } }'}</style>
      <article
        className={cn(
          'relative mx-auto flex min-h-[297mm] w-[210mm] flex-col gap-6 bg-white px-[17mm] py-[15mm] text-[10.5pt] leading-relaxed text-zinc-900 shadow-md ring-1 ring-black/5',
          'print:min-h-0 print:w-auto print:p-0 print:shadow-none print:ring-0',
        )}
      >
        {anulada && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-[64pt] font-bold tracking-widest text-red-600/15 select-none [transform:rotate(-30deg)]"
          >
            ANULADO
          </span>
        )}
        {children}
      </article>
    </div>
  )
}

/** Datos de la empresa a la izquierda y el tipo y número del documento en un recuadro a la derecha. */
export function Membrete({ empresa, documento, numero, detalle }: { empresa: EmpresaDatos; documento: string; numero: string; detalle?: ReactNode }) {
  const contacto = [empresa.telefono, empresa.correo, empresa.web].filter(Boolean).join(' · ')
  return (
    <header className="flex items-start justify-between gap-6 border-b border-zinc-300 pb-4">
      <div className="min-w-0 space-y-0.5">
        <p className="text-[15pt] leading-tight font-bold tracking-tight">{empresa.nombreComercial || empresa.razonSocial}</p>
        {empresa.nombreComercial && <p className="text-[9pt] text-zinc-600">{empresa.razonSocial}</p>}
        {empresa.direccion && <p className="text-[9pt] text-zinc-600">{empresa.direccion}</p>}
        {contacto && <p className="text-[9pt] text-zinc-600">{contacto}</p>}
      </div>
      <div className="shrink-0 rounded-md border-2 border-zinc-800 px-5 py-2 text-center">
        {empresa.ruc && <p className="text-[9pt] font-semibold">RUC {empresa.ruc}</p>}
        <p className="text-[11pt] font-bold tracking-wide uppercase">{documento}</p>
        <p className="font-mono text-[10.5pt]">{numero}</p>
        {detalle && <p className="text-[8.5pt] text-zinc-600">{detalle}</p>}
      </div>
    </header>
  )
}

/** Texto de la plantilla: títulos, párrafos y listas. */
export function TextoPlantilla({ texto, className }: { texto: string; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2.5 text-justify', className)}>
      {bloquesPlantilla(texto).map((b, i) =>
        b.tipo === 'titulo' ? (
          <h3 key={i} className="mt-1.5 text-[10.5pt] font-bold uppercase break-after-avoid">
            {b.texto}
          </h3>
        ) : b.tipo === 'lista' ? (
          <ul key={i} className="ml-5 list-disc space-y-1">
            {b.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {b.lineas.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {l}
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  )
}

/** Datos en pares etiqueta: valor, en dos columnas. */
export function Datos({ filas }: { filas: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[10pt]">
      {filas
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([etiqueta, valor]) => (
          <div key={etiqueta} className="contents">
            <dt className="font-semibold text-zinc-600">{etiqueta}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
    </dl>
  )
}

export function Firmas({ firmantes }: { firmantes: { nombre: string; detalle?: string | null }[] }) {
  return (
    <div className="mt-auto grid grid-cols-2 gap-x-12 gap-y-14 pt-20 break-inside-avoid">
      {firmantes.map((f, i) => (
        <div key={i} className="border-t border-zinc-800 pt-1.5 text-center text-[9.5pt]">
          <p className="font-semibold">{f.nombre}</p>
          {f.detalle && <p className="text-zinc-600">{f.detalle}</p>}
        </div>
      ))}
    </div>
  )
}

export const celdaEncabezado = 'border-b-2 border-zinc-800 px-2 py-1.5 text-left text-[9pt] font-semibold uppercase'
export const celda = 'border-b border-zinc-200 px-2 py-1.5 align-top'
