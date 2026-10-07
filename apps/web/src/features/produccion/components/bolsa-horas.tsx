import { canjearHorasSchema, diaEnLima, formatearSoles, NOMBRE_TIPO_CANJE, type BolsaPersona, type CanjearHorasDatos, type TipoCanje } from '@grupoes/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ChevronDown, ChevronRight, Hourglass, Loader2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ApiError } from '@/lib/api'
import { duracion, formatearFecha, nombreCompleto } from '@/lib/formato'
import { aplicarErroresApi } from '@/lib/formularios'
import { bolsaQuery, useAnularCanje, useCanjearHoras } from '../api-contingencias'

/**
 * La bolsa de horas extra: lo que cada persona acumuló menos lo que ya canjeó. Quien aprueba canjea por días libres o por dinero (monto a mano).
 */
export function BolsaHoras({ puedeCanjear }: { puedeCanjear: boolean }) {
  const { data, isPending } = useQuery(bolsaQuery)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [canjeando, setCanjeando] = useState<BolsaPersona | null>(null)

  if (isPending || !data) return <Skeleton className="h-48" />
  if (data.personas.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Hourglass />
          </EmptyMedia>
          <EmptyTitle>La bolsa está vacía</EmptyTitle>
          <EmptyDescription>Las horas extra que se marcan «acumular» y ya se realizaron se suman aquí. Después se canjean por días libres o por dinero.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Las horas extra realizadas que se acumularon, menos lo ya canjeado. El canje por días libres descuenta lo que suma la jornada de esos días; el de dinero lleva un monto que se pone a mano.</p>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Persona</TableHead>
              <TableHead>Acumulado</TableHead>
              <TableHead>Canjeado</TableHead>
              <TableHead>Saldo</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.personas.map((p) => {
              const abierto = abierta === p.usuario.id
              return (
                <Fragment key={p.usuario.id}>
                  <TableRow>
                    <TableCell>
                      <Button variant="ghost" size="icon-xs" aria-label={abierto ? 'Ocultar movimientos' : 'Ver movimientos'} onClick={() => setAbierta(abierto ? null : p.usuario.id)}>
                        {abierto ? <ChevronDown /> : <ChevronRight />}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{nombreCompleto(p.usuario)}</TableCell>
                    <TableCell>{duracion(p.acumuladoMinutos)}</TableCell>
                    <TableCell>{duracion(p.canjeadoMinutos)}</TableCell>
                    <TableCell>
                      <Badge variant={p.saldoMinutos > 0 ? 'default' : 'outline'}>{duracion(p.saldoMinutos)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {puedeCanjear && p.saldoMinutos > 0 && (
                        <Button variant="outline" size="sm" onClick={() => setCanjeando(p)}>
                          Canjear
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {abierto && (
                    <TableRow className="bg-muted/30">
                      <TableCell />
                      <TableCell colSpan={5}>
                        <Movimientos persona={p} puedeAnular={puedeCanjear} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {canjeando && <DialogoCanje persona={canjeando} onCerrar={() => setCanjeando(null)} />}
    </div>
  )
}

function Movimientos({ persona, puedeAnular }: { persona: BolsaPersona; puedeAnular: boolean }) {
  const anular = useAnularCanje()
  const quitar = async (id: string) => {
    try {
      await anular.mutateAsync(id)
      toast.success('Canje anulado: las horas volvieron a la bolsa')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo anular')
    }
  }
  return (
    <ul className="flex flex-col gap-1.5 py-1 text-sm">
      {persona.movimientos.map((m) => (
        <li key={m.id} className={m.anulado ? 'flex items-center gap-2 text-muted-foreground line-through' : 'flex items-center gap-2'}>
          <span className="w-24 shrink-0 text-xs text-muted-foreground">{formatearFecha(m.fecha)}</span>
          <Badge variant={m.minutos > 0 ? 'secondary' : 'outline'} className="w-24 justify-center">
            {m.minutos > 0 ? '+' : '−'}
            {duracion(Math.abs(m.minutos))}
          </Badge>
          <span className="min-w-0 flex-1 truncate">
            {m.detalle}
            {m.monto !== null && ` · ${formatearSoles(m.monto)}`}
          </span>
          {puedeAnular && m.tipo !== 'acumulado' && !m.anulado && (
            <Button variant="ghost" size="sm" onClick={() => void quitar(m.id)} disabled={anular.isPending}>
              Anular
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

function DialogoCanje({ persona, onCerrar }: { persona: BolsaPersona; onCerrar: () => void }) {
  const canjear = useCanjearHoras(persona.usuario.id)
  const [error, setError] = useState<string | null>(null)
  const [tipo, setTipo] = useState<TipoCanje>('dias')
  const form = useForm<z.input<typeof canjearHorasSchema>, unknown, CanjearHorasDatos>({
    resolver: zodResolver(canjearHorasSchema),
    defaultValues: { tipo: 'dias', fechaDesde: '', fechaHasta: '', minutos: '', monto: '', nota: '' },
  })
  const e = form.formState.errors

  const enviar = form.handleSubmit(async (datos) => {
    setError(null)
    try {
      await canjear.mutateAsync(datos)
      toast.success(datos.tipo === 'dias' ? 'Días libres registrados' : 'Pago registrado')
      onCerrar()
    } catch (err) {
      setError(aplicarErroresApi(err, form.setError, ['fechaDesde', 'fechaHasta', 'minutos', 'monto', 'nota']))
    }
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Canjear horas de {nombreCompleto(persona.usuario)}</DialogTitle>
            <DialogDescription>Saldo disponible: {duracion(persona.saldoMinutos)}.</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <ToggleGroup
            type="single"
            variant="outline"
            value={tipo}
            onValueChange={(v) => {
              if (!v) return
              setTipo(v as TipoCanje)
              form.setValue('tipo', v as TipoCanje)
            }}
            className="w-full"
          >
            <ToggleGroupItem value="dias" className="flex-1">
              {NOMBRE_TIPO_CANJE.dias}
            </ToggleGroupItem>
            <ToggleGroupItem value="dinero" className="flex-1">
              {NOMBRE_TIPO_CANJE.dinero}
            </ToggleGroupItem>
          </ToggleGroup>
          {tipo === 'dias' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={Boolean(e.fechaDesde)}>
                <FieldLabel htmlFor="canje-desde">Desde</FieldLabel>
                <Input id="canje-desde" type="date" min={diaEnLima()} {...form.register('fechaDesde')} />
                <FieldError errors={[e.fechaDesde]} />
              </Field>
              <Field data-invalid={Boolean(e.fechaHasta)}>
                <FieldLabel htmlFor="canje-hasta">Hasta</FieldLabel>
                <Input id="canje-hasta" type="date" min={diaEnLima()} {...form.register('fechaHasta')} />
                <FieldError errors={[e.fechaHasta]} />
              </Field>
              <FieldDescription className="col-span-2">Se descuenta lo que suma su jornada en esos días (feriados y descansos no cuentan) y esos días quedan libres en el calendario.</FieldDescription>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={Boolean(e.minutos)}>
                <FieldLabel htmlFor="canje-minutos">Minutos a canjear</FieldLabel>
                <Input id="canje-minutos" type="number" inputMode="numeric" min={15} step={15} placeholder={String(persona.saldoMinutos)} {...form.register('minutos')} />
                <FieldDescription>Vacío: todo el saldo.</FieldDescription>
                <FieldError errors={[e.minutos]} />
              </Field>
              <Field data-invalid={Boolean(e.monto)}>
                <FieldLabel htmlFor="canje-monto">Monto (S/)</FieldLabel>
                <Input id="canje-monto" type="number" inputMode="decimal" min={1} step="0.01" {...form.register('monto')} />
                <FieldDescription>Se pone a mano.</FieldDescription>
                <FieldError errors={[e.monto]} />
              </Field>
            </div>
          )}
          <Field data-invalid={Boolean(e.nota)}>
            <FieldLabel htmlFor="canje-nota">Nota (opcional)</FieldLabel>
            <Input id="canje-nota" placeholder="Ej.: pagado en efectivo" {...form.register('nota')} />
            <FieldError errors={[e.nota]} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={canjear.isPending}>
              {canjear.isPending && <Loader2 className="animate-spin" />}
              Canjear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
