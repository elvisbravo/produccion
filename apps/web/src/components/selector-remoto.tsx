import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Loader2, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useDebounce } from '@/hooks/use-debounce'
import { cn } from '@/lib/utils'

export interface OpcionSelector {
  id: string
  nombre: string
  detalle?: string
}

interface Props {
  id?: string
  /** Identifica la búsqueda en la caché (p. ej. 'universidades'). */
  clave: string
  valor: string | undefined
  /** Texto a mostrar del valor actual (se conoce al editar o tras elegir). */
  etiqueta: string | undefined
  onCambio: (opcion: OpcionSelector | null) => void
  buscar: (q: string, signal: AbortSignal) => Promise<OpcionSelector[]>
  /** Si se pasa, ofrece crear el texto escrito cuando no hay coincidencia exacta. */
  crear?: (nombre: string) => Promise<OpcionSelector>
  placeholder?: string
  /** Búsqueda mínima antes de consultar (0 = muestra opciones al abrir). */
  minimo?: number
  invalido?: boolean
  onBlur?: () => void
}

/** Cómo se llama lo que se agrega (para el botón «+» y su ventana). */
const NOMBRE_ELEMENTO: Record<string, string> = { universidades: 'universidad', carreras: 'carrera' }

const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/** Combobox con búsqueda en el servidor y opción de agregar un valor nuevo. */
export function SelectorRemoto({
  id,
  clave,
  valor,
  etiqueta,
  onCambio,
  buscar,
  crear,
  placeholder = 'Seleccionar…',
  minimo = 0,
  invalido,
  onBlur,
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [creando, setCreando] = useState(false)
  const [agregando, setAgregando] = useState(false)
  const [nuevo, setNuevo] = useState('')
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const elemento = NOMBRE_ELEMENTO[clave] ?? 'elemento'
  const q = useDebounce(texto.trim(), 250)

  const { data: resultados = [], isFetching: consultando } = useQuery({
    queryKey: ['selector', clave, q],
    queryFn: ({ signal }) => buscar(q, signal),
    enabled: abierto && q.length >= minimo,
    staleTime: 60_000,
  })
  // Mientras se escribe (antes de la pausa) no se muestran resultados de una búsqueda anterior.
  const isFetching = consultando || texto.trim() !== q
  const opciones = texto.trim() === q ? resultados : []

  const elegir = (opcion: OpcionSelector | null) => {
    onCambio(opcion)
    setAbierto(false)
    setTexto('')
  }

  // El servidor tampoco duplica: si el nombre ya existe (sin tildes ni mayúsculas) devuelve el existente.
  const hayExacta = opciones.some((o) => normalizar(o.nombre) === normalizar(q))
  const puedeCrear = crear && q.length >= 2 && !hayExacta && !isFetching

  const agregar = async () => {
    if (!crear) return
    setCreando(true)
    try {
      elegir(await crear(q))
    } finally {
      setCreando(false)
    }
  }

  // El botón «+»: agrega uno nuevo con su nombre y lo deja seleccionado.
  const guardarNuevo = async () => {
    if (!crear) return
    const nombre = nuevo.trim()
    if (nombre.length < 2) {
      setErrorNuevo('Escribe al menos 2 letras')
      return
    }
    setCreando(true)
    setErrorNuevo(null)
    try {
      const creado = await crear(nombre)
      void queryClient.invalidateQueries({ queryKey: ['selector', clave] })
      onCambio(creado)
      setAgregando(false)
      setNuevo('')
    } catch (err) {
      setErrorNuevo(err instanceof Error ? err.message : 'No se pudo agregar')
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
    <Popover
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v)
        if (!v) onBlur?.()
      }}
    >
      <div className="relative">
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={abierto}
            aria-invalid={invalido}
            className={cn('w-full justify-between font-normal', !valor && 'text-muted-foreground', valor && 'pr-8')}
          >
            <span className="truncate">{valor ? etiqueta : placeholder}</span>
            {!valor && <ChevronsUpDown className="opacity-50" />}
          </Button>
        </PopoverTrigger>
        {valor && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute top-1/2 right-1 -translate-y-1/2"
            aria-label="Quitar selección"
            onClick={() => elegir(null)}
          >
            <X />
          </Button>
        )}
      </div>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar…" value={texto} onValueChange={setTexto} />
          <CommandList>
            {isFetching && opciones.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Buscando…
              </div>
            ) : (
              <CommandEmpty>{q.length < minimo ? `Escribe al menos ${minimo} letras` : 'Sin resultados.'}</CommandEmpty>
            )}
            {opciones.length > 0 && (
              <CommandGroup>
                {opciones.map((o) => (
                  <CommandItem key={o.id} value={o.id} onSelect={() => elegir(o)}>
                    <Check className={cn(valor === o.id ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{o.nombre}</span>
                      {o.detalle && <span className="truncate text-xs text-muted-foreground">{o.detalle}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {puedeCrear && (
              <CommandGroup>
                <CommandItem value={`crear:${q}`} onSelect={() => void agregar()} disabled={creando}>
                  {creando ? <Loader2 className="animate-spin" /> : <Plus />}
                  Agregar «{q}»
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
      </div>
      {crear && (
        <>
          <Button type="button" variant="outline" size="icon" aria-label={`Agregar ${elemento}`} title={`Agregar ${elemento}`} onClick={() => setAgregando(true)}>
            <Plus />
          </Button>
          <Dialog open={agregando} onOpenChange={(v) => !creando && setAgregando(v)}>
            <DialogContent className="sm:max-w-sm">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  // El diálogo está dentro de otro formulario (React propaga el envío a través del portal): no debe guardarlo.
                  e.stopPropagation()
                  void guardarNuevo()
                }}
                className="flex flex-col gap-4"
              >
                <DialogHeader>
                  <DialogTitle>Agregar {elemento}</DialogTitle>
                  <DialogDescription>Escribe el nombre. Si ya existe, se usa el que está registrado. Al guardar queda seleccionada.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-1.5">
                  <Input autoFocus value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder={`Nombre de la ${elemento}`} maxLength={200} aria-label={`Nombre de la ${elemento}`} aria-invalid={Boolean(errorNuevo)} />
                  {errorNuevo && <p className="text-sm text-destructive">{errorNuevo}</p>}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAgregando(false)} disabled={creando}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={creando}>
                    {creando && <Loader2 className="animate-spin" />}
                    Agregar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
