import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormularioCambiarClave } from '@/features/administracion/components/cambiar-clave'
import { useSesion } from '@/stores/sesion'

/** Mi cuenta: datos básicos y cambio de contraseña (cualquier usuario). */
export const Route = createFileRoute('/_app/cuenta')({
  component: Cuenta,
})

function Cuenta() {
  const usuario = useSesion((s) => s.usuario)
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
        <p className="text-sm text-muted-foreground">
          {usuario?.nombres} {usuario?.apellidos} · {usuario?.email} · {usuario?.roles.map((r) => r.nombre).join(', ')}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
          <CardDescription>Al cambiarla se cierran tus sesiones en otros equipos.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioCambiarClave />
        </CardContent>
      </Card>
    </div>
  )
}
