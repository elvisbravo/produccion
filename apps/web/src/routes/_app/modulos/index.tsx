import { type ModuloPermisos } from '@grupoes/shared'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { NOMBRE_ALCANCE } from '@/features/administracion/catalogo'
import { api } from '@/lib/api'
import { exigirPermiso } from '@/lib/guardas'
import { tienePermiso } from '@/lib/permisos'

const modulosQuery = queryOptions({ queryKey: ['modulos'], queryFn: () => api<ModuloPermisos[]>('/modulos'), staleTime: 30_000 })

export const Route = createFileRoute('/_app/modulos/')({
  beforeLoad: () => exigirPermiso('modulos.ver'),
  component: Modulos,
})

const POR_PAGINA = 6
const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function Modulos() {
  const { data } = useQuery(modulosQuery)
  const [texto, setTexto] = useState('')
  const [pagina, setPagina] = useState(1)

  // Se busca por módulo, grupo, acción, código del permiso o rol.
  const filtrados = useMemo(() => {
    const palabras = plano(texto).split(/\s+/).filter(Boolean)
    return (data ?? []).filter((m) => {
      const base = plano([m.nombre, m.grupo ?? '', ...m.acciones.flatMap((a) => [a.nombre, a.permiso, ...a.roles.map((r) => r.nombre)])].join(' '))
      return palabras.every((w) => base.includes(w))
    })
  }, [data, texto])
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const visibles = filtrados.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Módulos y permisos</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Los módulos del sistema, sus acciones y qué roles las tienen. Es una vista de consulta: los módulos y sus acciones los define el sistema; quién tiene cada una se cambia en{' '}
          {tienePermiso('roles.ver') ? (
            <Link to="/roles" className="underline underline-offset-2">
              Roles y permisos
            </Link>
          ) : (
            'Roles y permisos'
          )}
          . El administrador tiene todas las acciones siempre.
        </p>
      </div>

      <div className="relative min-w-60 sm:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Buscar módulo"
          placeholder="Módulo, acción o rol"
          className="pl-8"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setPagina(1)
          }}
        />
      </div>

      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="flex flex-col gap-4">
          {visibles.map((m) => (
            <Card key={m.codigo} className="gap-0 py-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div className="space-y-0.5">
                  <h2 className="font-medium">{m.nombre}</h2>
                  <p className="text-xs text-muted-foreground">
                    {m.grupo ?? 'Sin grupo'}
                    {m.ruta ? ` · ${m.ruta}` : ''}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {!m.activo && <Badge variant="secondary">Inactivo</Badge>}
                  <Badge variant="outline">
                    {m.acciones.length} {m.acciones.length === 1 ? 'acción' : 'acciones'}
                  </Badge>
                </div>
              </div>
              <CardContent className="p-0">
                <Table className="min-w-[40rem]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30%]">Acción</TableHead>
                      <TableHead>Roles que la tienen</TableHead>
                      <TableHead className="w-40">Excepciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {m.acciones.map((a) => (
                      <TableRow key={a.permiso} className={a.vigente ? 'align-top' : 'align-top opacity-60'}>
                        <TableCell className="whitespace-normal">
                          <div className="font-medium">{a.nombre}</div>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <code>{a.permiso}</code>
                            {a.usaAlcance && <span>· con alcance</span>}
                            {!a.vigente && <Badge variant="secondary">Ya no existe</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="secondary" className="text-[11px]">
                              Administrador
                            </Badge>
                            {a.roles
                              .filter((r) => r.codigo !== 'ADMIN')
                              .map((r) => (
                                <Badge key={r.codigo} variant="outline" className="text-[11px]">
                                  {r.nombre}
                                  {a.usaAlcance && r.alcance ? ` · ${NOMBRE_ALCANCE[r.alcance]}` : ''}
                                </Badge>
                              ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {a.concedidas + a.denegadas === 0 ? (
                            '—'
                          ) : (
                            <>
                              {a.concedidas > 0 && <div>{a.concedidas} concedida{a.concedidas === 1 ? '' : 's'}</div>}
                              {a.denegadas > 0 && <div>{a.denegadas} denegada{a.denegadas === 1 ? '' : 's'}</div>}
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
          {filtrados.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Ningún módulo coincide con la búsqueda.</p>}
          {filtrados.length > 0 && (
            <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
              <span>
                {filtrados.length} {filtrados.length === 1 ? 'módulo' : 'módulos'}
              </span>
              <div className="flex items-center gap-2">
                <span>
                  Página {paginaActual} de {totalPaginas}
                </span>
                <Button variant="outline" size="icon-sm" aria-label="Página anterior" disabled={paginaActual <= 1} onClick={() => setPagina(paginaActual - 1)}>
                  <ChevronLeft />
                </Button>
                <Button variant="outline" size="icon-sm" aria-label="Página siguiente" disabled={paginaActual >= totalPaginas} onClick={() => setPagina(paginaActual + 1)}>
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
