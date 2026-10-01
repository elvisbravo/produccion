import { fechaLarga, formatearSoles } from '@grupoes/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { documentoCotizacionQuery } from '@/features/documentos/api'
import { BarraImpresion, celda, celdaEncabezado, Datos, Hoja, Membrete, TextoPlantilla } from '@/features/documentos/components/hoja'
import { ApiError } from '@/lib/api'
import { exigirPermiso } from '@/lib/guardas'

const numero = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 2 })

export const Route = createFileRoute('/imprimir/cotizacion/$id')({
  beforeLoad: () => exigirPermiso('cotizaciones.imprimir'),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(documentoCotizacionQuery(params.id))
    } catch (error) {
      if (error instanceof ApiError && [400, 403, 404].includes(error.status)) throw notFound()
      throw error
    }
  },
  component: Cotizacion,
})

function Cotizacion() {
  const { id } = Route.useParams()
  const { data: d } = useSuspenseQuery(documentoCotizacionQuery(id))
  return (
    <>
      <BarraImpresion titulo={`Cotización ${d.numero} - ${d.cliente.nombre}`} />
      <Hoja anulada={d.estado === 'anulada'}>
        <Membrete empresa={d.empresa} documento="Cotización" numero={d.numero} detalle={`Válida hasta el ${fechaLarga(d.validaHasta)}`} />
        <div className="grid grid-cols-2 gap-6">
          <Datos
            filas={[
              ['Cliente', d.cliente.nombre],
              ['Fecha', fechaLarga(d.fecha)],
              ['Atendido por', `${d.asesor.nombres} ${d.asesor.apellidos}`],
            ]}
          />
          <Datos
            filas={[
              ['Servicio', d.trabajo.tipo],
              ['Título', d.trabajo.titulo],
              ['Nivel', d.trabajo.nivel],
              ['Universidad', d.trabajo.universidad],
              ['Carrera', d.trabajo.carrera],
            ]}
          />
        </div>
        <table className="w-full border-collapse text-[10pt]">
          <thead>
            <tr>
              <th className={`${celdaEncabezado} w-10`}>N.º</th>
              <th className={celdaEncabezado}>Descripción</th>
              <th className={`${celdaEncabezado} w-20 text-right`}>Cant.</th>
              <th className={`${celdaEncabezado} w-28 text-right`}>P. unitario</th>
              <th className={`${celdaEncabezado} w-28 text-right`}>Importe</th>
            </tr>
          </thead>
          <tbody>
            {d.items.map((i, n) => (
              <tr key={n}>
                <td className={celda}>{n + 1}</td>
                <td className={celda}>{i.descripcion}</td>
                <td className={`${celda} text-right tabular-nums`}>{numero(i.cantidad)}</td>
                <td className={`${celda} text-right tabular-nums`}>{formatearSoles(i.precio)}</td>
                <td className={`${celda} text-right tabular-nums`}>{formatearSoles(i.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="px-2 pt-2 text-right font-bold uppercase">
                Total
              </td>
              <td className="px-2 pt-2 text-right text-[11.5pt] font-bold tabular-nums">{formatearSoles(d.total)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="-mt-3 text-[9.5pt]">
          <span className="font-semibold">Son:</span> {d.totalLetras}
        </p>
        {d.observaciones && <p className="text-[10pt] whitespace-pre-line">{d.observaciones}</p>}
        <TextoPlantilla texto={d.texto} />
        {d.empresa.cuentas && (
          <section className="rounded-md border border-zinc-300 px-4 py-3 text-[9.5pt] break-inside-avoid">
            <p className="mb-1 font-semibold uppercase">Cuentas para el pago</p>
            <p className="whitespace-pre-line">{d.empresa.cuentas}</p>
          </section>
        )}
      </Hoja>
    </>
  )
}
