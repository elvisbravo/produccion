import type { ParametroItem } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import { parametrosQuery, useGuardarParametros } from '@/features/administracion/api'
import { ApiError } from '@/lib/api'
import { exigirPermiso } from '@/lib/guardas'
import { usePermiso } from '@/lib/permisos'

export const Route = createFileRoute('/_app/parametros/')({
  beforeLoad: () => exigirPermiso('parametros.ver'),
  component: Parametros,
})

function Parametros() {
  const { data } = useQuery(parametrosQuery)
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Parámetros</h1>
        <p className="text-sm text-muted-foreground">Valores que ajustan el comportamiento del sistema. Los cambios rigen desde que se guardan.</p>
      </div>
      {data ? <Formulario key={data.map((p) => `${p.clave}:${p.valor}`).join('|')} parametros={data} /> : <Skeleton className="h-96" />}
    </div>
  )
}

function Formulario({ parametros }: { parametros: ParametroItem[] }) {
  const puede = usePermiso('parametros.editar')
  const guardar = useGuardarParametros()
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(parametros.map((p) => [p.clave, p.valor?.toString() ?? ''])))
  const [errores, setErrores] = useState<Record<string, string>>({})
  const grupos = [...new Set(parametros.map((p) => p.grupo))]
  const cambiados = parametros.filter((p) => (p.valor?.toString() ?? '') !== valores[p.clave])

  const enviar = async () => {
    setErrores({})
    try {
      await guardar.mutateAsync(Object.fromEntries(cambiados.map((p) => [p.clave, valores[p.clave] === '' ? null : Number(valores[p.clave])])))
      toast.success('Parámetros guardados')
    } catch (err) {
      if (err instanceof ApiError && err.errores.length) setErrores(Object.fromEntries(err.errores.map((e) => [e.campo, e.mensaje])))
      else toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {grupos.map((g) => (
        <Card key={g}>
          <CardHeader>
            <CardTitle>{g}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            {parametros
              .filter((p) => p.grupo === g)
              .map((p) => (
                <Field key={p.clave} data-invalid={Boolean(errores[p.clave])}>
                  <FieldLabel htmlFor={p.clave}>{p.nombre}</FieldLabel>
                  <InputGroup className="w-48">
                    <InputGroupInput
                      id={p.clave}
                      type="number"
                      min={p.min}
                      max={p.max}
                      disabled={!puede}
                      placeholder={p.opcional ? 'Sin tope' : undefined}
                      value={valores[p.clave]}
                      onChange={(ev) => setValores((v) => ({ ...v, [p.clave]: ev.target.value }))}
                      aria-invalid={Boolean(errores[p.clave])}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>{p.unidad}</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>
                    {p.descripcion}. Entre {p.min} y {p.max}
                    {p.porDefecto !== null && `; por defecto, ${p.porDefecto}`}.
                  </FieldDescription>
                  {errores[p.clave] && <FieldError>{errores[p.clave]}</FieldError>}
                </Field>
              ))}
          </CardContent>
        </Card>
      ))}
      {puede && (
        <Button className="w-fit" onClick={() => void enviar()} disabled={cambiados.length === 0 || guardar.isPending}>
          {guardar.isPending && <Loader2 className="animate-spin" />}
          Guardar {cambiados.length > 0 && `(${cambiados.length})`}
        </Button>
      )}
    </div>
  )
}
