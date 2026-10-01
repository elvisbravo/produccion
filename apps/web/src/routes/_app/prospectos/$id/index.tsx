import { diaEnLima, enlaceWhatsapp, formatearCelular, formatearSoles, NOMBRE_TIPO_DOCUMENTO, type CatalogosProspecto, type ProspectoEventoItem, type ResultadoCompletar, type TareaItem } from '@grupoes/shared'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ArrowLeft, BadgeCheck, BriefcaseBusiness, CalendarPlus, ClipboardList, ExternalLink, FilePenLine, FileText, History, MessageCircle, Pencil, Plus, Star, UserRoundCog } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Can } from '@/components/can'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { HiloComentarios } from '@/features/comentarios/components/hilo-comentarios'
import { CotizacionesProspecto } from '@/features/documentos/components/cotizaciones-prospecto'
import { catalogosProspectoQuery, prospectoQuery } from '@/features/prospectos/api'
import { DialogoReasignarProspecto } from '@/features/prospectos/components/dialogo-reasignar'
import { InsigniaEtapa, InsigniaPrioridad, InsigniaTemperatura } from '@/features/prospectos/components/insignias'
import { MenuCambioEtapa, DialogoPerdido } from '@/features/seguimiento/components/cambio-etapa'
import { actividadesQuery } from '@/features/tareas/api'
import { DialogoProgramar } from '@/features/tareas/components/dialogo-programar'
import { TareaFila } from '@/features/tareas/components/tarea-fila'
import { ApiError } from '@/lib/api'
import { formatearFecha, formatearFechaHora, haceCuanto, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'

export const Route = createFileRoute('/_app/prospectos/$id/')({
  beforeLoad: () => exigirPermiso('prospectos.ver'),
  loader: async ({ context, params }) => {
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(prospectoQuery(params.id)),
        context.queryClient.ensureQueryData(catalogosProspectoQuery),
      ])
    } catch (error) {
      // 404 o fuera de su alcance: no se revela si existe.
      if (error instanceof ApiError && (error.status === 404 || error.status === 400)) throw notFound()
      throw error
    }
  },
  component: DetalleProspecto,
})

function DetalleProspecto() {
  const { id } = Route.useParams()
  const { data: p } = useSuspenseQuery(prospectoQuery(id))
  const { data: catalogos } = useSuspenseQuery(catalogosProspectoQuery)
  const principal = p.contactos.find((c) => c.esPrincipal) ?? p.contactos[0]
  const [sugerirPerdido, setSugerirPerdido] = useState<number | null>(null)
  const [reasignando, setReasignando] = useState(false)
  const perdida = catalogos.etapas.find((e) => e.clase === 'perdida')

  const alCompletar = (r: ResultadoCompletar) => {
    if (r.sugerirPerdido) setSugerirPerdido(r.intentosSinRespuesta)
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col gap-4">
        <Link to="/prospectos" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Prospectos
        </Link>
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{p.codigo}</span>
              <InsigniaEtapa nombre={p.etapa.nombre} color={p.etapa.color} />
              <InsigniaTemperatura temperatura={p.temperatura} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {nombreCompleto(principal) ?? formatearCelular(principal.celular)}
              {p.contactos.length > 1 && <span className="text-muted-foreground"> y {p.contactos.length - 1} más</span>}
            </h1>
            <p className="text-sm text-muted-foreground">
              {p.tipoTrabajo.nombre}
              {p.nivelAcademico && ` · ${p.nivelAcademico.nombre}`}
              {p.titulo && ` · ${p.titulo}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.trabajo ? (
              <Button asChild>
                <Link to="/trabajos/$id" params={{ id: p.trabajo.id }}>
                  <BriefcaseBusiness />
                  Ver trabajo {p.trabajo.codigo}
                </Link>
              </Button>
            ) : (
              p.etapa.clase === 'abierta' && (
                <Can permiso="prospectos.convertir">
                  <Button asChild>
                    <Link to="/prospectos/$id/convertir" params={{ id }}>
                      <BadgeCheck />
                      Convertir en cliente
                    </Link>
                  </Button>
                </Can>
              )
            )}
            <MenuCambioEtapa prospectoId={p.id} codigo={p.codigo} etapaActual={p.etapa} catalogos={catalogos} />
            <Button variant="outline" asChild>
              <a href={enlaceWhatsapp(principal.celular)} target="_blank" rel="noreferrer">
                <MessageCircle />
                WhatsApp
              </a>
            </Button>
            <Can permiso="prospectos.editar">
              <Button variant="outline" asChild>
                <Link to="/prospectos/$id/editar" params={{ id }}>
                  <Pencil />
                  Editar
                </Link>
              </Button>
            </Can>
            {p.etapa.clase === 'abierta' && !p.trabajo && (
              <Can permiso="prospectos.reasignar">
                <Button variant="outline" onClick={() => setReasignando(true)}>
                  <UserRoundCog />
                  Reasignar
                </Button>
              </Can>
            )}
          </div>
        </div>
      </div>

      {reasignando && <DialogoReasignarProspecto prospecto={p} abierto onAbiertoChange={setReasignando} />}

      {sugerirPerdido !== null && perdida && (
        <DialogoPerdido
          prospectoId={p.id}
          codigo={p.codigo}
          aviso={`Lleva ${sugerirPerdido} intentos seguidos sin respuesta. ¿Lo marcas como perdido?`}
          etapaPerdida={perdida}
          motivos={catalogos.motivosPerdida}
          abierto
          onAbiertoChange={(abierto) => !abierto && setSugerirPerdido(null)}
        />
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <Actividades prospectoId={p.id} tareas={p.tareas} cerrado={p.etapa.clase !== 'abierta'} catalogos={catalogos} onCompletada={alCompletar} />
          <CotizacionesProspecto
            prospectoId={p.id}
            abierto={p.etapa.clase === 'abierta' && !p.trabajo}
            descripcionSugerida={[p.tipoTrabajo.nombre, p.titulo].filter(Boolean).join(': ')}
          />
          <Card>
            <CardHeader>
              <CardTitle>Comentarios</CardTitle>
            </CardHeader>
            <CardContent>
              <HiloComentarios entidad="prospecto" entidadId={p.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contactos</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {p.contactos.map((c) => (
                <div key={c.id} className="flex flex-col gap-2 rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{nombreCompleto(c) ?? <span className="text-muted-foreground italic">Sin nombre</span>}</span>
                    {c.esPrincipal && (
                      <Badge variant="secondary" className="gap-1">
                        <Star className="fill-current" />
                        Principal
                      </Badge>
                    )}
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Celular</dt>
                    <dd className="flex items-center gap-1 font-mono whitespace-nowrap">
                      {formatearCelular(c.celular)}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon-xs" asChild>
                            <a href={enlaceWhatsapp(c.celular)} target="_blank" rel="noreferrer" aria-label={`Abrir WhatsApp de ${nombreCompleto(c) ?? c.celular}`}>
                              <MessageCircle />
                            </a>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Abrir WhatsApp</TooltipContent>
                      </Tooltip>
                    </dd>
                    <dt className="text-muted-foreground">Documento</dt>
                    <dd>{c.tipoDocumento ? `${NOMBRE_TIPO_DOCUMENTO[c.tipoDocumento]} ${c.numeroDocumento}` : '—'}</dd>
                    <dt className="text-muted-foreground">Correo</dt>
                    <dd className="truncate">{c.email ?? '—'}</dd>
                  </dl>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Datos del trabajo</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <Dato etiqueta="Tipo de trabajo">{p.tipoTrabajo.nombre}</Dato>
                <Dato etiqueta="Nivel académico">{p.nivelAcademico?.nombre}</Dato>
                <Dato etiqueta="Prioridad">
                  <InsigniaPrioridad nombre={p.prioridad.nombre} color={p.prioridad.color} />
                </Dato>
                <Dato etiqueta="Universidad" ancho>
                  {p.universidad?.nombre}
                </Dato>
                <Dato etiqueta="Carrera">{p.carrera?.nombre}</Dato>
                <Dato etiqueta="Título" ancho>
                  {p.titulo}
                </Dato>
                <Dato etiqueta="Entrega tentativa">{p.fechaEntregaTentativa && formatearFecha(p.fechaEntregaTentativa)}</Dato>
                <Dato etiqueta="Origen">
                  {p.origen.nombre}
                  {p.referidoPor && (
                    <span className="text-muted-foreground"> · por {nombreCompleto(p.referidoPor) ?? formatearCelular(p.referidoPor.celular)}</span>
                  )}
                </Dato>
                <Dato etiqueta="Drive">
                  {p.linkDrive && (
                    <a href={p.linkDrive} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                      Abrir carpeta
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </Dato>
                <Dato etiqueta="Observaciones" ancho completo>
                  {p.observaciones}
                </Dato>
                <Dato etiqueta="Detalles" ancho completo>
                  {p.detalles && <p className="whitespace-pre-line">{p.detalles}</p>}
                </Dato>
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Seguimiento</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 text-sm">
                <Dato etiqueta="Responsable">
                  {p.responsable.nombres} {p.responsable.apellidos}
                </Dato>
                <Dato etiqueta="Captado por">
                  {p.captadoPor.nombres} {p.captadoPor.apellidos}
                </Dato>
                <Dato etiqueta="Registrado">{formatearFechaHora(p.creadoEn)}</Dato>
                {p.montoCotizado !== null && (
                  <Dato etiqueta="Monto cotizado">
                    {formatearSoles(p.montoCotizado)}
                    {p.fechaCotizacion && <span className="text-muted-foreground"> · {formatearFecha(p.fechaCotizacion)}</span>}
                  </Dato>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-4" />
                Línea de tiempo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative flex flex-col gap-4 border-l pl-5">
                {p.eventos.map((e) => (
                  <Evento key={e.id} evento={e} />
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Dato({ etiqueta, children, ancho, completo }: { etiqueta: string; children: ReactNode; ancho?: boolean; completo?: boolean }) {
  const vacio = children === null || children === undefined || children === false || children === ''
  return (
    <div className={completo ? 'sm:col-span-2 lg:col-span-3' : ancho ? 'lg:col-span-2' : undefined}>
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5">{vacio ? '—' : children}</dd>
    </div>
  )
}

const ICONO_EVENTO: Record<ProspectoEventoItem['tipo'], typeof Plus> = {
  creado: Plus,
  editado: FilePenLine,
  cambio_etapa: History,
  nota: FilePenLine,
  contacto: MessageCircle,
  reasignado: History,
  tarea: ClipboardList,
  cotizacion: FileText,
}

function Evento({ evento }: { evento: ProspectoEventoItem }) {
  const Icono = ICONO_EVENTO[evento.tipo]
  return (
    <li className="relative">
      <span className="absolute top-0.5 -left-[29px] flex size-4 items-center justify-center rounded-full border bg-background">
        <Icono className="size-2.5 text-muted-foreground" />
      </span>
      <p className="text-sm">{evento.detalle}</p>
      <p className="text-xs text-muted-foreground">
        {evento.usuario ? `${evento.usuario.nombres} ${evento.usuario.apellidos} · ` : ''}
        <time dateTime={evento.fecha} title={formatearFechaHora(evento.fecha)}>
          {haceCuanto(evento.fecha)}
        </time>
      </p>
    </li>
  )
}

interface PropsActividades {
  prospectoId: string
  tareas: TareaItem[]
  cerrado: boolean
  catalogos: CatalogosProspecto
  onCompletada: (r: ResultadoCompletar) => void
}

function Actividades({ prospectoId, tareas, cerrado, catalogos, onCompletada }: PropsActividades) {
  const { data: actividades = [] } = useQuery(actividadesQuery('prospecto'))
  const [programando, setProgramando] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)
  const hoy = diaEnLima()
  const activas = tareas.filter((t) => ['por_asignar', 'pendiente', 'en_proceso'].includes(t.estado))
  const historial = tareas.filter((t) => !activas.includes(t))

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>Actividades</CardTitle>
        {!cerrado && (
          <Can permiso="tareas.crear">
            <Button size="sm" variant="outline" onClick={() => setProgramando(true)}>
              <CalendarPlus />
              Programar actividad
            </Button>
          </Can>
        )}
      </CardHeader>
      <CardContent>
        {activas.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {cerrado ? 'El prospecto está cerrado.' : 'Sin próximo paso. Todo prospecto activo debería tener una actividad programada.'}
          </p>
        ) : (
          <ul className="divide-y">
            {activas.map((t) => (
              <TareaFila
                key={t.id}
                tarea={t}
                hoy={hoy}
                actividades={actividades}
                catalogos={catalogos}
                hayOtrasPendientes={activas.length > 1}
                onCompletada={onCompletada}
              />
            ))}
          </ul>
        )}
        {historial.length > 0 && (
          <div className="mt-3">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setVerHistorial((v) => !v)}>
              {verHistorial ? 'Ocultar historial' : `Ver historial (${historial.length})`}
            </Button>
            {verHistorial && (
              <ul className="divide-y">
                {historial.map((t) => (
                  <TareaFila key={t.id} tarea={t} hoy={hoy} actividades={actividades} catalogos={catalogos} />
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
      {programando && <DialogoProgramar prospectoId={prospectoId} actividades={actividades} abierto onAbiertoChange={setProgramando} />}
    </Card>
  )
}
