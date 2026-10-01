import { fechaLarga, formatearSoles } from '@grupoes/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { documentoContratoQuery } from '@/features/documentos/api'
import { BarraImpresion, celda, celdaEncabezado, Firmas, Hoja, Membrete, TextoPlantilla } from '@/features/documentos/components/hoja'
import { ApiError } from '@/lib/api'
import { exigirPermiso } from '@/lib/guardas'

/** Contrato del trabajo (el parámetro es el id del trabajo). */
export const Route = createFileRoute('/imprimir/contrato/$id')({
  beforeLoad: () => exigirPermiso('contratos.imprimir'),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(documentoContratoQuery(params.id))
    } catch (error) {
      if (error instanceof ApiError && [400, 403, 404].includes(error.status)) throw notFound()
      throw error
    }
  },
  component: Contrato,
})

function Contrato() {
  const { id } = Route.useParams()
  const { data: d } = useSuspenseQuery(documentoContratoQuery(id))
  const titular = d.integrantes.find((i) => i.esTitular) ?? d.integrantes[0]
  return (
    <>
      <BarraImpresion titulo={`Contrato ${d.trabajo.codigo} - ${titular?.nombre ?? ''}`} />
      <Hoja anulada={d.estado === 'anulado'}>
        <Membrete empresa={d.empresa} documento="Contrato" numero={d.trabajo.codigo} detalle={fechaLarga(d.fechaFirma)} />
        <h1 className="text-center text-[12.5pt] font-bold uppercase">Contrato de prestación de servicios</h1>
        <TextoPlantilla texto={d.texto} />

        {d.integrantes.length > 1 && (
          <section className="break-inside-avoid">
            <h3 className="mb-1.5 text-[10.5pt] font-bold uppercase">Integrantes</h3>
            <table className="w-full border-collapse text-[10pt]">
              <thead>
                <tr>
                  <th className={celdaEncabezado}>Nombre</th>
                  <th className={celdaEncabezado}>Documento</th>
                  <th className={celdaEncabezado}>Celular</th>
                </tr>
              </thead>
              <tbody>
                {d.integrantes.map((i) => (
                  <tr key={i.celular}>
                    <td className={celda}>
                      {i.nombre}
                      {i.esTitular && <span className="text-zinc-600"> (titular)</span>}
                    </td>
                    <td className={celda}>{i.documento ?? '—'}</td>
                    <td className={celda}>{i.celular}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="break-inside-avoid">
          <h3 className="mb-1.5 text-[10.5pt] font-bold uppercase">Cronograma de pagos</h3>
          <table className="w-full border-collapse text-[10pt]">
            <thead>
              <tr>
                <th className={`${celdaEncabezado} w-16`}>Cuota</th>
                <th className={celdaEncabezado}>Vencimiento</th>
                <th className={`${celdaEncabezado} w-32 text-right`}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {d.cuotas.map((q) => (
                <tr key={q.numero}>
                  <td className={celda}>{d.formaPago === 'contado' ? 'Única' : q.numero}</td>
                  <td className={celda}>{fechaLarga(q.vencimiento)}</td>
                  <td className={`${celda} text-right tabular-nums`}>{formatearSoles(q.monto)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="px-2 pt-2 text-right font-bold uppercase">
                  Total
                </td>
                <td className="px-2 pt-2 text-right font-bold tabular-nums">{formatearSoles(d.montoTotal)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-1 text-[9.5pt]">
            <span className="font-semibold">Son:</span> {d.montoLetras}
          </p>
        </section>

        <Firmas
          firmantes={[
            { nombre: d.empresa.razonSocial, detalle: d.empresa.ruc ? `RUC ${d.empresa.ruc}` : 'LA EMPRESA' },
            ...d.integrantes.map((i) => ({ nombre: i.nombre, detalle: i.documento ?? 'EL CLIENTE' })),
          ]}
        />
      </Hoja>
    </>
  )
}
