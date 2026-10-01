import { excepcionPermisoSchema, type Alcance, type UsuarioDetalle } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Ban, Loader2, Plus, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { formatearFecha, nombreCompleto } from '@/lib/formato'
import { usePermiso } from '@/lib/permisos'
import { rolesQuery, useGuardarExcepcion, useQuitarExcepcion, useRolesUsuario } from '../api'
import { describirPermiso, GRUPOS_PERMISOS, NOMBRE_ALCANCE, OPCIONES_PERMISO } from '../catalogo'

const mensaje = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo guardar')

export function RolesDelUsuario({ u }: { u: UsuarioDetalle }) {
  const puede = usePermiso('usuarios.asignar_roles')
  const { data: roles } = useQuery({ ...rolesQuery, enabled: puede })
  const guardar = useRolesUsuario(u.id)
  const [elegidos, setElegidos] = useState<string[] | null>(null)
  const actuales = u.roles.map((r) => r.id)
  const seleccion = elegidos ?? actuales
  const cambio = elegidos !== null && (elegidos.length !== actuales.length || elegidos.some((x) => !actuales.includes(x)))

  const aplicar = async () => {
    try {
      await guardar.mutateAsync(seleccion)
      toast.success('Roles actualizados: si está conectado, su menú cambia al instante')
      setElegidos(null)
    } catch (err) {
      toast.error(mensaje(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Roles</CardTitle>
        <CardDescription>Los permisos vienen de sus roles, más las excepciones de abajo.</CardDescription>
        {puede && cambio && (
          <CardAction>
            <Button size="sm" onClick={() => void aplicar()} disabled={guardar.isPending || seleccion.length === 0}>
              {guardar.isPending && <Loader2 className="animate-spin" />}
              Guardar roles
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {puede ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {roles
              ?.filter((r) => r.activo || actuales.includes(r.id))
              .map((r) => (
                <Label key={r.id} className="flex items-start gap-2 rounded-lg border p-2.5 font-normal">
                  <Checkbox
                    className="mt-0.5"
                    checked={seleccion.includes(r.id)}
                    onCheckedChange={(v) => setElegidos(v === true ? [...seleccion, r.id] : seleccion.filter((x) => x !== r.id))}
                  />
                  <span className="flex flex-col">
                    <span className="font-medium">{r.nombre}</span>
                    {r.descripcion && <span className="text-xs text-muted-foreground">{r.descripcion}</span>}
                  </span>
                </Label>
              ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {u.roles.map((r) => (
              <Badge key={r.id} variant="secondary">
                {r.nombre}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const ORIGEN = { admin: 'Administrador', rol: 'Rol', concedido: 'Concedido' } as const

export function PermisosEfectivos({ u }: { u: UsuarioDetalle }) {
  const porPermiso = new Map(u.efectivos.map((e) => [e.permiso, e]))
  const denegados = new Set(u.excepciones.filter((e) => e.tipo === 'denegar').map((e) => e.permiso))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          Permisos efectivos
        </CardTitle>
        <CardDescription>Lo que puede hacer hoy y de dónde viene cada permiso.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {GRUPOS_PERMISOS.map(({ grupo, modulos }) => {
          const visibles = modulos.filter((m) => m.acciones.some((a) => porPermiso.has(`${m.codigo}.${a.codigo}`) || denegados.has(`${m.codigo}.${a.codigo}`)))
          if (visibles.length === 0) return null
          return (
            <section key={grupo.codigo} className="flex flex-col gap-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{grupo.nombre}</h3>
              <ul className="divide-y rounded-lg border">
                {visibles.map((m) => (
                  <li key={m.codigo} className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-start">
                    <span className="w-44 shrink-0 text-sm font-medium">{m.nombre}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {m.acciones.map((a) => {
                        const codigo = `${m.codigo}.${a.codigo}`
                        const e = porPermiso.get(codigo)
                        if (denegados.has(codigo)) {
                          return (
                            <Badge key={codigo} variant="outline" className="text-muted-foreground line-through" title="Denegado para esta persona">
                              <Ban />
                              {a.nombre}
                            </Badge>
                          )
                        }
                        if (!e) return null
                        return (
                          <Badge
                            key={codigo}
                            variant={e.origen === 'concedido' ? 'default' : 'secondary'}
                            title={`${ORIGEN[e.origen]}${e.roles.length ? `: ${e.roles.join(', ')}` : ''}`}
                          >
                            {a.nombre}
                            {e.alcance && <span className="opacity-70">· {NOMBRE_ALCANCE[e.alcance]}</span>}
                          </Badge>
                        )
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        <p className="text-xs text-muted-foreground">Gris: por su rol. Oscuro: concedido solo a esta persona. Tachado: denegado.</p>
      </CardContent>
    </Card>
  )
}

export function ExcepcionesDelUsuario({ u }: { u: UsuarioDetalle }) {
  const puede = usePermiso('usuarios.asignar_permisos')
  const quitar = useQuitarExcepcion(u.id)
  const [agregando, setAgregando] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Excepciones</CardTitle>
        <CardDescription>Permisos que se le conceden o se le quitan solo a esta persona. Denegar gana sobre sus roles.</CardDescription>
        {puede && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setAgregando(true)}>
              <Plus />
              Excepción
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {u.excepciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin excepciones: tiene exactamente los permisos de sus roles.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {u.excepciones.map((e) => {
              const d = describirPermiso(e.permiso)
              return (
                <li key={e.id} className="flex items-start gap-3 px-3 py-2">
                  <Badge variant={e.tipo === 'conceder' ? 'default' : 'destructive'}>{e.tipo === 'conceder' ? 'Concede' : 'Deniega'}</Badge>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium">
                      {d.modulo} · {d.accion}
                      {e.alcance && <span className="font-normal text-muted-foreground"> ({NOMBRE_ALCANCE[e.alcance].toLowerCase()})</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {e.motivo} · {nombreCompleto(e.otorgadoPor) ?? '—'}, {formatearFecha(e.fecha)}
                    </span>
                  </div>
                  {puede && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Quitar excepción"
                      onClick={() => quitar.mutate(e.id, { onSuccess: () => toast.success('Excepción quitada'), onError: (err) => toast.error(mensaje(err)) })}
                    >
                      <X />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
      {agregando && <DialogoExcepcion u={u} onCerrar={() => setAgregando(false)} />}
    </Card>
  )
}

function DialogoExcepcion({ u, onCerrar }: { u: UsuarioDetalle; onCerrar: () => void }) {
  const guardar = useGuardarExcepcion(u.id)
  const [permiso, setPermiso] = useState('')
  const [tipo, setTipo] = useState<'conceder' | 'denegar'>('conceder')
  const [alcance, setAlcance] = useState<Alcance>('propios')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const opcion = OPCIONES_PERMISO.find((o) => o.codigo === permiso)

  const enviar = async () => {
    setError(null)
    const datos = excepcionPermisoSchema.safeParse({ permiso, tipo, alcance: opcion?.usaAlcance && tipo === 'conceder' ? alcance : null, motivo })
    if (!datos.success) return setError(datos.error.issues[0]?.message ?? 'Revisa los datos')
    try {
      await guardar.mutateAsync(datos.data)
      toast.success('Excepción guardada')
      onCerrar()
    } catch (err) {
      setError(mensaje(err))
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva excepción para {u.nombres}</DialogTitle>
          <DialogDescription>Queda registrada con tu nombre y el motivo.</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as 'conceder' | 'denegar')} className="grid grid-cols-2 gap-2">
          {(['conceder', 'denegar'] as const).map((t) => (
            <Label key={t} htmlFor={`exc-${t}`} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 font-normal has-[[data-state=checked]]:border-primary">
              <RadioGroupItem value={t} id={`exc-${t}`} />
              {t === 'conceder' ? 'Conceder' : 'Denegar'}
            </Label>
          ))}
        </RadioGroup>
        <Field>
          <FieldLabel htmlFor="exc-permiso">Permiso</FieldLabel>
          <Select value={permiso} onValueChange={setPermiso}>
            <SelectTrigger id="exc-permiso" className="w-full">
              <SelectValue placeholder="Elegir…" />
            </SelectTrigger>
            <SelectContent>
              {GRUPOS_PERMISOS.flatMap(({ modulos }) =>
                modulos.map((m) => (
                  <SelectGroup key={m.codigo}>
                    <SelectLabel>{m.nombre}</SelectLabel>
                    {m.acciones.map((a) => (
                      <SelectItem key={a.codigo} value={`${m.codigo}.${a.codigo}`}>
                        {m.nombre} · {a.nombre}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )),
              )}
            </SelectContent>
          </Select>
        </Field>
        {opcion?.usaAlcance && tipo === 'conceder' && (
          <Field>
            <FieldLabel htmlFor="exc-alcance">Alcance</FieldLabel>
            <Select value={alcance} onValueChange={(v) => setAlcance(v as Alcance)}>
              <SelectTrigger id="exc-alcance" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(NOMBRE_ALCANCE) as Alcance[]).map((a) => (
                  <SelectItem key={a} value={a}>
                    {NOMBRE_ALCANCE[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>Propios: lo suyo. Equipo: lo de los trabajos donde participa. Todos: sin límite.</FieldDescription>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="exc-motivo">Motivo</FieldLabel>
          <Textarea id="exc-motivo" rows={2} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={!permiso || guardar.isPending}>
            {guardar.isPending && <Loader2 className="animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
