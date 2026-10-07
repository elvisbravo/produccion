import { NOMBRE_ESTADO_EXTRA, NOMBRE_MODALIDAD_EXTRA, formatearSoles, sumarDias, diaEnLima, type EstadoExtra, type HoraExtraItem, type VistaExtras } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Check, ChevronLeft, ChevronRight, MoreHorizontal, Plus, Timer, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { extrasQuery, useAccionExtra, useGuardarTopes } from '@/features/produccion/api-contingencias'
import { BolsaHoras } from '@/features/produccion/components/bolsa-horas'
import { DialogoProponerExtra } from '@/features/produccion/components/dialogo-proponer-extra'
import { ApiError } from '@/lib/api'
import { duracion, formatearFecha, haceCuanto, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { useAlcance, usePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { useSesion } from '@/stores/sesion'

export const Route = createFileRoute('/_app/horas-extra/')({
  validateSearch: z.object({
    vista: z.enum(['mias', 'por_aprobar', 'todas', 'bolsa']).optional().catch(undefined),
    mes: z.string().regex(/^\d{4}-\d{2}$/).optional().catch(undefined),
  }),
  beforeLoad: () => exigirPermiso('horas_extra.ver'),
  component: HorasExtra,
})

const nombreMes = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const finDeMes = (mes: string) => sumarDias(`${sumarDias(`${mes}-01`, 32).slice(0, 7)}-01`, -1)
const mover = (mes: string, n: number) => {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

const ESTILO: Record<EstadoExtra, string> = {
  propuesta: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  aceptada: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
  rechazada: 'text-muted-foreground',
  aprobada: 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200',
  realizada: '',
  anulada: 'text-muted-foreground line-through',
}

function HorasExtra() {
  const { vista: buscada, mes: mesBuscado } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const puedeProponer = usePermiso('programacion.proponer_extra')
  const puedeAprobar = usePermiso('horas_extra.aprobar')
  const puedeTopes = usePermiso('parametros.editar')
  const veTodas = useAlcance('horas_extra.ver') === 'todos'
  const mesActual = diaEnLima().slice(0, 7)
  const mes = mesBuscado ?? mesActual
  const esBolsa = buscada === 'bolsa'
  const vista: VistaExtras = buscada && buscada !== 'bolsa' ? buscada : puedeAprobar ? 'por_aprobar' : veTodas ? 'todas' : 'mias'
  const { data, isPending } = useQuery({ ...extrasQuery(vista, `${mes}-01`, finDeMes(mes)), enabled: !esBolsa })
  const [proponiendo, setProponiendo] = useState(false)
  const [topes, setTopes] = useState(false)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Horas extra y bonos</h1>
          <p className="text-sm text-muted-foreground">
            Se proponen, la persona acepta, producción (la asistente o el jefe) aprueba y luego se registran como realizadas. Las horas extra aprobadas abren capacidad en la agenda.
          </p>
        </div>
        <div className="flex gap-2">
          {puedeTopes && (
            <Button variant="outline" onClick={() => setTopes(true)}>
              Topes
            </Button>
          )}
          {puedeProponer && (
            <Button onClick={() => setProponiendo(true)}>
              <Plus />
              Proponer
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={esBolsa ? 'bolsa' : vista}
          onValueChange={(v) => v && void navigate({ search: (x) => ({ ...x, vista: v as VistaExtras | 'bolsa' }), replace: true })}
        >
          <ToggleGroupItem value="mias">Mías</ToggleGroupItem>
          {puedeAprobar && <ToggleGroupItem value="por_aprobar">Por aprobar</ToggleGroupItem>}
          {veTodas && <ToggleGroupItem value="todas">Todas</ToggleGroupItem>}
          <ToggleGroupItem value="bolsa">Bolsa de horas</ToggleGroupItem>
        </ToggleGroup>
        {!esBolsa && vista !== 'por_aprobar' && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => void navigate({ search: (x) => ({ ...x, mes: mover(mes, -1) }), replace: true })} aria-label="Mes anterior">
              <ChevronLeft />
            </Button>
            <span className="w-36 text-center text-sm font-medium first-letter:uppercase">{nombreMes.format(new Date(`${mes}-15T12:00:00Z`))}</span>
            <Button variant="outline" size="icon" onClick={() => void navigate({ search: (x) => ({ ...x, mes: mover(mes, 1) }), replace: true })} aria-label="Mes siguiente">
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>

      {!esBolsa && data && vista !== 'por_aprobar' && data.personas.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Aprobado y realizado en el mes
            {(data.topes.semanal !== null || data.topes.mensual !== null) &&
              ` · topes por persona: ${data.topes.semanal ?? '—'} h a la semana, ${data.topes.mensual ?? '—'} h al mes`}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.personas.map((p) => (
              <div key={p.usuario.id} className="flex flex-col gap-1 rounded-xl border bg-card px-4 py-3">
                <span className="font-medium">{nombreCompleto(p.usuario)}</span>
                <span className="text-sm text-muted-foreground">
                  {duracion(p.minutosPlanificados)} planificadas{p.minutosReales > 0 && ` · ${duracion(p.minutosReales)} reales`}
                  {p.bonos > 0 && ` · bonos ${formatearSoles(p.bonos)}`}
                </span>
                {data.topes.mensual !== null && p.minutosPlanificados > data.topes.mensual * 60 && (
                  <span className="text-xs text-red-700 dark:text-red-400">Supera el tope mensual</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {esBolsa ? (
        <BolsaHoras puedeCanjear={puedeAprobar} />
      ) : isPending || !data ? (
        <Skeleton className="h-64" />
      ) : data.items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Timer />
            </EmptyMedia>
            <EmptyTitle>Nada por aquí</EmptyTitle>
            <EmptyDescription>{vista === 'por_aprobar' ? 'No hay propuestas aceptadas esperando aprobación.' : 'Sin horas extra ni bonos en este mes.'}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead>Qué</TableHead>
                <TableHead>Cuándo / monto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((x) => (
                <FilaExtra key={x.id} x={x} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {proponiendo && <DialogoProponerExtra onCerrar={() => setProponiendo(false)} />}
      {topes && data && <DialogoTopes semanal={data.topes.semanal} mensual={data.topes.mensual} onCerrar={() => setTopes(false)} />}
    </div>
  )
}

function FilaExtra({ x }: { x: HoraExtraItem }) {
  const usuarioId = useSesion((s) => s.usuario?.id)
  const puedeAprobar = usePermiso('horas_extra.aprobar')
  const accion = useAccionExtra()
  const [rechazando, setRechazando] = useState(false)
  const esMia = x.usuario.id === usuarioId

  const hacer = async (a: 'responder' | 'aprobar' | 'realizar' | 'anular', cuerpo?: object, exito = 'Listo') => {
    try {
      await accion.mutateAsync({ id: x.id, accion: a, cuerpo })
      toast.success(exito)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar')
    }
  }

  const opciones = [
    esMia && x.estado === 'propuesta' && { texto: 'Aceptar', icono: Check, hacer: () => void hacer('responder', { acepta: true }, 'Aceptaste la propuesta') },
    esMia && x.estado === 'propuesta' && { texto: 'Rechazar', icono: X, hacer: () => setRechazando(true) },
    puedeAprobar && x.estado === 'aceptada' && { texto: 'Aprobar', icono: Check, hacer: () => void hacer('aprobar', undefined, 'Aprobado') },
    puedeAprobar && x.estado === 'aprobada' && { texto: 'Marcar como realizado', icono: Check, hacer: () => void hacer('realizar', {}, 'Registrado como realizado') },
    (x.propuestaPor.id === usuarioId || puedeAprobar) &&
      ['propuesta', 'aceptada', 'aprobada'].includes(x.estado) && { texto: 'Anular', icono: X, hacer: () => void hacer('anular', undefined, 'Anulado') },
  ].filter((o): o is { texto: string; icono: typeof Check; hacer: () => void } => Boolean(o))

  return (
    <TableRow>
      <TableCell className="font-medium">{nombreCompleto(x.usuario)}</TableCell>
      <TableCell className="whitespace-normal">
        <div className="flex flex-col">
          <span>
            <Badge variant="secondary" className="mr-2">
              {NOMBRE_MODALIDAD_EXTRA[x.modalidad]}
            </Badge>
            {x.descripcion}
          </span>
          <span className="text-xs text-muted-foreground">
            <Link to="/trabajos/$id" params={{ id: x.trabajo.id }} className="font-mono hover:underline">
              {x.trabajo.codigo}
            </Link>
            {x.entregable && ` · ${x.entregable.nombre}`} · propuesta por {nombreCompleto(x.propuestaPor)} {haceCuanto(x.propuestaEn)}
          </span>
          {x.avisos.map((a) => (
            <span key={a} className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="size-3" />
              {a}
            </span>
          ))}
        </div>
      </TableCell>
      <TableCell className="tabular-nums">
        {x.modalidad === 'horas_extra' ? (
          <div className="flex flex-col">
            <span>{formatearFecha(x.fecha)}</span>
            <span className="text-xs text-muted-foreground">
              {x.horaInicio}–{x.horaFin} · {duracion(x.minutos ?? 0)}
              {x.minutosReales !== null && ` (real ${duracion(x.minutosReales)})`}
            </span>
          </div>
        ) : (
          formatearSoles(x.monto ?? 0)
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <Badge variant="outline" className={cn(ESTILO[x.estado])}>
            {esMia && x.estado === 'propuesta' ? 'Te toca responder' : NOMBRE_ESTADO_EXTRA[x.estado]}
          </Badge>
          {x.motivoRechazo && <span className="max-w-48 truncate text-xs text-muted-foreground">{x.motivoRechazo}</span>}
        </div>
      </TableCell>
      <TableCell>
        {opciones.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Acciones" disabled={accion.isPending}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {opciones.map((o) => (
                <DropdownMenuItem key={o.texto} onSelect={o.hacer}>
                  <o.icono /> {o.texto}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {rechazando && <DialogoRechazo onCerrar={() => setRechazando(false)} onConfirmar={(motivo) => void hacer('responder', { acepta: false, motivo }, 'Rechazaste la propuesta')} />}
      </TableCell>
    </TableRow>
  )
}

function DialogoRechazo({ onCerrar, onConfirmar }: { onCerrar: () => void; onConfirmar: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState('')
  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rechazar la propuesta</DialogTitle>
          <DialogDescription>Así producción puede buscar otra opción.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="rech-motivo">¿Por qué no puedes?</FieldLabel>
          <Textarea id="rech-motivo" rows={2} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Volver
          </Button>
          <Button
            variant="destructive"
            disabled={motivo.trim().length < 3}
            onClick={() => {
              onConfirmar(motivo)
              onCerrar()
            }}
          >
            Rechazar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogoTopes({ semanal, mensual, onCerrar }: { semanal: number | null; mensual: number | null; onCerrar: () => void }) {
  const guardar = useGuardarTopes()
  const [s, setS] = useState(semanal?.toString() ?? '')
  const [m, setM] = useState(mensual?.toString() ?? '')
  const confirmar = async () => {
    try {
      await guardar.mutateAsync({ semanal: s === '' ? null : Number(s), mensual: m === '' ? null : Number(m) })
      toast.success('Topes guardados')
      onCerrar()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar')
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Topes de horas extra</DialogTitle>
          <DialogDescription>Por persona. Al superarlos, el sistema lo advierte (no lo impide). Vacío = sin tope.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="tope-s">Por semana (h)</FieldLabel>
            <Input id="tope-s" type="number" min={0} value={s} onChange={(ev) => setS(ev.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="tope-m">Por mes (h)</FieldLabel>
            <Input id="tope-m" type="number" min={0} value={m} onChange={(ev) => setM(ev.target.value)} />
          </Field>
        </div>
        <FieldDescription>Las excepciones por persona llegarán con la administración de usuarios.</FieldDescription>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void confirmar()} disabled={guardar.isPending}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
