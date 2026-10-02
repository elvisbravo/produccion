import {
  actividadSchema,
  APLICA_A,
  DESCRIPCION_MODO_ASIGNACION,
  MODOS_ASIGNACION,
  NOMBRE_APLICA_A,
  NOMBRE_MODO_ASIGNACION,
  type ActividadAdmin,
  type CatalogoActividades,
} from '@grupoes/shared'
import { AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ApiError } from '@/lib/api'
import { useGuardarActividad } from '../api'

interface RolEditable {
  rolId: string
  prioridadRolId: string
}
interface ParticipacionEditable {
  id: string | null
  nombre: string
  cantidad: string
  obligatoria: boolean
  roles: RolEditable[]
}

const participacionVacia = (catalogo: CatalogoActividades): ParticipacionEditable => ({
  id: null,
  nombre: '',
  cantidad: '1',
  obligatoria: true,
  roles: [{ rolId: '', prioridadRolId: catalogo.prioridades[0]?.id ?? '' }],
})

/** Crear o editar una actividad: tiempo estimado, cómo se asigna y qué roles pueden hacerla con qué prioridad. */
export function DialogoActividad({ catalogo, actividad, abierto, onAbiertoChange }: { catalogo: CatalogoActividades; actividad: ActividadAdmin | null; abierto: boolean; onAbiertoChange: (abierto: boolean) => void }) {
  const guardar = useGuardarActividad(actividad?.id ?? null)
  const [nombre, setNombre] = useState(actividad?.nombre ?? '')
  const [tipoId, setTipoId] = useState(actividad?.tipo.id ?? '')
  const [minutos, setMinutos] = useState(String(actividad?.minutosEstimados ?? ''))
  const [aplicaA, setAplicaA] = useState<string>(actividad?.aplicaA ?? 'prospecto')
  const [modo, setModo] = useState<string>(actividad?.modoAsignacion ?? 'directa')
  const [coordinadorId, setCoordinadorId] = useState(actividad?.rolCoordinadorId ?? '')
  const [horaFija, setHoraFija] = useState(actividad?.requiereHoraFija ?? false)
  const [seguimiento, setSeguimiento] = useState(actividad?.esSeguimiento ?? false)
  const [participaciones, setParticipaciones] = useState<ParticipacionEditable[]>(
    actividad
      ? actividad.participaciones.map((p) => ({ id: p.id, nombre: p.nombre, cantidad: String(p.cantidad), obligatoria: p.obligatoria, roles: p.roles.map((r) => ({ rolId: r.rolId, prioridadRolId: r.prioridadRolId })) }))
      : [participacionVacia(catalogo)],
  )
  const [error, setError] = useState<string | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const bloqueada = actividad?.deSistema ?? false

  const cambiarParticipacion = (i: number, cambio: Partial<ParticipacionEditable>) => setParticipaciones((ps) => ps.map((p, j) => (j === i ? { ...p, ...cambio } : p)))
  const cambiarRol = (i: number, k: number, cambio: Partial<RolEditable>) =>
    cambiarParticipacion(i, { roles: participaciones[i].roles.map((r, j) => (j === k ? { ...r, ...cambio } : r)) })

  const enviar = async () => {
    setError(null)
    const resultado = actividadSchema.safeParse({
      nombre,
      tipoActividadId: tipoId,
      minutosEstimados: minutos,
      aplicaA,
      modoAsignacion: modo,
      requiereHoraFija: horaFija,
      esSeguimiento: seguimiento,
      rolCoordinadorId: modo === 'coordinada' ? coordinadorId : undefined,
      participaciones: participaciones.map((p) => ({ ...p, cantidad: p.cantidad })),
    })
    if (!resultado.success) {
      setErrores(Object.fromEntries(resultado.error.issues.map((i) => [i.path.join('.'), i.message])))
      return
    }
    setErrores({})
    try {
      await guardar.mutateAsync(resultado.data)
      toast.success(actividad ? 'Actividad actualizada' : 'Actividad creada')
      onAbiertoChange(false)
    } catch (err) {
      if (err instanceof ApiError && err.errores.length) {
        setErrores(Object.fromEntries(err.errores.map((e) => [e.campo, e.mensaje])))
        setError(err.errores.map((e) => e.mensaje).join('. '))
      } else setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{actividad ? `Editar ${actividad.nombre}` : 'Nueva actividad'}</DialogTitle>
          <DialogDescription>El tiempo estimado se usa para agendar y planificar; los roles y su prioridad definen quién puede hacerla y a quién se sugiere primero.</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {bloqueada && <Alert><AlertDescription>El sistema usa esta actividad por su nombre: no se puede renombrar ni desactivar, pero sí ajustar su tiempo y sus roles.</AlertDescription></Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errores.nombre)} className="sm:col-span-2">
            <FieldLabel htmlFor="act-nombre">Nombre</FieldLabel>
            <Input id="act-nombre" value={nombre} maxLength={100} disabled={bloqueada} onChange={(e) => setNombre(e.target.value)} aria-invalid={Boolean(errores.nombre)} />
            <FieldError>{errores.nombre}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errores.tipoActividadId)}>
            <FieldLabel htmlFor="act-tipo">Tipo</FieldLabel>
            <Select value={tipoId} onValueChange={setTipoId}>
              <SelectTrigger id="act-tipo" className="w-full" aria-invalid={Boolean(errores.tipoActividadId)}>
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                {catalogo.tipos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} aria-hidden="true" />
                    {t.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{errores.tipoActividadId}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errores.minutosEstimados)}>
            <FieldLabel htmlFor="act-min">Tiempo estimado (minutos)</FieldLabel>
            <Input id="act-min" type="number" inputMode="numeric" min={5} step={5} value={minutos} onChange={(e) => setMinutos(e.target.value)} aria-invalid={Boolean(errores.minutosEstimados)} />
            <FieldError>{errores.minutosEstimados}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="act-aplica">Se usa con</FieldLabel>
            <Select value={aplicaA} onValueChange={setAplicaA}>
              <SelectTrigger id="act-aplica" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APLICA_A.map((a) => (
                  <SelectItem key={a} value={a}>
                    {NOMBRE_APLICA_A[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="act-modo">Cómo se asigna</FieldLabel>
            <Select value={modo} onValueChange={setModo}>
              <SelectTrigger id="act-modo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODOS_ASIGNACION.map((m) => (
                  <SelectItem key={m} value={m}>
                    {NOMBRE_MODO_ASIGNACION[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>{DESCRIPCION_MODO_ASIGNACION[modo as (typeof MODOS_ASIGNACION)[number]]}</FieldDescription>
          </Field>
          {modo === 'coordinada' && (
            <Field data-invalid={Boolean(errores.rolCoordinadorId)} className="sm:col-span-2">
              <FieldLabel htmlFor="act-coord">Rol coordinador</FieldLabel>
              <Select value={coordinadorId} onValueChange={setCoordinadorId}>
                <SelectTrigger id="act-coord" className="w-full" aria-invalid={Boolean(errores.rolCoordinadorId)}>
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {catalogo.roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{errores.rolCoordinadorId}</FieldError>
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={horaFija} onCheckedChange={setHoraFija} />
            Requiere hora fija (reunión)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={seguimiento} onCheckedChange={setSeguimiento} />
            Pide resultado y siguiente seguimiento
          </label>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Quién la hace</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => setParticipaciones((ps) => [...ps, participacionVacia(catalogo)])}>
              <Plus />
              Agregar participación
            </Button>
          </div>
          {errores.participaciones && <p className="text-sm text-destructive">{errores.participaciones}</p>}
          {participaciones.map((p, i) => (
            <div key={p.id ?? `nueva-${i}`} className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-end gap-3">
                <Field data-invalid={Boolean(errores[`participaciones.${i}.nombre`])} className="min-w-48 flex-1 basis-full sm:basis-0">
                  <FieldLabel htmlFor={`act-p-${i}`}>Participación</FieldLabel>
                  <Input id={`act-p-${i}`} placeholder="Ej.: Responsable, Revisor" value={p.nombre} maxLength={80} onChange={(e) => cambiarParticipacion(i, { nombre: e.target.value })} aria-invalid={Boolean(errores[`participaciones.${i}.nombre`])} />
                  <FieldError>{errores[`participaciones.${i}.nombre`]}</FieldError>
                </Field>
                <Field className="w-24">
                  <FieldLabel htmlFor={`act-c-${i}`}>Personas</FieldLabel>
                  <Input id={`act-c-${i}`} type="number" min={1} max={10} value={p.cantidad} onChange={(e) => cambiarParticipacion(i, { cantidad: e.target.value })} />
                </Field>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <Switch checked={p.obligatoria} onCheckedChange={(v) => cambiarParticipacion(i, { obligatoria: v })} />
                  Obligatoria
                </label>
                <Button type="button" variant="ghost" size="icon" className="ml-auto" aria-label="Quitar participación" disabled={participaciones.length === 1} onClick={() => setParticipaciones((ps) => ps.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {p.roles.map((r, k) => (
                  <div key={k} className="flex items-center gap-2">
                    <Select value={r.rolId} onValueChange={(v) => cambiarRol(i, k, { rolId: v })}>
                      <SelectTrigger className="flex-1" aria-label="Rol">
                        <SelectValue placeholder="Rol…" />
                      </SelectTrigger>
                      <SelectContent>
                        {catalogo.roles.map((x) => (
                          <SelectItem key={x.id} value={x.id}>
                            {x.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={r.prioridadRolId} onValueChange={(v) => cambiarRol(i, k, { prioridadRolId: v })}>
                      <SelectTrigger className="w-40" aria-label="Prioridad">
                        <SelectValue placeholder="Prioridad…" />
                      </SelectTrigger>
                      <SelectContent>
                        {catalogo.prioridades.map((x) => (
                          <SelectItem key={x.id} value={x.id}>
                            {x.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar rol" disabled={p.roles.length === 1} onClick={() => cambiarParticipacion(i, { roles: p.roles.filter((_, j) => j !== k) })}>
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => cambiarParticipacion(i, { roles: [...p.roles, { rolId: '', prioridadRolId: catalogo.prioridades[1]?.id ?? catalogo.prioridades[0]?.id ?? '' }] })}>
                  <Plus />
                  Agregar rol
                </Button>
                {errores[`participaciones.${i}.roles`] && <p className="text-sm text-destructive">{errores[`participaciones.${i}.roles`]}</p>}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onAbiertoChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={guardar.isPending}>
            {guardar.isPending && <Loader2 className="animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
