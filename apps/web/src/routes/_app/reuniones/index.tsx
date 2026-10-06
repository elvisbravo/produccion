import { diaEnLima, enlaceWhatsapp, formatearCelular, NOMBRE_MODALIDAD, type TareaItem } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CalendarCheck2, CalendarClock, CircleCheck, MessageCircle, Video } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { porAsignarQuery } from '@/features/tareas/api'
import { DialogoAsignar } from '@/features/tareas/components/dialogo-asignar'
import { DialogoReprogramar } from '@/features/tareas/components/dialogos-simples'
import { duracion, formatearFecha, formatearFechaHora, haceCuanto, nombreCompleto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/guardas'

export const Route = createFileRoute('/_app/reuniones/')({
  beforeLoad: () => exigirPermiso('reuniones.ver'),
  component: ReunionesPorProgramar,
})

/** Las reuniones que esperan responsable: confirmar la hora pedida o proponer otra. */
function ReunionesPorProgramar() {
  const { data, isPending } = useQuery(porAsignarQuery)
  const reuniones = (data ?? []).filter((t) => t.actividad.comportamiento === 'reunion' || t.actividad.requiereHoraFija)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reuniones por programar</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Las reuniones que pidió el equipo comercial. Confirma la hora solicitada (eliges quién la atiende) o propón otra: se avisa a quien la pidió para que la confirme con el cliente.
        </p>
      </div>

      {isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : reuniones.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleCheck />
            </EmptyMedia>
            <EmptyTitle>No hay reuniones por programar</EmptyTitle>
            <EmptyDescription>Cuando registren un prospecto o pidan una reunión de enfoque, llegará aquí y te avisamos con una notificación.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {reuniones.map((t) => (
            <Reunion key={t.id} tarea={t} />
          ))}
        </ul>
      )}
    </div>
  )
}

function Reunion({ tarea: t }: { tarea: TareaItem }) {
  const [asignando, setAsignando] = useState(false)
  const [proponiendo, setProponiendo] = useState(false)
  const contacto = t.prospecto?.contacto
  const cuando = t.inicio ? formatearFechaHora(t.inicio) : `${formatearFecha(t.fecha)} (sin hora)`

  return (
    <li>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.actividad.color }} aria-hidden="true" />
                <span className="text-base font-medium">{t.actividad.nombre}</span>
                {t.prospecto && (
                  <Link to="/prospectos/$id" params={{ id: t.prospecto.id }} className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline">
                    {t.prospecto.codigo}
                  </Link>
                )}
                {t.vecesReprogramada > 0 && <Badge variant="outline">Ya se movió {t.vecesReprogramada} {t.vecesReprogramada === 1 ? 'vez' : 'veces'}</Badge>}
              </div>
              {contacto && (
                <p className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="font-medium">{nombreCompleto(contacto) ?? 'Cliente sin nombre'}</span>
                  <span className="font-mono text-xs text-muted-foreground">{formatearCelular(contacto.celular)}</span>
                  <Button variant="ghost" size="icon-xs" asChild>
                    <a href={enlaceWhatsapp(contacto.celular)} target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp del cliente">
                      <MessageCircle />
                    </a>
                  </Button>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Pedida por {nombreCompleto(t.creadaPor)} · {t.completadaEn ? '' : 'registrada'} {haceCuanto(t.inicio ?? t.fecha)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <CalendarClock className="size-4" />
                {cuando}
              </span>
              <span className="text-xs text-muted-foreground">
                {duracion(t.minutosEstimados)}
                {t.modalidad && (
                  <>
                    {' · '}
                    <Video className="mr-0.5 inline size-3" />
                    {NOMBRE_MODALIDAD[t.modalidad]}
                  </>
                )}
              </span>
              {t.vencida && <Badge variant="destructive">La hora pedida ya pasó</Badge>}
            </div>
          </div>
          {t.notas && <p className="rounded-md bg-muted/40 px-3 py-2 text-sm whitespace-pre-line">{t.notas}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setProponiendo(true)}>
              <CalendarClock />
              Proponer otra hora
            </Button>
            <Button onClick={() => setAsignando(true)} disabled={t.vencida}>
              <CalendarCheck2 />
              Confirmar esa hora y asignar
            </Button>
          </div>
        </CardContent>
      </Card>
      {asignando && <DialogoAsignar tareaId={t.id} hoy={diaEnLima()} abierto onAbiertoChange={setAsignando} />}
      {proponiendo && <DialogoReprogramar tarea={t} abierto proponer onAbiertoChange={setProponiendo} />}
    </li>
  )
}
