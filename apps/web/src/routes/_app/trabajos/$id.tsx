import {
  diaEnLima,
  enlaceWhatsapp,
  formatearCelular,
  formatearSoles,
  NOMBRE_FUNCION_EQUIPO,
  NOMBRE_METODO_PAGO,
  NOMBRE_TIPO_DOCUMENTO,
  type ContratoDetalle,
  type PagoDetalle,
  type TrabajoDetalle,
} from '@grupoes/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ArrowLeft, Ban, ExternalLink, History, MessageCircle, Plus, Printer, Star, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Can } from '@/components/can'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { HiloComentarios } from '@/features/comentarios/components/hilo-comentarios'
import { SeccionEntregables } from '@/features/produccion/components/seccion-entregables'
import { UrgenciaDelTrabajo } from '@/features/produccion/components/urgencias'
import { InsigniaPrioridad } from '@/features/prospectos/components/insignias'
import { trabajoQuery } from '@/features/trabajos/api'
import { DialogoAnularPago, DialogoEquipo, DialogoPago } from '@/features/trabajos/components/dialogos-trabajo'
import { SeccionAdicionales } from '@/features/trabajos/components/adicionales'
import { EtiquetasSeguimiento, InsigniaEstadoCuota } from '@/features/trabajos/components/insignias'
import { AvisoFechasFijas, BotonFijarFechas, MarcaFechasFijas } from '@/features/trabajos/components/fechas-fijas'
import { AvisoEnEspera, BotonPausar } from '@/features/trabajos/components/pausa'
import { AvisoValoracion, BotonValorar } from '@/features/trabajos/components/valoracion'
import { CobroPendiente } from '@/features/trabajos/components/cobro'
import { ApiError } from '@/lib/api'
import { diasHasta, duracion, formatearFecha, formatearFechaHora, haceCuanto, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/trabajos/$id')({
  beforeLoad: () => exigirPermiso('trabajos.ver'),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(trabajoQuery(params.id))
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 400)) throw notFound()
      throw error
    }
  },
  component: DetalleTrabajo,
})

function DetalleTrabajo() {
  const { id } = Route.useParams()
  const { data: t } = useSuspenseQuery(trabajoQuery(id))
  const titular = t.integrantes.find((i) => i.esTitular) ?? t.integrantes[0] ?? null
  const hoy = diaEnLima()
  const dias = diasHasta(t.fechaLimite, hoy)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col gap-4">
        <Link to="/trabajos" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Trabajos
        </Link>
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{t.codigo}</span>
              <EtiquetasSeguimiento seguimiento={t.seguimiento} />
              {t.fechasFijas && <MarcaFechasFijas motivo={t.fechasFijas.motivo} />}
              <InsigniaPrioridad nombre={t.prioridad.nombre} color={t.prioridad.color} />
            </div>
            {t.proveedor && titular ? (
              <>
                <h1 className="text-2xl font-semibold tracking-tight">
                  <Link to="/clientes/$id" params={{ id: titular.id }} className="underline-offset-4 hover:underline">
                    {nombreCompleto(titular) ?? formatearCelular(titular.celular)}
                  </Link>
                </h1>
                <p className="text-sm">
                  <Badge variant="outline" className="mr-2 align-middle">
                    Proveedor
                  </Badge>
                  <Link to="/proveedores/$id" params={{ id: t.proveedor.id }} className="underline-offset-4 hover:underline">
                    {t.proveedor.nombres} {t.proveedor.apellidos}
                  </Link>
                </p>
              </>
            ) : t.proveedor ? (
              <h1 className="text-2xl font-semibold tracking-tight">
                <Badge variant="outline" className="mr-2 align-middle">
                  Proveedor
                </Badge>
                <Link to="/proveedores/$id" params={{ id: t.proveedor.id }} className="underline-offset-4 hover:underline">
                  {t.proveedor.nombres} {t.proveedor.apellidos}
                </Link>
              </h1>
            ) : (
              titular && (
                <h1 className="text-2xl font-semibold tracking-tight">
                  {nombreCompleto(titular) ?? formatearCelular(titular.celular)}
                  {t.integrantes.length > 1 && <span className="text-muted-foreground"> y {t.integrantes.length - 1} más</span>}
                </h1>
              )
            )}
            <p className="text-sm text-muted-foreground">
              {t.tipoTrabajo.nombre}
              {t.nivelAcademico && ` · ${t.nivelAcademico.nombre}`}
              {t.titulo && ` · ${t.titulo}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <BotonPausar t={t} />
            <BotonValorar t={t} />
            <BotonFijarFechas t={t} />
            <span className="mt-1 text-sm text-muted-foreground">Entrega final</span>
            <span className="font-semibold">{formatearFecha(t.fechaLimite)}</span>
            <span className={cn('text-xs', dias < 0 ? 'text-red-700 dark:text-red-400' : dias <= 7 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
              {dias < 0 ? `Venció hace ${-dias} días` : dias === 0 ? 'Vence hoy' : `Faltan ${dias} días`}
            </span>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <AvisoEnEspera t={t} />
          <AvisoFechasFijas t={t} />
          <AvisoValoracion t={t} />
          <UrgenciaDelTrabajo trabajoId={t.id} cerrado={['finalizado', 'cancelado'].includes(t.estado)} />
          <SeccionEntregables t={t} />
          {t.contrato && <Contrato contrato={t.contrato} trabajoId={t.id} deProveedor={Boolean(t.proveedor)} />}
          <CobroPendiente t={t} />
          <Card>
            <CardHeader>
              <CardTitle>Comentarios</CardTitle>
            </CardHeader>
            <CardContent>
              <HiloComentarios entidad="trabajo" entidadId={t.id} />
            </CardContent>
          </Card>
          {t.integrantes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Integrantes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {t.integrantes.map((i) => (
                <div key={i.id} className="flex flex-col gap-2 rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <Link to="/clientes/$id" params={{ id: i.id }} className="font-medium underline-offset-4 hover:underline">
                      {nombreCompleto(i) ?? formatearCelular(i.celular)}
                    </Link>
                    {i.esTitular && (
                      <Badge variant="secondary" className="gap-1">
                        <Star className="fill-current" />
                        Titular
                      </Badge>
                    )}
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Celular</dt>
                    <dd className="flex items-center gap-1 font-mono whitespace-nowrap">
                      {formatearCelular(i.celular)}
                      <Button variant="ghost" size="icon-xs" asChild>
                        <a href={enlaceWhatsapp(i.celular)} target="_blank" rel="noreferrer" aria-label={`Abrir WhatsApp de ${nombreCompleto(i)}`}>
                          <MessageCircle />
                        </a>
                      </Button>
                    </dd>
                    <dt className="text-muted-foreground">Documento</dt>
                    <dd>{i.tipoDocumento ? `${NOMBRE_TIPO_DOCUMENTO[i.tipoDocumento]} ${i.numeroDocumento}` : '—'}</dd>
                    <dt className="text-muted-foreground">Correo</dt>
                    <dd className="truncate">{i.email ?? '—'}</dd>
                  </dl>
                </div>
              ))}
            </CardContent>
          </Card>
          )}
          <DatosTrabajo t={t} />
        </div>

        <div className="flex flex-col gap-6">
          <Equipo t={t} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-4" />
                Línea de tiempo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative flex flex-col gap-4 border-l pl-5">
                {t.eventos.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute top-1.5 -left-[25px] size-2 rounded-full bg-muted-foreground/40" aria-hidden="true" />
                    <p className="text-sm">{e.detalle}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.usuario ? `${nombreCompleto(e.usuario)} · ` : ''}
                      <time dateTime={e.fecha} title={formatearFechaHora(e.fecha)}>
                        {haceCuanto(e.fecha)}
                      </time>
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Equipo({ t }: { t: TrabajoDetalle }) {
  const [editando, setEditando] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)
  const cerrado = ['finalizado', 'cancelado'].includes(t.estado)
  const orden = { auxiliar_principal: 0, auxiliar_apoyo: 1, jefe_responsable: 2 }
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4" />
          Equipo
        </CardTitle>
        {!cerrado && (
          <Can permiso="trabajos.armar_equipo">
            <Button size="sm" variant={t.equipo.length ? 'outline' : 'default'} onClick={() => setEditando(true)}>
              {t.equipo.length ? 'Cambiar' : 'Armar equipo'}
            </Button>
          </Can>
        )}
      </CardHeader>
      <CardContent>
        {t.equipo.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            Sin equipo. El asistente de producción asigna al auxiliar principal y al jefe responsable.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {[...t.equipo]
              .sort((a, b) => orden[a.funcion] - orden[b.funcion])
              .map((m) => (
                <li key={m.id} className="flex flex-col">
                  <span className="font-medium">{nombreCompleto(m.usuario)}</span>
                  <span className="text-xs text-muted-foreground">
                    {NOMBRE_FUNCION_EQUIPO[m.funcion]} · desde {formatearFecha(m.desde)}
                  </span>
                </li>
              ))}
          </ul>
        )}
        {t.historialEquipo.length > 0 && (
          <div className="mt-3">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setVerHistorial((v) => !v)}>
              {verHistorial ? 'Ocultar historial' : `Historial (${t.historialEquipo.length})`}
            </Button>
            {verHistorial && (
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {t.historialEquipo.map((m) => (
                  <li key={m.id} className="text-muted-foreground">
                    <span className="text-foreground">{nombreCompleto(m.usuario)}</span> · {NOMBRE_FUNCION_EQUIPO[m.funcion].toLowerCase()} · {formatearFecha(m.desde)} al{' '}
                    {formatearFecha(m.hasta)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
      {editando && <DialogoEquipo trabajo={t} abierto onAbiertoChange={setEditando} />}
    </Card>
  )
}

function Contrato({ contrato: c, trabajoId, deProveedor }: { contrato: ContratoDetalle; trabajoId: string; deProveedor: boolean }) {
  const [pagando, setPagando] = useState(false)
  const [anulando, setAnulando] = useState<PagoDetalle | null>(null)

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>{deProveedor ? 'Cobro al proveedor' : 'Contrato y pagos'}</CardTitle>
          <CardDescription>
            {deProveedor ? 'Registrado' : 'Firmado'} el {formatearFecha(c.fechaFirma)}
            {c.montoContrato !== null && ` por ${formatearSoles(c.montoContrato)}`} ·{' '}
            {c.formaPago === 'contado' ? 'al contado' : `${c.cuotas?.filter((q) => !q.adicional).length ?? ''} ${deProveedor ? 'pagos' : 'cuotas'}`}
            {!deProveedor && ` · garantía de ${c.diasGarantia} días`}
          </CardDescription>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {c.cuenta && !deProveedor && (
            <Can permiso="contratos.imprimir">
              <Button size="sm" variant="outline" asChild>
                <Link to="/imprimir/contrato/$id" params={{ id: trabajoId }} target="_blank">
                  <Printer />
                  Contrato
                </Link>
              </Button>
            </Can>
          )}
          {c.cuenta && c.cuenta.saldo > 0 && c.estado === 'vigente' && (
            <Can permiso="contratos.registrar_pago">
              <Button size="sm" onClick={() => setPagando(true)}>
                <Plus />
                Registrar pago
              </Button>
            </Can>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!c.cuenta ? (
          <p className="text-sm text-muted-foreground">No tienes permiso para ver los montos del contrato.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Monto
                etiqueta={c.montoContrato !== null && c.montoContrato !== c.cuenta.total ? 'Total con adicionales' : 'Total'}
                valor={formatearSoles(c.cuenta.total)}
              />
              <Monto etiqueta="Pagado" valor={formatearSoles(c.cuenta.pagado)} />
              <Monto etiqueta="Saldo" valor={formatearSoles(c.cuenta.saldo)} destacado={c.cuenta.saldo > 0} />
              <Monto etiqueta="Vencido" valor={formatearSoles(c.cuenta.vencido)} alerta={c.cuenta.vencido > 0} />
            </div>

            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">N.º</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Pagado</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.cuotas?.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell>
                        {q.numero}
                        {q.adicional && <span className="ml-1.5 text-xs text-muted-foreground">adicional {q.adicional}</span>}
                      </TableCell>
                      <TableCell>{formatearFecha(q.vencimiento)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatearSoles(q.monto)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatearSoles(q.pagado)}</TableCell>
                      <TableCell>
                        <InsigniaEstadoCuota estado={q.estado} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {!deProveedor && <SeccionAdicionales contrato={c} />}

            {c.pagos && c.pagos.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Pagos</h3>
                <ul className="divide-y rounded-lg border">
                  {c.pagos.map((p) => (
                    <li key={p.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-sm', p.anulado && 'text-muted-foreground')}>
                      <span className="font-mono text-xs">{p.numeroRecibo}</span>
                      <span className={cn('font-medium tabular-nums', p.anulado && 'line-through')}>{formatearSoles(p.monto)}</span>
                      <span>
                        {NOMBRE_METODO_PAGO[p.metodo]}
                        {p.numeroOperacion && ` · op. ${p.numeroOperacion}`}
                      </span>
                      <span className="text-muted-foreground">
                        {formatearFecha(p.fecha)} · cuota {p.cuotas.map((x) => x.numero).join(', ')}
                      </span>
                      <Can permiso="contratos.imprimir">
                        <Button variant="ghost" size="sm" className="ml-auto" asChild>
                          <Link to="/imprimir/recibo/$id" params={{ id: p.id }} target="_blank">
                            <Printer />
                            Recibo
                          </Link>
                        </Button>
                      </Can>
                      {p.anulado ? (
                        <Badge variant="outline">
                          Anulado{p.anulado.motivo ? `: ${p.anulado.motivo}` : ''}
                        </Badge>
                      ) : (
                        <Can permiso="contratos.anular">
                          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setAnulando(p)}>
                            <Ban />
                            Anular
                          </Button>
                        </Can>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {c.observaciones && <p className="text-sm text-muted-foreground">{c.observaciones}</p>}
      </CardContent>
      {pagando && c.cuenta && <DialogoPago contratoId={c.id} saldo={c.cuenta.saldo} abierto onAbiertoChange={setPagando} />}
      {anulando && <DialogoAnularPago pago={anulando} abierto onAbiertoChange={(v) => !v && setAnulando(null)} />}
    </Card>
  )
}

function Monto({ etiqueta, valor, destacado, alerta }: { etiqueta: string; valor: string; destacado?: boolean; alerta?: boolean }) {
  return (
    <div className="flex flex-col rounded-lg border px-3 py-2">
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      <span className={cn('text-lg font-semibold tabular-nums', destacado && 'text-foreground', alerta && 'text-red-700 dark:text-red-400')}>{valor}</span>
    </div>
  )
}

function DatosTrabajo({ t }: { t: TrabajoDetalle }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos del trabajo</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Dato etiqueta="Universidad">{t.universidad?.nombre}</Dato>
          <Dato etiqueta="Carrera">{t.carrera?.nombre}</Dato>
          <Dato etiqueta="Inicio">{formatearFecha(t.fechaInicio)}</Dato>
          {t.prospecto && (
            <Dato etiqueta="Prospecto de origen">
              <Link to="/prospectos/$id" params={{ id: t.prospecto.id }} className="font-mono underline underline-offset-2">
                {t.prospecto.codigo}
              </Link>
            </Dato>
          )}
          {t.proveedor && (
            <Dato etiqueta="Proveedor">
              <Link to="/proveedores/$id" params={{ id: t.proveedor.id }} className="underline underline-offset-2">
                {t.proveedor.nombres} {t.proveedor.apellidos}
              </Link>
            </Dato>
          )}
          {t.planProveedor && (
            <Dato etiqueta="Actividad del plan">
              {t.planProveedor.actividad} · {duracion(t.planProveedor.minutos)}
            </Dato>
          )}
          <Dato etiqueta="Drive">
            {t.linkDrive && (
              <a href={t.linkDrive} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                Abrir carpeta
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </Dato>
          <Dato etiqueta="Observaciones" completo>
            {t.observaciones}
          </Dato>
          <Dato etiqueta="Detalles" completo>
            {t.detalles && <p className="whitespace-pre-line">{t.detalles}</p>}
          </Dato>
        </dl>
      </CardContent>
    </Card>
  )
}

function Dato({ etiqueta, children, completo }: { etiqueta: string; children: ReactNode; completo?: boolean }) {
  const vacio = children === null || children === undefined || children === false || children === ''
  return (
    <div className={completo ? 'sm:col-span-2 lg:col-span-3' : undefined}>
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5">{vacio ? '—' : children}</dd>
    </div>
  )
}
