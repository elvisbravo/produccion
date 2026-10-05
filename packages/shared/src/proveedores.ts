import { z } from 'zod'

const opcional = <T extends z.ZodType>(esquema: T) => z.preprocess((v) => (v === '' || v === null ? undefined : v), esquema.optional())

export const proveedorSchema = z.object({
  nombres: z.string().trim().min(1, 'Ingresa los nombres').max(100, 'Máximo 100 caracteres'),
  apellidos: z.string().trim().min(1, 'Ingresa los apellidos').max(100, 'Máximo 100 caracteres'),
  celular: opcional(z.string().trim().regex(/^\+?[\d\s-]{7,20}$/, 'Celular no válido')),
  email: opcional(z.string().trim().toLowerCase().pipe(z.email('Correo no válido').max(150))),
  notas: opcional(z.string().trim().max(500, 'Máximo 500 caracteres')),
})
export type ProveedorFormulario = z.input<typeof proveedorSchema>
export type ProveedorDatos = z.output<typeof proveedorSchema>

export const listarProveedoresSchema = z.object({
  q: z.string().trim().max(100).optional(),
  estado: z.enum(['activos', 'inactivos', 'todos']).default('todos'),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(5).max(100).default(20),
})
export type ListarProveedoresConsulta = z.output<typeof listarProveedoresSchema>
export type ListarProveedoresFiltros = Partial<z.input<typeof listarProveedoresSchema>>

export interface ProveedorItem {
  id: string
  nombres: string
  apellidos: string
  celular: string | null
  email: string | null
  notas: string | null
  activo: boolean
  /** Trabajos que ha entregado (los no eliminados). */
  trabajos: number
}
