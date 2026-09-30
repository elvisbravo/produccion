import { enlaceWhatsapp, formatearCelular, formatearSoles } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { MessageCircle, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cobranzaQuery } from '@/features/trabajos/api'
import { InsigniaEstadoCuota } from '@/features/trabajos/components/insignias'
import { diasHasta, formatearFecha, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/contratos/')({
  beforeLoad: () => exigirPermiso('contratos.ver_montos'),
  component: Cobranza,
})

type Vista = 'vencidas' | 'semana' | 'todas'

function Cobranza() {
  const { data, isPending } = useQuery(cobranzaQuery)
  const [vista, setVista] = useState<Vista>('todas')

  const cuotas =
    data?.cuotas.filter((q) =>
      vista === 'vencidas' ? q.estado === 'vencida' : vista === 'semana' ? q.estado !== 'vencida' && diasHasta(q.vencimiento, data.hoy) <= 7 : true,
    ) ?? []

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Contratos y pagos</h1>
        <p className="text-sm text-muted-foreground">Cuotas por cobrar de los contratos vigentes, de la más atrasada a la más lejana.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Total etiqueta="Vencido" valor={data?.totales.vencido} alerta />
        <Total etiqueta="Vence en los próximos 7 días" valor={data?.totales.porVencer7Dias} />
        <Total etiqueta="Pendiente total" valor={data?.totales.pendienteTotal} />
      </div>

      <ToggleGroup type="single" variant="outline" value={vista} onValueChange={(v) => v && setVista(v as Vista)} className="w-fit">
        <ToggleGroupItem value="todas">Todas</ToggleGroupItem>
        <ToggleGroupItem value="vencidas">Vencidas</ToggleGroupItem>
        <ToggleGroupItem value="semana">Esta semana</ToggleGroupItem>
      </ToggleGroup>

      {isPending ? (
        <Skeleton className="h-64" />
      ) : cuotas.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Wallet />
            </EmptyMedia>
            <EmptyTitle>Nada por cobrar aquí</EmptyTitle>
            <EmptyDescription>No hay cuotas con saldo en esta vista.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vence</TableHead>
                <TableHead>Trabajo</TableHead>
                <TableHead>Titular</TableHead>
                <TableHead>Cuota</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cuotas.map((q) => {
                const dias = diasHasta(q.vencimiento, data!.hoy)
                return (
                  <TableRow key={q.cuotaId}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{formatearFecha(q.vencimiento)}</span>
                        <span className={cn('text-xs', dias < 0 ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground')}>
                          {dias < 0 ? `hace ${-dias} d` : dias === 0 ? 'hoy' : `en ${dias} d`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link to="/trabajos/$id" params={{ id: q.trabajo.id }} className="font-mono text-xs font-medium hover:underline">
                        {q.trabajo.codigo}
                      </Link>
                      <div className="text-xs text-muted-foreground">{q.trabajo.tipoTrabajo}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{nombreCompleto(q.titular) ?? '—'}</span>
                        {q.titular && <span className="font-mono text-xs text-muted-foreground">{formatearCelular(q.titular.celular)}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {q.numero} de {q.totalCuotas}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatearSoles(q.saldo)}
                      {q.saldo !== q.monto && <div className="text-xs font-normal text-muted-foreground">de {formatearSoles(q.monto)}</div>}
                    </TableCell>
                    <TableCell>
                      <InsigniaEstadoCuota estado={q.estado} />
                    </TableCell>
                    <TableCell>
                      {q.titular && (
                        <Button variant="ghost" size="icon-sm" asChild>
                          <a
                            href={enlaceWhatsapp(
                              q.titular.celular,
                              `Hola ${q.titular.nombres ?? ''}, te recordamos que la cuota ${q.numero} de tu trabajo ${q.trabajo.codigo} (${formatearSoles(q.saldo)}) vence el ${formatearFecha(q.vencimiento)}.`,
                            )}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Enviar recordatorio por WhatsApp a ${nombreCompleto(q.titular) ?? q.titular.celular}`}
                          >
                            <MessageCircle />
                          </a>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function Total({ etiqueta, valor, alerta }: { etiqueta: string; valor: number | undefined; alerta?: boolean }) {
  return (
    <div className="flex flex-col rounded-xl border bg-card px-4 py-3">
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      <span className={cn('text-2xl font-semibold tabular-nums', alerta && valor ? 'text-red-700 dark:text-red-400' : '')}>
        {valor === undefined ? '–' : formatearSoles(valor)}
      </span>
    </div>
  )
}
