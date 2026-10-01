import {
  desmarcarMenciones,
  marcarMenciones,
  MAX_COMENTARIO,
  partesComentario,
  type ComentarioItem,
  type EntidadComentario,
  type UsuarioResumen,
} from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { Loader2, MessageSquare, MoreHorizontal, Pencil, Send, Trash2 } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { formatearFechaHora, haceCuanto } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { useSesion } from '@/stores/sesion'
import { comentariosQuery, mencionablesQuery, useComentar, useEditarComentario, useEliminarComentario } from '../api'

const nombre = (u: UsuarioResumen) => `${u.nombres} ${u.apellidos}`
const iniciales = (u: UsuarioResumen) => `${u.nombres[0] ?? ''}${u.apellidos[0] ?? ''}`.toUpperCase()
const normalizar = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const mensaje = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo guardar')

/** "@ana to" justo antes del cursor: lo que se está escribiendo para mencionar. */
const PATRON_ESCRIBIENDO = /(?:^|\s)@([\p{L}]+(?: [\p{L}]*)?)?$/u

interface Props {
  entidad: EntidadComentario
  entidadId: string
}

/** Hilo de comentarios internos de un registro, con @menciones que avisan a la persona. */
export function HiloComentarios({ entidad, entidadId }: Props) {
  const { data } = useQuery(comentariosQuery(entidad, entidadId))
  const comentar = useComentar(entidad, entidadId)
  const usuarioId = useSesion((s) => s.usuario?.id)

  return (
    <div className="flex flex-col gap-4">
      {!data ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : data.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="size-4" />
          Sin comentarios. Escribe @ para mencionar a alguien del equipo.
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {data.map((c) => (
            <Comentario key={c.id} comentario={c} propio={c.autor.id === usuarioId} entidad={entidad} entidadId={entidadId} />
          ))}
        </ol>
      )}
      <Redactor
        entidad={entidad}
        entidadId={entidadId}
        pendiente={comentar.isPending}
        accion="Comentar"
        onEnviar={async (texto) => {
          await comentar.mutateAsync(texto)
        }}
      />
    </div>
  )
}

function Comentario({ comentario: c, propio, entidad, entidadId }: { comentario: ComentarioItem; propio: boolean } & Props) {
  const [editando, setEditando] = useState(false)
  const editar = useEditarComentario(entidad, entidadId)
  const eliminar = useEliminarComentario(entidad, entidadId)

  return (
    <li className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium" aria-hidden="true">
        {iniciales(c.autor)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{nombre(c.autor)}</span>
          <time dateTime={c.creadoEn} title={formatearFechaHora(c.creadoEn)} className="text-xs text-muted-foreground">
            {haceCuanto(c.creadoEn)}
          </time>
          {c.editadoEn && (
            <span className="text-xs text-muted-foreground" title={`Editado: ${formatearFechaHora(c.editadoEn)}`}>
              (editado)
            </span>
          )}
          {propio && !editando && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" className="ml-auto text-muted-foreground" aria-label="Opciones del comentario">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditando(true)}>
                  <Pencil />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => eliminar.mutate(c.id, { onSuccess: () => toast.success('Comentario eliminado'), onError: (err) => toast.error(mensaje(err)) })}
                >
                  <Trash2 />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {editando ? (
          <Redactor
            entidad={entidad}
            entidadId={entidadId}
            inicial={c.texto}
            pendiente={editar.isPending}
            accion="Guardar"
            onCancelar={() => setEditando(false)}
            onEnviar={async (texto) => {
              await editar.mutateAsync({ id: c.id, texto })
              setEditando(false)
            }}
          />
        ) : (
          <p className="text-sm break-words whitespace-pre-wrap">
            {partesComentario(c.texto).map((p, i) =>
              p.tipo === 'texto' ? (
                <span key={i}>{p.texto}</span>
              ) : (
                <span key={i} className="rounded bg-primary/10 px-1 font-medium text-primary">
                  @{p.nombre}
                </span>
              ),
            )}
          </p>
        )}
      </div>
    </li>
  )
}

function Redactor({
  entidad,
  entidadId,
  inicial,
  accion,
  pendiente,
  onEnviar,
  onCancelar,
}: Props & { inicial?: string; accion: string; pendiente: boolean; onEnviar: (texto: string) => Promise<void>; onCancelar?: () => void }) {
  const [{ texto, elegidas }, setEstado] = useState(() => (inicial ? desmarcarMenciones(inicial) : { texto: '', elegidas: [] as { id: string; nombre: string }[] }))
  const [cursor, setCursor] = useState(0)
  const [activo, setActivo] = useState(0)
  const [cerrado, setCerrado] = useState(false)
  const [interesado, setInteresado] = useState(Boolean(inicial))
  const area = useRef<HTMLTextAreaElement>(null)
  // La lista de personas se pide recién cuando se empieza a escribir.
  const { data: personas = [] } = useQuery({ ...mencionablesQuery(entidad, entidadId), enabled: interesado })

  const escribiendo = cerrado ? null : PATRON_ESCRIBIENDO.exec(texto.slice(0, cursor))
  const buscado = escribiendo ? normalizar(escribiendo[1] ?? '') : null
  // Coincide desde el inicio de cualquier palabra: "tor" encuentra a Ana Torres.
  const coincide = (p: UsuarioResumen) => buscado !== null && normalizar(nombre(p)).split(' ').some((_, i, partes) => partes.slice(i).join(' ').startsWith(buscado))
  const sugerencias = personas.filter(coincide).slice(0, 6)
  const indice = Math.min(activo, Math.max(0, sugerencias.length - 1))

  const cambiar = (nuevo: string, posicion: number) => {
    setEstado((e) => ({ ...e, texto: nuevo }))
    setCursor(posicion)
    setCerrado(false)
    setActivo(0)
  }

  const elegir = (p: UsuarioResumen) => {
    if (!escribiendo) return
    const inicio = cursor - escribiendo[0].length + (escribiendo[0].startsWith('@') ? 0 : 1)
    const insertado = `@${nombre(p)} `
    const nuevo = texto.slice(0, inicio) + insertado + texto.slice(cursor)
    const posicion = inicio + insertado.length
    setEstado((e) => ({ texto: nuevo, elegidas: e.elegidas.some((x) => x.id === p.id) ? e.elegidas : [...e.elegidas, { id: p.id, nombre: nombre(p) }] }))
    setCursor(posicion)
    requestAnimationFrame(() => {
      area.current?.focus()
      area.current?.setSelectionRange(posicion, posicion)
    })
  }

  const enviar = async () => {
    const final = marcarMenciones(texto.trim(), elegidas)
    if (!final) return
    try {
      await onEnviar(final)
      if (!inicial) {
        setEstado({ texto: '', elegidas: [] })
        setCursor(0)
      }
    } catch (err) {
      toast.error(mensaje(err))
    }
  }

  const teclas = (ev: KeyboardEvent<HTMLTextAreaElement>) => {
    if (sugerencias.length > 0) {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault()
        setActivo((indice + (ev.key === 'ArrowDown' ? 1 : sugerencias.length - 1)) % sugerencias.length)
        return
      }
      if (ev.key === 'Enter' || ev.key === 'Tab') {
        ev.preventDefault()
        elegir(sugerencias[indice])
        return
      }
      if (ev.key === 'Escape') {
        ev.preventDefault()
        setCerrado(true)
        return
      }
    }
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault()
      void enviar()
    } else if (ev.key === 'Escape' && onCancelar) onCancelar()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Textarea
          ref={area}
          aria-label={inicial ? 'Editar comentario' : 'Escribe un comentario'}
          placeholder="Escribe un comentario… usa @ para mencionar"
          rows={inicial ? 3 : 2}
          maxLength={MAX_COMENTARIO}
          value={texto}
          autoFocus={Boolean(inicial)}
          onFocus={() => setInteresado(true)}
          onChange={(ev) => cambiar(ev.target.value, ev.target.selectionStart)}
          onSelect={(ev) => setCursor(ev.currentTarget.selectionStart)}
          onKeyDown={teclas}
          onBlur={() => setTimeout(() => setCerrado(true), 150)}
          aria-autocomplete="list"
          aria-expanded={sugerencias.length > 0}
          aria-controls={sugerencias.length > 0 ? `menciones-${entidadId}` : undefined}
        />
        {sugerencias.length > 0 && (
          <ul id={`menciones-${entidadId}`} role="listbox" aria-label="Personas para mencionar" className="absolute top-full left-0 z-20 mt-1 w-64 overflow-hidden rounded-md border bg-popover p-1 text-sm shadow-md">
            {sugerencias.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={i === indice}
                className={cn('cursor-pointer rounded-sm px-2 py-1.5', i === indice && 'bg-accent text-accent-foreground')}
                onMouseDown={(ev) => {
                  ev.preventDefault()
                  elegir(p)
                }}
                onMouseEnter={() => setActivo(i)}
              >
                {nombre(p)}
              </li>
            ))}
          </ul>
        )}
        {buscado !== null && buscado.length > 0 && sugerencias.length === 0 && personas.length > 0 && (
          <p className="absolute top-full left-0 z-20 mt-1 rounded-md border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">Nadie con acceso a este registro coincide.</p>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">Ctrl + Enter para enviar</span>
        {onCancelar && (
          <Button variant="ghost" size="sm" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        <Button size="sm" onClick={() => void enviar()} disabled={pendiente || !texto.trim()}>
          {pendiente ? <Loader2 className="animate-spin" /> : <Send />}
          {accion}
        </Button>
      </div>
    </div>
  )
}
