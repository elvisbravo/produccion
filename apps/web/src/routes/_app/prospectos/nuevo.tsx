import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { catalogosProspectoQuery } from '@/features/prospectos/api'
import { FormularioProspecto } from '@/features/prospectos/components/formulario-prospecto'
import { exigirPermiso } from '@/lib/guardas'

export const Route = createFileRoute('/_app/prospectos/nuevo')({
  beforeLoad: () => exigirPermiso('prospectos.crear'),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogosProspectoQuery),
  component: NuevoProspecto,
})

function NuevoProspecto() {
  const { data: catalogos } = useSuspenseQuery(catalogosProspectoQuery)
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo prospecto</h1>
        <p className="text-sm text-muted-foreground">
          Solo el celular es obligatorio. Los demás datos se completan después o al convertirlo en cliente.
        </p>
      </div>
      <FormularioProspecto
        catalogos={catalogos}
        onGuardado={(p) => void navigate({ to: '/prospectos/$id', params: { id: p.id } })}
        onCancelar={() => void navigate({ to: '/prospectos' })}
      />
    </div>
  )
}
