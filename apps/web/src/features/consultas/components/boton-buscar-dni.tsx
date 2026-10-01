import { dniSchema, type DatosDni, type ResultadoConsultaDni, type TipoDocumento } from '@grupoes/shared'
import { useMutation } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/utils'

const consultarDni = (dni: string) => api<ResultadoConsultaDni>(`/consultas/dni/${dni}`)

/**
 * Busca un DNI y entrega nombres y apellidos para rellenar el formulario. Solo se habilita con un DNI de
 * 8 dígitos. Si el servicio no encuentra el número o no responde, se avisa y se completa a mano.
 */
export function BotonBuscarDni({ tipo, numero, onEncontrado, className }: { tipo: TipoDocumento | '' | undefined; numero: string | undefined; onEncontrado: (datos: DatosDni) => void; className?: string }) {
  const buscar = useMutation({ mutationFn: consultarDni })
  const dni = (numero ?? '').trim()
  const valido = tipo === 'DNI' && dniSchema.safeParse(dni).success
  // El resultado vale solo para el número buscado: si se cambia, desaparece.
  const resultado = buscar.variables === dni ? buscar.data : undefined
  const falla = buscar.variables === dni && buscar.isError ? buscar.error : null

  const ejecutar = () =>
    buscar.mutate(dni, {
      onSuccess: (r) => {
        if (r.estado === 'encontrado') onEncontrado(r.datos)
      },
    })

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Button type="button" variant="outline" size="sm" className="w-fit" disabled={!valido || buscar.isPending} onClick={ejecutar}>
        {buscar.isPending ? <Loader2 className="animate-spin" /> : <Search />}
        Buscar DNI
      </Button>
      <div aria-live="polite" className="min-h-4 text-xs">
        {resultado?.estado === 'encontrado' && (
          <p className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
            <CircleCheck className="size-3.5 shrink-0" />
            Datos encontrados. Revísalos: puedes corregirlos.
          </p>
        )}
        {resultado?.estado === 'no_encontrado' && (
          <p className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <CircleAlert className="size-3.5 shrink-0" />
            No se encontró ese DNI. Revisa el número o ingresa los datos a mano.
          </p>
        )}
        {resultado?.estado === 'no_disponible' && (
          <p className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <CircleAlert className="size-3.5 shrink-0" />
            El servicio de consulta no está disponible ahora. Ingresa los datos a mano.
          </p>
        )}
        {falla && (
          <p className="flex items-center gap-1.5 text-destructive">
            <CircleAlert className="size-3.5 shrink-0" />
            {falla instanceof ApiError ? falla.message : 'No se pudo consultar. Ingresa los datos a mano.'}
          </p>
        )}
        {!resultado && !falla && tipo === 'DNI' && !valido && dni.length > 0 && <p className="text-muted-foreground">El DNI tiene 8 dígitos.</p>}
      </div>
    </div>
  )
}
