import {
  diaEnLima,
  enlaceWhatsapp,
  formatearCelular,
  horaEnLima,
  NOMBRE_SEGUIMIENTO,
  SEGUIMIENTOS,
  sumarDias,
  type DiaEntregas,
  type EntregaFila,
  type Seguimiento,
  type TableroEntregas,
} from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { CalendarRange, ChevronLeft, ChevronRight, ClipboardList, Download, ExternalLink, Gift, PartyPopper, Pencil, UserRoundCog } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DialogoApoyo } from '@/features/produccion/components/dialogo-apoyo'
import { DialogoInicio } from '@/features/produccion/components/dialogo-inicio'
import { PuntoSemaforo } from '@/features/produccion/components/insignias'
import { asistentesQuery, candidatosEquipoQuery, entregasQuery, useGuardarNotaEntrega } from '@/features/trabajos/api'
import { EtiquetasSeguimiento, LeyendaSeguimiento } from '@/features/trabajos/components/insignias'
import { duracion, formatearFecha, formatearHora, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { usePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'

const TODOS = 'todos'

export const Route = createFileRoute('/_app/entregas/')({
  validateSearch: z.object({
    dia: z.iso.date().optional().catch(undefined),
    auxiliarId: z.uuid().optional().catch(undefined),
    jefeId: z.uuid().optional().catch(undefined),
    asistenteId: z.uuid().optional().catch(undefined),
    seguimiento: z.enum(SEGUIMIENTOS).optional().catch(undefined),
  }),
  beforeLoad: () => exigirPermiso('entregas.ver'),
  component: TableroEntregasPantalla,
})

/** Lunes y domingo de la semana de un día. */
function semanaDe(dia: string) {
  const lunes = sumarDias(dia, -((new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7))
  return { lunes, domingo: sumarDias(lunes, 6) }
}

/** El color de la fila es el del seguimiento del trabajo (los mismos colores que usa el equipo en su hoja). */
const FONDO_FILA: Partial<Record<Seguimiento, string>> = {
  entregado: 'bg-yellow-100/70 dark:bg-yellow-900/20',
  urgente: 'bg-red-100/80 dark:bg-red-900/25',
  pendiente_pago: 'bg-zinc-200/70 dark:bg-zinc-700/30',
  turnitin: 'bg-fuchsia-100/70 dark:bg-fuchsia-900/20',
  abordando: 'bg-cyan-100/80 dark:bg-cyan-900/25',
  programado: 'bg-green-100/70 dark:bg-green-900/20',
  valorado: 'bg-purple-100/70 dark:bg-purple-900/20',
  suspendido: 'bg-orange-100/70 dark:bg-orange-900/20',
}

const nombreDia = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const tituloDia = (dia: string) => {
  const t = nombreDia.format(new Date(`${dia}T12:00:00Z`))
  return t.charAt(0).toUpperCase() + t.slice(1)
}
const corto = (u: { nombres: string; apellidos: string }) => u.nombres.split(' ')[0]
/** El día (Lima) de un instante ISO. */
const diaDe = (iso: string) => diaEnLima(new Date(iso))

function TableroEntregasPantalla() {
  const filtros = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const hoy = diaEnLima()
  const dia = filtros.dia ?? hoy
  const { lunes, domingo } = semanaDe(dia)
  const { data, isPending } = useQuery(entregasQuery({ desde: lunes, hasta: domingo, auxiliarId: filtros.auxiliarId, jefeId: filtros.jefeId, asistenteId: filtros.asistenteId, seguimiento: filtros.seguimiento }))
  const { data: equipo } = useQuery(candidatosEquipoQuery)
  const { data: asistentes = [] } = useQuery(asistentesQuery)
  const puedeExportar = usePermiso('entregas.exportar')
  const ir = (cambio: Partial<{ dia: string | undefined; auxiliarId: string | undefined; jefeId: string | undefined; asistenteId: string | undefined; seguimiento: Seguimiento | undefined }>) =>
    void navigate({ search: (s) => ({ ...s, ...cambio }), replace: true })
  const filas = data?.dias.reduce((n, d) => n + d.filas.length, 0) ?? 0

  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Entregas</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Un trabajo por fila, con la actividad que toca ahora, quién la hace y cuándo se entrega, agrupado por día de entrega. El color es el estado del trabajo.
          </p>
        </div>
        {puedeExportar && (
          <Button variant="outline" disabled={!data || filas === 0} onClick={() => data && descargarCsv(data)}>
            <Download />
            Exportar a Excel
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => ir({ dia: sumarDias(dia, -7) })}>
            <ChevronLeft />
          </Button>
          <span className="inline-flex h-9 min-w-56 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium">
            <CalendarRange className="size-4" />
            Semana del {formatearFecha(lunes)} al {formatearFecha(domingo)}
          </span>
          <Button variant="outline" size="icon" aria-label="Semana siguiente" onClick={() => ir({ dia: sumarDias(dia, 7) })}>
            <ChevronRight />
          </Button>
          <Button variant="outline" onClick={() => ir({ dia: undefined })} disabled={semanaDe(hoy).lunes === lunes}>
            Esta semana
          </Button>
        </div>
        <Selector etiqueta="Auxiliar" todos="Todos los auxiliares" valor={filtros.auxiliarId} opciones={equipo?.auxiliares ?? []} onCambio={(v) => ir({ auxiliarId: v })} />
        <Selector etiqueta="Jefe de producción" todos="Todos los jefes" valor={filtros.jefeId} opciones={equipo?.jefes ?? []} onCambio={(v) => ir({ jefeId: v })} />
        <Selector etiqueta="Asistente administrativa" todos="Todas las asistentes" valor={filtros.asistenteId} opciones={asistentes} onCambio={(v) => ir({ asistenteId: v })} />
        <Select value={filtros.seguimiento ?? TODOS} onValueChange={(v) => ir({ seguimiento: v === TODOS ? undefined : (v as Seguimiento) })}>
          <SelectTrigger aria-label="Estado" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los estados</SelectItem>
            {SEGUIMIENTOS.filter((x) => x !== 'cancelado' && x !== 'entregado').map((x) => (
              <SelectItem key={x} value={x}>
                {NOMBRE_SEGUIMIENTO[x]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <details className="rounded-md border px-3 py-1.5 text-sm">
          <summary className="cursor-pointer select-none">Leyenda de colores</summary>
          <div className="pt-3">
            <LeyendaSeguimiento />
          </div>
        </details>
      </div>

      {isPending ? (
        <Skeleton className="h-64" />
      ) : !data || data.dias.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardList />
            </EmptyMedia>
            <EmptyTitle>No hay entregas esta semana</EmptyTitle>
            <EmptyDescription>Prueba con otra semana o quita los filtros.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        data.dias.map((d) => <Dia key={d.fecha} dia={d} hoy={hoy} />)
      )}
    </div>
  )
}

function Selector({ etiqueta, todos, valor, opciones, onCambio }: { etiqueta: string; todos: string; valor: string | undefined; opciones: { id: string; nombres: string; apellidos: string }[]; onCambio: (v: string | undefined) => void }) {
  return (
    <Select value={valor ?? TODOS} onValueChange={(v) => onCambio(v === TODOS ? undefined : v)}>
      <SelectTrigger aria-label={etiqueta} className="w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{todos}</SelectItem>
        {opciones.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {nombreCompleto(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Dia({ dia, hoy }: { dia: DiaEntregas; hoy: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
        {tituloDia(dia.fecha)}
        {dia.fecha === hoy && <Badge>Hoy</Badge>}
        <span className="text-sm font-normal text-muted-foreground">
          · {dia.filas.length} {dia.filas.length === 1 ? 'entrega' : 'entregas'}
        </span>
      </h2>
      {dia.feriado && (
        <div className="flex items-center gap-2 rounded-md bg-fuchsia-200 px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-fuchsia-950 dark:bg-fuchsia-900/50 dark:text-fuchsia-50">
          <PartyPopper className="size-4" />
          Feriado · {dia.feriado.nombre}
          {dia.feriado.medioDia && ' (medio día)'}
        </div>
      )}
      {dia.cumpleanos.length > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-pink-100 px-3 py-1.5 text-sm font-medium uppercase tracking-wide text-pink-950 dark:bg-pink-900/30 dark:text-pink-50">
          <Gift className="size-4" />
          Cumpleaños {dia.cumpleanos.join(', ')}
        </div>
      )}
      {dia.filas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table className="min-w-[88rem]">
            <TableHeader>
              <TableRow>
                <TableHead>Actividad</TableHead>
                <TableHead>Horas</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Enlace</TableHead>
                <TableHead>Entrega por el cliente</TableHead>
                <TableHead>Jefe de valoración</TableHead>
                <TableHead>Auxiliar</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead>Asistente</TableHead>
                <TableHead>Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dia.filas.map((f) => (
                <Fila key={f.trabajo.id} f={f} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}

function Fila({ f }: { f: EntregaFila }) {
  const t = f.trabajo
  const puedeProgramar = usePermiso('programacion.programar')
  const puedeReasignar = usePermiso('programacion.reasignar')
  const [dialogo, setDialogo] = useState<'inicio' | 'auxiliar' | null>(null)
  const cliente = t.proveedor ? `${t.proveedor.nombres} ${t.proveedor.apellidos}` : (nombreCompleto(t.titular) ?? (t.titular ? formatearCelular(t.titular.celular) : null))
  const fondo = FONDO_FILA[t.seguimiento.principal]

  return (
    <TableRow className={cn(fondo)}>
      <TableCell className="min-w-44">
        {f.actividad ? (
          <>
            <div className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: f.actividad.color }} aria-hidden="true" />
              <span className="font-semibold uppercase">{f.actividad.nombre}</span>
            </div>
            {f.actividad.titulo && <div className="max-w-56 truncate text-xs text-muted-foreground">{f.actividad.titulo}</div>}
          </>
        ) : (
          <span className="text-muted-foreground">Sin tareas</span>
        )}
        <div className="mt-1">
          <EtiquetasSeguimiento seguimiento={t.seguimiento} />
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {f.actividad ? duracion(f.actividad.minutosEstimados) : '—'}
        {f.revisarTiempos && f.actividad && <div className="text-xs font-medium text-red-700 dark:text-red-400">Revisar tiempos ({duracion(f.actividad.minutosHechos)})</div>}
      </TableCell>
      <TableCell className="min-w-44">
        <Link to="/trabajos/$id" params={{ id: t.id }} className="font-medium uppercase hover:underline">
          {cliente ?? t.codigo}
        </Link>
        <div className="font-mono text-xs text-muted-foreground">
          {t.codigo}
          {t.titular && (
            <a href={enlaceWhatsapp(t.titular.celular)} target="_blank" rel="noreferrer" className="ml-2 hover:underline">
              {formatearCelular(t.titular.celular)}
            </a>
          )}
        </div>
      </TableCell>
      <TableCell>
        {f.enlace ? (
          <a href={f.enlace} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-700 underline-offset-4 hover:underline dark:text-blue-400">
            Drive <ExternalLink className="size-3" />
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">{formatearFecha(f.entregaCliente)}</TableCell>
      <TableCell className="uppercase">{t.jefeResponsable ? corto(t.jefeResponsable) : <span className="text-muted-foreground">—</span>}</TableCell>
      <TableCell className="uppercase">
        <span className="inline-flex items-center gap-1">
          {f.auxiliares.length > 0 ? f.auxiliares.map(corto).join(' - ') : <span className="text-muted-foreground">—</span>}
          {puedeReasignar && f.actividad && (
            <Button variant="ghost" size="icon-xs" aria-label="Cambiar el auxiliar o buscar apoyo" onClick={() => setDialogo('auxiliar')}>
              <UserRoundCog />
            </Button>
          )}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <span className="inline-flex items-center gap-1">
          {f.inicio ? (
            <span className="inline-flex items-center gap-1.5">
              {f.semaforo && <PuntoSemaforo semaforo={f.semaforo} fin={f.fin} />}
              {formatearFecha(f.inicio)} · {formatearHora(f.inicio)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {puedeProgramar && f.actividad && (
            <Button variant="ghost" size="icon-xs" aria-label="Cambiar el inicio" onClick={() => setDialogo('inicio')}>
              <Pencil />
            </Button>
          )}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap">{formatearFecha(f.entregaInterna)}</TableCell>
      <TableCell className="uppercase">{f.asistente ? corto(f.asistente) : <span className="text-muted-foreground">—</span>}</TableCell>
      <TableCell className="min-w-52">
        <NotaEditable key={f.nota ?? ''} trabajoId={t.id} nota={f.nota} />
        {dialogo === 'inicio' && f.actividad && (
          <DialogoInicio tareaId={f.actividad.tareaId} actividad={f.actividad.nombre} fecha={f.inicio ? diaDe(f.inicio) : ''} hora={f.inicio ? horaEnLima(new Date(f.inicio)) : ''} onCerrar={() => setDialogo(null)} />
        )}
        {dialogo === 'auxiliar' && f.actividad && <DialogoApoyo tareaId={f.actividad.tareaId} onCerrar={() => setDialogo(null)} />}
      </TableCell>
    </TableRow>
  )
}

/** La nota corta del equipo: se edita en la misma fila y se guarda al salir del campo. */
function NotaEditable({ trabajoId, nota }: { trabajoId: string; nota: string | null }) {
  const puedeEditar = usePermiso('trabajos.editar')
  const guardar = useGuardarNotaEntrega(trabajoId)
  const [texto, setTexto] = useState(nota ?? '')
  if (!puedeEditar) return nota ? <span className="text-sm">{nota}</span> : <span className="text-muted-foreground">—</span>
  const confirmar = async () => {
    const limpio = texto.trim()
    if (limpio === (nota ?? '')) return
    try {
      await guardar.mutateAsync({ nota: limpio || undefined })
    } catch (err) {
      setTexto(nota ?? '')
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar la nota')
    }
  }
  return (
    <Input
      aria-label="Nota"
      className="h-8 bg-background/60"
      placeholder="Escribe una nota…"
      maxLength={300}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => void confirmar()}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

/** Descarga la semana como CSV (se abre directamente en Excel). */
function descargarCsv(tablero: TableroEntregas) {
  const cabecera = ['Entrega', 'Actividad', 'Horas', 'Cliente', 'Celular', 'Enlace', 'Entrega por el cliente', 'Jefe de valoración', 'Auxiliar', 'Inicio', 'Asistente', 'Estado', 'Nota']
  const filas = tablero.dias.flatMap((d) =>
    d.filas.map((f) => {
      const t = f.trabajo
      const cliente = t.proveedor ? `${t.proveedor.nombres} ${t.proveedor.apellidos}` : (nombreCompleto(t.titular) ?? '')
      return [
        d.fecha,
        f.actividad?.nombre ?? '',
        f.actividad ? duracion(f.actividad.minutosEstimados) : '',
        cliente,
        t.titular?.celular ?? '',
        f.enlace ?? '',
        f.entregaCliente,
        t.jefeResponsable ? corto(t.jefeResponsable) : '',
        f.auxiliares.map(corto).join(' - '),
        f.inicio ? `${formatearFecha(f.inicio)} ${formatearHora(f.inicio)}` : '',
        f.asistente ? corto(f.asistente) : '',
        [NOMBRE_SEGUIMIENTO[t.seguimiento.principal], ...t.seguimiento.etiquetas.map((e) => NOMBRE_SEGUIMIENTO[e])].join(', '),
        f.nota ?? '',
      ]
    }),
  )
  const celda = (v: string) => `"${v.replaceAll('"', '""')}"`
  const texto = '﻿' + [cabecera, ...filas].map((fila) => fila.map(celda).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `entregas-${tablero.desde}-al-${tablero.hasta}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
