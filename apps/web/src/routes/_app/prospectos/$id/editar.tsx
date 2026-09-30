import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { catalogosProspectoQuery, prospectoQuery } from '@/features/prospectos/api'
import { FormularioProspecto } from '@/features/prospectos/components/formulario-prospecto'
import { exigirPermiso } from '@/lib/guardas'

export const Route = createFileRoute('/_app/prospectos/$id/editar')({
  beforeLoad: () => exigirPermiso('prospectos.editar'),
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(catalogosProspectoQuery),
      context.queryClient.ensureQueryData(prospectoQuery(params.id)),
    ]),
  component: EditarProspecto,
})

function EditarProspecto() {
  const { id } = Route.useParams()
  const { data: catalogos } = useSuspenseQuery(catalogosProspectoQuery)
  const { data: prospecto } = useSuspenseQuery(prospectoQuery(id))
  const navigate = useNavigate()
  const volver = () => void navigate({ to: '/prospectos/$id', params: { id } })

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <p className="font-mono text-sm text-muted-foreground">{prospecto.codigo}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Editar prospecto</h1>
      </div>
      <FormularioProspecto catalogos={catalogos} prospecto={prospecto} onGuardado={volver} onCancelar={volver} />
    </div>
  )
}
