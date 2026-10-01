import { fechaLarga, formatearSoles } from '@grupoes/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { documentoReciboQuery } from '@/features/documentos/api'
import { BarraImpresion, Datos, Firmas, Hoja, Membrete, TextoPlantilla } from '@/features/documentos/components/hoja'
import { ApiError } from '@/lib/api'
import { exigirPermiso } from '@/lib/guardas'

/** Recibo interno de un pago (el parámetro es el id del pago). */
export const Route = createFileRoute('/imprimir/recibo/$id')({
  beforeLoad: () => exigirPermiso('contratos.imprimir'),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(documentoReciboQuery(params.id))
    } catch (error) {
      if (error instanceof ApiError && [400, 403, 404].includes(error.status)) throw notFound()
      throw error
    }
  },
  component: Recibo,
})

function Recibo() {
  const { id } = Route.useParams()
  const { data: d } = useSuspenseQuery(documentoReciboQuery(id))
  const registrador = `${d.registradoPor.nombres} ${d.registradoPor.apellidos}`
  return (
    <>
      <BarraImpresion titulo={`Recibo ${d.numero} - ${d.cliente.nombre}`} />
      <Hoja anulada={!!d.anulado}>
        <Membrete empresa={d.empresa} documento="Recibo de pago" numero={d.numero} detalle={fechaLarga(d.fecha)} />
        <div className="flex items-center justify-between gap-6 rounded-md bg-zinc-100 px-5 py-4">
          <div>
            <p className="text-[9pt] font-semibold text-zinc-600 uppercase">Monto recibido</p>
            <p className="text-[9.5pt]">{d.montoLetras}</p>
          </div>
          <p className="text-[18pt] font-bold tabular-nums">{formatearSoles(d.monto)}</p>
        </div>
        <TextoPlantilla texto={d.texto} />
        <Datos
          filas={[
            ['Cliente', d.cliente.nombre],
            ['Documento', d.cliente.documento],
            ['Trabajo', `${d.trabajo.codigo} · ${d.trabajo.tipo}${d.trabajo.titulo ? ` · ${d.trabajo.titulo}` : ''}`],
            ['Medio de pago', `${d.metodo}${d.numeroOperacion ? ` · operación ${d.numeroOperacion}` : ''}`],
            ['Aplicado a', d.cuotas.map((q) => `cuota ${q.numero} (${formatearSoles(q.montoAplicado)})`).join(', ')],
            ['Total del contrato', formatearSoles(d.totalContrato)],
            ['Saldo pendiente', formatearSoles(d.saldo)],
            ['Registrado por', registrador],
          ]}
        />
        {d.anulado && <p className="font-semibold text-red-700">Pago anulado{d.anulado.motivo ? `: ${d.anulado.motivo}` : ''}.</p>}
        <Firmas firmantes={[{ nombre: registrador, detalle: `Por ${d.empresa.razonSocial}` }]} />
      </Hoja>
    </>
  )
}
