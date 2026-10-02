import { formatearCelular } from '@grupoes/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, BriefcaseBusiness } from 'lucide-react'
import { EstadoVacio } from '@/components/estado-vacio'
import { Button } from '@/components/ui/button'
import { catalogosProspectoQuery, prospectoQuery } from '@/features/prospectos/api'
import { FormularioConversion } from '@/features/trabajos/components/formulario-conversion'
import { ApiError } from '@/lib/api'
import { nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'

export const Route = createFileRoute('/_app/prospectos/$id/convertir')({
  beforeLoad: () => exigirPermiso('prospectos.convertir'),
  loader: async ({ context, params }) => {
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(prospectoQuery(params.id)),
        context.queryClient.ensureQueryData(catalogosProspectoQuery),
      ])
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 400)) throw notFound()
      throw error
    }
  },
  component: Convertir,
})

function Convertir() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { data: p } = useSuspenseQuery(prospectoQuery(id))
  const { data: catalogos } = useSuspenseQuery(catalogosProspectoQuery)
  const tipo = catalogos.tiposTrabajo.find((t) => t.id === p.tipoTrabajo.id)
  const principal = p.contactos.find((c) => c.esPrincipal) ?? p.contactos[0]

  if (p.trabajo) {
    return (
      <EstadoVacio
        icono={<BriefcaseBusiness />}
        titulo="Ya es cliente"
        texto={`Este prospecto ya se convirtió en el trabajo ${p.trabajo.codigo}.`}
        accion={
          <Button asChild>
            <Link to="/trabajos/$id" params={{ id: p.trabajo.id }}>
              Ver trabajo
            </Link>
          </Button>
        }
      />
    )
  }
  if (p.etapa.clase !== 'abierta') {
    return <EstadoVacio icono={<BriefcaseBusiness />} titulo="Prospecto cerrado" texto="Reactívalo antes de convertirlo en cliente." volverAlInicio />
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col gap-3">
        <Link to="/prospectos/$id" params={{ id }} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          {p.codigo}
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Convertir en cliente</h1>
          <p className="text-sm text-muted-foreground">
            {nombreCompleto(principal) ?? formatearCelular(principal.celular)} · {p.tipoTrabajo.nombre}
          </p>
        </div>
      </div>
      <FormularioConversion
        prospecto={p}
        niveles={catalogos.nivelesAcademicos}
        maxIntegrantes={tipo?.maxIntegrantes ?? p.contactos.length}
        onConvertido={(t) => void navigate({ to: '/trabajos/$id', params: { id: t.id } })}
        onCancelar={() => void navigate({ to: '/prospectos/$id', params: { id } })}
      />
    </div>
  )
}
