import type { CatalogosProspecto } from '@grupoes/shared'
import { ArrowRightLeft, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Requerido } from '@/components/requerido'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import { usePermiso } from '@/lib/permisos'
import { useCambiarEtapa } from '@/features/tareas/api'


interface PropsPerdido {
  prospectoId: string
  codigo: string
  etapaPerdida: { id: string }
  motivos: CatalogosProspecto['motivosPerdida']
  /** Texto adicional (p. ej. al sugerirlo tras varios intentos sin respuesta). */
  aviso?: string
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

/** Pide el motivo antes de pasar el prospecto a "Perdido". */
export function DialogoPerdido({ prospectoId, codigo, etapaPerdida, motivos, aviso, abierto, onAbiertoChange }: PropsPerdido) {
  const cambiar = useCambiarEtapa()
  const [motivo, setMotivo] = useState('')

  const confirmar = async () => {
    try {
      await cambiar.mutateAsync({ prospectoId, etapaId: etapaPerdida.id, motivoPerdidaId: motivo })
      toast.success(`${codigo} marcado como perdido`)
      onAbiertoChange(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar la etapa')
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar {codigo} como perdido</DialogTitle>
          <DialogDescription>
            {aviso ? `${aviso} ` : ''}Sus actividades pendientes se cancelan. Podrás reactivarlo si el cliente vuelve.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="motivo-perdido">
            <span>
              Motivo <Requerido />
            </span>
          </FieldLabel>
          <Select value={motivo} onValueChange={setMotivo}>
            <SelectTrigger id="motivo-perdido" className="w-full">
              <SelectValue placeholder="Seleccionar…" />
            </SelectTrigger>
            <SelectContent>
              {motivos.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbiertoChange(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={!motivo || cambiar.isPending} onClick={() => void confirmar()}>
            {cambiar.isPending && <Loader2 className="animate-spin" />}
            Marcar como perdido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface PropsMenu {
  prospectoId: string
  codigo: string
  etapaActual: { id: string; clase: 'abierta' | 'ganada' | 'perdida' }
  catalogos: Pick<CatalogosProspecto, 'etapas' | 'motivosPerdida'>
}

/** Menú para mover el prospecto de etapa (o reactivarlo si está perdido). */
export function MenuCambioEtapa({ prospectoId, codigo, etapaActual, catalogos }: PropsMenu) {
  const cambiar = useCambiarEtapa()
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false)
  const puedeEditar = usePermiso('prospectos.editar')
  const puedePerder = usePermiso('prospectos.marcar_perdido')
  const puedeReactivar = usePermiso('prospectos.reactivar')

  const perdida = catalogos.etapas.find((e) => e.clase === 'perdida')
  const abiertas = catalogos.etapas.filter((e) => e.clase === 'abierta')
  const reactivando = etapaActual.clase === 'perdida'

  if (!puedeEditar || etapaActual.clase === 'ganada' || (reactivando && !puedeReactivar)) return null

  const mover = async (etapaId: string, nombre: string) => {
    try {
      await cambiar.mutateAsync({ prospectoId, etapaId })
      toast.success(reactivando ? `${codigo} reactivado en "${nombre}"` : `${codigo} pasó a "${nombre}"`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar la etapa')
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={cambiar.isPending}>
            {cambiar.isPending ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
            {reactivando ? 'Reactivar' : 'Cambiar etapa'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuLabel>{reactivando ? 'Reactivar en la etapa' : 'Mover a'}</DropdownMenuLabel>
          {abiertas.map((e) => (
            <DropdownMenuItem key={e.id} disabled={e.id === etapaActual.id} onSelect={() => void mover(e.id, e.nombre)}>
              <span className="size-2 rounded-full" style={{ backgroundColor: e.color }} aria-hidden="true" />
              {e.nombre}
            </DropdownMenuItem>
          ))}
          {!reactivando && perdida && puedePerder && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setPidiendoMotivo(true)}>
                Marcar como perdido…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {perdida && pidiendoMotivo && (
        <DialogoPerdido
          prospectoId={prospectoId}
          codigo={codigo}
          etapaPerdida={perdida}
          motivos={catalogos.motivosPerdida}
          abierto
          onAbiertoChange={setPidiendoMotivo}
        />
      )}
    </>
  )
}
