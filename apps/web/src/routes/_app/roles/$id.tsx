import type { Alcance, RolDetalle } from '@grupoes/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Loader2, Lock, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { rolQuery, useEditarRol, useEliminarRol, useMatrizRol } from '@/features/administracion/api'
import { GRUPOS_PERMISOS, NOMBRE_ALCANCE } from '@/features/administracion/catalogo'
import { NoEncontrado } from '@/components/estado-vacio'
import { ApiError } from '@/lib/api'
import { exigirPermiso } from '@/lib/guardas'
import { usePermiso } from '@/lib/permisos'

export const Route = createFileRoute('/_app/roles/$id')({
  beforeLoad: () => exigirPermiso('roles.ver'),
  component: DetalleRol,
})

const mensaje = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo guardar')

function DetalleRol() {
  const { id } = Route.useParams()
  const { data: rol, error } = useQuery(rolQuery(id))
  if (error instanceof ApiError && error.status === 404) return <NoEncontrado />
  if (!rol) {
    return (
      <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
        <Skeleton className="h-96" />
      </div>
    )
  }
  return <Contenido key={rol.id} rol={rol} />
}

function Contenido({ rol }: { rol: RolDetalle }) {
  const puedeEditar = usePermiso('roles.editar')
  const puedeEliminar = usePermiso('roles.eliminar')
  const editar = useEditarRol(rol.id)
  const guardarMatriz = useMatrizRol(rol.id)
  const eliminar = useEliminarRol(rol.id)
  const navigate = useNavigate()
  const [nombre, setNombre] = useState(rol.nombre)
  const [descripcion, setDescripcion] = useState(rol.descripcion ?? '')
  const [activo, setActivo] = useState(rol.activo)
  const [matriz, setMatriz] = useState<Map<string, Alcance | null>>(() => new Map(rol.matriz.map((p) => [p.permiso, p.alcance])))
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const editable = puedeEditar && !rol.esAdministrador

  const original = new Map(rol.matriz.map((p) => [p.permiso, p.alcance]))
  const matrizCambio = matriz.size !== original.size || [...matriz].some(([k, v]) => !original.has(k) || original.get(k) !== v)
  const datosCambio = nombre !== rol.nombre || descripcion !== (rol.descripcion ?? '') || activo !== rol.activo

  const alternar = (codigo: string, usaAlcance: boolean, marcado: boolean) =>
    setMatriz((m) => {
      const n = new Map(m)
      if (marcado) n.set(codigo, usaAlcance ? 'propios' : null)
      else n.delete(codigo)
      return n
    })

  const guardar = async () => {
    try {
      if (datosCambio) await editar.mutateAsync({ nombre, descripcion, activo })
      if (matrizCambio) await guardarMatriz.mutateAsync({ permisos: [...matriz].map(([permiso, alcance]) => ({ permiso, alcance })) })
      toast.success('Rol guardado: quienes lo tienen ven los cambios al instante')
    } catch (err) {
      toast.error(mensaje(err))
    }
  }

  const borrar = async () => {
    try {
      await eliminar.mutateAsync()
      toast.success('Rol eliminado')
      void navigate({ to: '/roles' })
    } catch (err) {
      toast.error(mensaje(err))
      setConfirmarBorrado(false)
    }
  }

  const guardando = editar.isPending || guardarMatriz.isPending

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 pb-24 md:p-8 md:pb-24">
      <div className="flex flex-col gap-3">
        <Link to="/roles" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Roles
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{rol.nombre}</h1>
          <span className="font-mono text-xs text-muted-foreground">{rol.codigo}</span>
          {rol.esSistema && (
            <Badge variant="outline">
              <Lock />
              Rol base
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">
            · {rol.usuarios} {rol.usuarios === 1 ? 'usuario' : 'usuarios'}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="r-nombre">Nombre</FieldLabel>
              <Input id="r-nombre" value={nombre} disabled={!puedeEditar} onChange={(ev) => setNombre(ev.target.value)} />
            </Field>
            <Label className="flex items-center gap-2 self-end pb-2 font-normal">
              <Switch checked={activo} onCheckedChange={setActivo} disabled={!puedeEditar || rol.esAdministrador} />
              Rol activo (si se desactiva, quienes lo tienen pierden sus permisos)
            </Label>
          </div>
          <Field>
            <FieldLabel htmlFor="r-desc">Descripción</FieldLabel>
            <Textarea id="r-desc" rows={2} value={descripcion} disabled={!puedeEditar} onChange={(ev) => setDescripcion(ev.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {rol.esAdministrador ? (
        <Alert>
          <Lock />
          <AlertDescription>El administrador tiene siempre todos los permisos, para que nadie se quede sin acceso. Su matriz no se edita.</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Permisos</CardTitle>
            <CardDescription>
              Marca lo que puede hacer. En las acciones con alcance: <strong>Propios</strong> = lo suyo, <strong>Equipo</strong> = lo de los trabajos donde participa,{' '}
              <strong>Todos</strong> = sin límite. Para ver un módulo en el menú hace falta su acción "Ver".
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {GRUPOS_PERMISOS.map(({ grupo, modulos }) => (
              <section key={grupo.codigo} className="flex flex-col gap-2">
                <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{grupo.nombre}</h3>
                <ul className="divide-y rounded-lg border">
                  {modulos.map((m) => (
                    <li key={m.codigo} className="flex flex-col gap-2 px-3 py-3 md:flex-row">
                      <span className="w-44 shrink-0 text-sm font-medium">{m.nombre}</span>
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {m.acciones.map((a) => {
                          const codigo = `${m.codigo}.${a.codigo}`
                          const marcado = matriz.has(codigo)
                          return (
                            <div key={codigo} className="flex items-center gap-2">
                              <Label className="flex items-center gap-1.5 font-normal">
                                <Checkbox checked={marcado} disabled={!editable} onCheckedChange={(v) => alternar(codigo, Boolean(a.usaAlcance), v === true)} />
                                {a.nombre}
                              </Label>
                              {a.usaAlcance && marcado && (
                                <Select
                                  value={matriz.get(codigo) ?? 'propios'}
                                  disabled={!editable}
                                  onValueChange={(v) => setMatriz((mm) => new Map(mm).set(codigo, v as Alcance))}
                                >
                                  <SelectTrigger size="sm" className="h-7 w-28" aria-label={`Alcance de ${m.nombre} · ${a.nombre}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(Object.keys(NOMBRE_ALCANCE) as Alcance[]).map((x) => (
                                      <SelectItem key={x} value={x}>
                                        {NOMBRE_ALCANCE[x]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </CardContent>
        </Card>
      )}

      {puedeEliminar && !rol.esSistema && (
        <Card>
          <CardHeader>
            <CardTitle>Eliminar rol</CardTitle>
            <CardDescription>Solo si ningún usuario lo tiene. Queda en la auditoría.</CardDescription>
          </CardHeader>
          <CardContent>
            {confirmarBorrado ? (
              <div className="flex gap-2">
                <Button variant="destructive" onClick={() => void borrar()} disabled={eliminar.isPending}>
                  Confirmar: eliminar
                </Button>
                <Button variant="outline" onClick={() => setConfirmarBorrado(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="text-destructive" onClick={() => setConfirmarBorrado(true)}>
                <Trash2 />
                Eliminar
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {puedeEditar && (datosCambio || matrizCambio) && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur md:left-(--sidebar-width)">
          <div className="mx-auto flex max-w-5xl items-center justify-end gap-2">
            <span className="mr-auto text-sm text-muted-foreground">Tienes cambios sin guardar</span>
            <Button
              variant="outline"
              onClick={() => {
                setNombre(rol.nombre)
                setDescripcion(rol.descripcion ?? '')
                setActivo(rol.activo)
                setMatriz(new Map(original))
              }}
            >
              Descartar
            </Button>
            <Button onClick={() => void guardar()} disabled={guardando || nombre.trim().length < 2}>
              {guardando && <Loader2 className="animate-spin" />}
              Guardar cambios
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
