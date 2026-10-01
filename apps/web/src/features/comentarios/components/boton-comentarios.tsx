import type { EntidadComentario } from '@grupoes/shared'
import { MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HiloComentarios } from './hilo-comentarios'

/** Botón que abre el hilo de comentarios de un entregable o una tarea. */
export function BotonComentarios({ entidad, entidadId, titulo }: { entidad: EntidadComentario; entidadId: string; titulo: string }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`Comentarios de ${titulo}`} title="Comentarios" onClick={() => setAbierto(true)}>
        <MessageSquare />
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Comentarios</DialogTitle>
            <DialogDescription>{titulo}</DialogDescription>
          </DialogHeader>
          {abierto && <HiloComentarios entidad={entidad} entidadId={entidadId} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
