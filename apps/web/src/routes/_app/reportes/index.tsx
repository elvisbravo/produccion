import { diaEnLima, sumarDias } from '@grupoes/shared'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { z } from 'zod'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ReporteCobranzaVista, ReporteOcupacionVista, ReportePuntualidadVista, ReporteRetrabajoVista } from '@/features/reportes/components/indicadores'
import { ReporteRentabilidadVista } from '@/features/reportes/components/rentabilidad'
import { ResumenTablero } from '@/features/reportes/components/tablero'
import { ReporteTiemposVista } from '@/features/reportes/components/tiempos'
import { exigirPermiso } from '@/lib/guardas'
import { usePermiso } from '@/lib/permisos'

const PESTANAS = ['resumen', 'puntualidad', 'retrabajo', 'ocupacion', 'cobranza', 'rentabilidad', 'tiempos'] as const
type Pestana = (typeof PESTANAS)[number]

export const Route = createFileRoute('/_app/reportes/')({
  validateSearch: z.object({
    vista: z.enum(PESTANAS).optional().catch(undefined),
    desde: z.iso.date().optional().catch(undefined),
    hasta: z.iso.date().optional().catch(undefined),
  }),
  beforeLoad: () => exigirPermiso('reportes.ver'),
  component: Reportes,
})

/** Periodos rápidos. */
function atajos(hoy: string) {
  const mes = `${hoy.slice(0, 7)}-01`
  const mesPasadoFin = sumarDias(mes, -1)
  return {
    mes: { desde: mes, hasta: hoy, nombre: 'Este mes' },
    pasado: { desde: `${mesPasadoFin.slice(0, 7)}-01`, hasta: mesPasadoFin, nombre: 'Mes pasado' },
    trimestre: { desde: sumarDias(hoy, -89), hasta: hoy, nombre: 'Últimos 90 días' },
    anio: { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy, nombre: 'Este año' },
  }
}

function Reportes() {
  const { vista, desde: d, hasta: h } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const verCostos = usePermiso('usuarios.ver_costo_hora')
  const hoy = diaEnLima()
  const rapidos = atajos(hoy)
  const hasta = h ?? hoy
  const desde = d ?? rapidos.mes.desde
  const pestana: Pestana = vista && (vista !== 'rentabilidad' || verCostos) ? vista : 'resumen'
  const actual = Object.entries(rapidos).find(([, r]) => r.desde === desde && r.hasta === hasta)?.[0] ?? ''
  const ir = (cambio: { vista?: Pestana; desde?: string; hasta?: string }) => void navigate({ search: (x) => ({ ...x, ...cambio }), replace: true })

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">Indicadores de la producción, la cobranza y la rentabilidad del periodo.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={actual}
          onValueChange={(v) => v && ir({ desde: rapidos[v as keyof typeof rapidos].desde, hasta: rapidos[v as keyof typeof rapidos].hasta })}
          className="flex-wrap"
        >
          {Object.entries(rapidos).map(([clave, r]) => (
            <ToggleGroupItem key={clave} value={clave}>
              {r.nombre}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Field className="w-40">
          <FieldLabel htmlFor="rep-desde">Desde</FieldLabel>
          <Input id="rep-desde" type="date" value={desde} max={hasta} onChange={(ev) => ev.target.value && ir({ desde: ev.target.value })} />
        </Field>
        <Field className="w-40">
          <FieldLabel htmlFor="rep-hasta">Hasta</FieldLabel>
          <Input id="rep-hasta" type="date" value={hasta} min={desde} max={hoy} onChange={(ev) => ev.target.value && ir({ hasta: ev.target.value })} />
        </Field>
      </div>

      <Tabs value={pestana} onValueChange={(v) => ir({ vista: v as Pestana })}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="puntualidad">Puntualidad</TabsTrigger>
          <TabsTrigger value="retrabajo">Retrabajo</TabsTrigger>
          <TabsTrigger value="ocupacion">Ocupación</TabsTrigger>
          <TabsTrigger value="cobranza">Cobranza</TabsTrigger>
          {verCostos && (
            <TabsTrigger value="rentabilidad">
              <Lock />
              Rentabilidad
            </TabsTrigger>
          )}
          <TabsTrigger value="tiempos">Tiempos</TabsTrigger>
        </TabsList>
        <TabsContent value="resumen" className="mt-4">
          <ResumenTablero desde={desde} hasta={hasta} />
        </TabsContent>
        <TabsContent value="puntualidad" className="mt-4">
          <ReportePuntualidadVista desde={desde} hasta={hasta} />
        </TabsContent>
        <TabsContent value="retrabajo" className="mt-4">
          <ReporteRetrabajoVista desde={desde} hasta={hasta} />
        </TabsContent>
        <TabsContent value="ocupacion" className="mt-4">
          <ReporteOcupacionVista desde={desde} hasta={hasta} />
        </TabsContent>
        <TabsContent value="cobranza" className="mt-4">
          <ReporteCobranzaVista desde={desde} hasta={hasta} />
        </TabsContent>
        {verCostos && (
          <TabsContent value="rentabilidad" className="mt-4">
            <ReporteRentabilidadVista desde={desde} hasta={hasta} />
          </TabsContent>
        )}
        <TabsContent value="tiempos" className="mt-4">
          <ReporteTiemposVista desde={desde} hasta={hasta} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
