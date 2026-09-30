import { enlaceWhatsapp, formatearCelular, NOMBRE_TIPO_DOCUMENTO, type ProspectoEventoItem } from '@grupoes/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ArrowLeft, ExternalLink, FilePenLine, History, MessageCircle, Pencil, Plus, Star } from 'lucide-react'
import type { ReactNode } from 'react'
import { Can } from '@/components/can'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { prospectoQuery } from '@/features/prospectos/api'
import { InsigniaEtapa, InsigniaPrioridad, InsigniaTemperatura } from '@/features/prospectos/components/insignias'
import { ApiError } from '@/lib/api'
import { formatearFecha, formatearFechaHora, haceCuanto, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'

export const Route = createFileRoute('/_app/prospectos/$id/')({
  beforeLoad: () => exigirPermiso('prospectos.ver'),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(prospectoQuery(params.id))
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
  const principal = p.contactos.find((c) => c.esPrincipal) ?? p.contactos[0]

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
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <a href={enlaceWhatsapp(principal.celular)} target="_blank" rel="noreferrer">
                <MessageCircle />
                WhatsApp
              </a>
            </Button>
            <Can permiso="prospectos.editar">
              <Button asChild>
                <Link to="/prospectos/$id/editar" params={{ id }}>
                  <Pencil />
                  Editar
                </Link>
              </Button>
            </Can>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
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
