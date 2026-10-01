import {
  configuracionDocumentosSchema,
  NOMBRE_PLANTILLA,
  PLANTILLAS_POR_DEFECTO,
  rellenarPlantilla,
  TIPOS_PLANTILLA,
  VARIABLES_PLANTILLA,
  type ConfiguracionDocumentos,
  type EmpresaDatos,
  type TipoPlantilla,
} from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2, RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { configuracionDocumentosQuery, useGuardarConfiguracionDocumentos } from '@/features/documentos/api'
import { TextoPlantilla } from '@/features/documentos/components/hoja'
import { ApiError } from '@/lib/api'
import { formatearFechaHora } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { usePermiso } from '@/lib/permisos'

export const Route = createFileRoute('/_app/documentos/')({
  beforeLoad: () => exigirPermiso('documentos.ver'),
  component: Documentos,
})

function Documentos() {
  const { data } = useQuery(configuracionDocumentosQuery)
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
        <p className="text-sm text-muted-foreground">Membrete de la empresa y textos de la cotización, el contrato y el recibo que se imprimen o guardan en PDF.</p>
      </div>
      {data ? <Formulario key={JSON.stringify(data)} inicial={data} /> : <Skeleton className="h-96" />}
    </div>
  )
}

const CAMPOS_EMPRESA: { clave: keyof EmpresaDatos; etiqueta: string; descripcion?: string; ancho?: boolean; multilinea?: boolean }[] = [
  { clave: 'razonSocial', etiqueta: 'Razón social' },
  { clave: 'nombreComercial', etiqueta: 'Nombre comercial', descripcion: 'Si lo llenas, se muestra en grande en el membrete.' },
  { clave: 'ruc', etiqueta: 'RUC' },
  { clave: 'telefono', etiqueta: 'Teléfono' },
  { clave: 'correo', etiqueta: 'Correo' },
  { clave: 'web', etiqueta: 'Página web' },
  { clave: 'direccion', etiqueta: 'Dirección', ancho: true },
  { clave: 'cuentas', etiqueta: 'Cuentas para el pago', descripcion: 'Se imprimen al pie de la cotización. Una por línea.', ancho: true, multilinea: true },
]

function Formulario({ inicial }: { inicial: ConfiguracionDocumentos }) {
  const puede = usePermiso('documentos.editar')
  const guardar = useGuardarConfiguracionDocumentos()
  const [empresa, setEmpresa] = useState<EmpresaDatos>(inicial.empresa)
  const [textos, setTextos] = useState<Record<TipoPlantilla, string>>(() => Object.fromEntries(inicial.plantillas.map((p) => [p.tipo, p.contenido])) as Record<TipoPlantilla, string>)
  const [errores, setErrores] = useState<Record<string, string>>({})

  const enviar = async () => {
    const datos = configuracionDocumentosSchema.safeParse({ empresa, plantillas: TIPOS_PLANTILLA.map((tipo) => ({ tipo, contenido: textos[tipo] })) })
    if (!datos.success) {
      setErrores(Object.fromEntries(datos.error.issues.map((i) => [i.path.join('.'), i.message])))
      return toast.error('Revisa los datos marcados')
    }
    setErrores({})
    try {
      await guardar.mutateAsync(datos.data)
      toast.success('Documentos guardados')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Tabs defaultValue="empresa">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="empresa">Empresa</TabsTrigger>
          {TIPOS_PLANTILLA.map((tipo) => (
            <TabsTrigger key={tipo} value={tipo}>
              {NOMBRE_PLANTILLA[tipo]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="empresa" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Membrete</CardTitle>
              <CardDescription>Datos que encabezan todos los documentos.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {CAMPOS_EMPRESA.map((c) => {
                const error = errores[`empresa.${c.clave}`]
                const props = { id: `emp-${c.clave}`, value: empresa[c.clave], disabled: !puede, onChange: (ev: { target: { value: string } }) => setEmpresa((e) => ({ ...e, [c.clave]: ev.target.value })) }
                return (
                  <Field key={c.clave} data-invalid={Boolean(error)} className={c.ancho ? 'sm:col-span-2' : undefined}>
                    <FieldLabel htmlFor={props.id}>{c.etiqueta}</FieldLabel>
                    {c.multilinea ? <Textarea rows={3} {...props} /> : <Input {...props} />}
                    {c.descripcion && <FieldDescription>{c.descripcion}</FieldDescription>}
                    {error && <FieldError>{error}</FieldError>}
                  </Field>
                )
              })}
            </CardContent>
          </Card>
        </TabsContent>
        {TIPOS_PLANTILLA.map((tipo, i) => {
          const actual = inicial.plantillas.find((p) => p.tipo === tipo)!
          return (
            <TabsContent key={tipo} value={tipo} className="mt-4">
              <EditorPlantilla
                tipo={tipo}
                texto={textos[tipo]}
                onTexto={(t) => setTextos((x) => ({ ...x, [tipo]: t }))}
                empresa={empresa}
                personalizada={actual.personalizada}
                actualizadoEn={actual.actualizadoEn}
                error={errores[`plantillas.${i}.contenido`]}
                editable={puede}
              />
            </TabsContent>
          )
        })}
      </Tabs>
      {puede && (
        <div className="flex justify-end">
          <Button onClick={() => void enviar()} disabled={guardar.isPending}>
            {guardar.isPending && <Loader2 className="animate-spin" />}
            Guardar cambios
          </Button>
        </div>
      )}
    </div>
  )
}

function EditorPlantilla({
  tipo,
  texto,
  onTexto,
  empresa,
  personalizada,
  actualizadoEn,
  error,
  editable,
}: {
  tipo: TipoPlantilla
  texto: string
  onTexto: (t: string) => void
  empresa: EmpresaDatos
  personalizada: boolean
  actualizadoEn: string | null
  error?: string
  editable: boolean
}) {
  const area = useRef<HTMLTextAreaElement>(null)
  const variables = VARIABLES_PLANTILLA[tipo]
  // La vista previa usa datos de ejemplo, salvo los de la empresa, que ya se conocen.
  const ejemplo = {
    ...Object.fromEntries(variables.map((v) => [v.clave, v.ejemplo])),
    ...(empresa.razonSocial && { empresa: empresa.razonSocial }),
    ...(empresa.ruc && { ruc: empresa.ruc }),
    ...(empresa.direccion && { direccion_empresa: empresa.direccion }),
    ...(empresa.telefono && { telefono_empresa: empresa.telefono }),
    ...(empresa.correo && { correo_empresa: empresa.correo }),
  }

  /** Inserta la variable donde está el cursor. */
  const insertar = (clave: string) => {
    const el = area.current
    const marca = `{${clave}}`
    if (!el) return onTexto(texto + marca)
    const { selectionStart: a, selectionEnd: b } = el
    onTexto(texto.slice(0, a) + marca + texto.slice(b))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(a + marca.length, a + marca.length)
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              Texto
              {personalizada ? <Badge variant="secondary">Personalizado</Badge> : <Badge variant="outline">Provisional</Badge>}
            </CardTitle>
            <CardDescription>
              Párrafos separados por una línea en blanco. Empieza una línea con "# " para un título y con "- " para un punto de lista.
              {actualizadoEn && ` Último cambio: ${formatearFechaHora(actualizadoEn)}.`}
            </CardDescription>
          </div>
          {editable && texto !== PLANTILLAS_POR_DEFECTO[tipo] && (
            <Button variant="ghost" size="sm" onClick={() => onTexto(PLANTILLAS_POR_DEFECTO[tipo])}>
              <RotateCcw />
              Provisional
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={`plantilla-${tipo}`} className="sr-only">
              Texto de {NOMBRE_PLANTILLA[tipo]}
            </FieldLabel>
            <Textarea
              ref={area}
              id={`plantilla-${tipo}`}
              rows={18}
              className="h-96 resize-y font-mono text-xs leading-relaxed [field-sizing:fixed]"
              value={texto}
              readOnly={!editable}
              onChange={(ev) => onTexto(ev.target.value)}
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Variables</p>
            <div className="flex flex-wrap gap-1.5">
              {variables.map((v) => (
                <Button key={v.clave} type="button" variant="outline" size="xs" title={v.descripcion} disabled={!editable} onClick={() => insertar(v.clave)}>
                  {`{${v.clave}}`}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Pasa el cursor sobre una variable para ver qué contiene; al hacer clic se inserta donde está el cursor.</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Vista previa</CardTitle>
          <CardDescription>Con datos de ejemplo. Las tablas (ítems, cuotas) y las firmas las agrega el sistema.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-white p-6 text-[13px] leading-relaxed text-zinc-900 shadow-sm ring-1 ring-black/10">
            <TextoPlantilla texto={rellenarPlantilla(texto, ejemplo)} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
