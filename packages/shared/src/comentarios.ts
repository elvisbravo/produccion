import { z } from 'zod'
import type { UsuarioResumen } from './prospectos.js'

export const ENTIDADES_COMENTARIO = ['prospecto', 'trabajo', 'entregable', 'tarea'] as const
export type EntidadComentario = (typeof ENTIDADES_COMENTARIO)[number]

export const MAX_COMENTARIO = 5000

const texto = z.string().trim().min(1, 'Escribe el comentario').max(MAX_COMENTARIO, `Máximo ${MAX_COMENTARIO} caracteres`)

export const consultaComentariosSchema = z.object({ entidad: z.enum(ENTIDADES_COMENTARIO), entidadId: z.uuid() })
export type ConsultaComentarios = z.output<typeof consultaComentariosSchema>

export const comentarioSchema = consultaComentariosSchema.extend({ texto })
export type ComentarioDatos = z.output<typeof comentarioSchema>

export const editarComentarioSchema = z.object({ texto })

export interface ComentarioItem {
  id: string
  autor: UsuarioResumen
  /** Con las menciones como @[Nombre](id). */
  texto: string
  menciones: UsuarioResumen[]
  creadoEn: string
  editadoEn: string | null
}

// ─── Menciones ──────────────────────────────────────────────

/** @[Nombre Apellido](uuid) */
const PATRON_MENCION = /@\[([^\]\n]{1,120})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi

/** Ids de las personas mencionadas, sin repetir. */
export function extraerMenciones(textoComentario: string): string[] {
  return [...new Set([...textoComentario.matchAll(PATRON_MENCION)].map((m) => m[2].toLowerCase()))]
}

export type ParteComentario = { tipo: 'texto'; texto: string } | { tipo: 'mencion'; id: string; nombre: string }

/** Divide el texto en partes para mostrar las menciones resaltadas. */
export function partesComentario(textoComentario: string): ParteComentario[] {
  const partes: ParteComentario[] = []
  let desde = 0
  for (const m of textoComentario.matchAll(PATRON_MENCION)) {
    if (m.index > desde) partes.push({ tipo: 'texto', texto: textoComentario.slice(desde, m.index) })
    partes.push({ tipo: 'mencion', nombre: m[1], id: m[2].toLowerCase() })
    desde = m.index + m[0].length
  }
  if (desde < textoComentario.length) partes.push({ tipo: 'texto', texto: textoComentario.slice(desde) })
  return partes
}

/** Texto para leer fuera del hilo (avisos): las menciones quedan como @Nombre. */
export const textoPlano = (textoComentario: string) => textoComentario.replace(PATRON_MENCION, (_, nombre: string) => `@${nombre}`)

/**
 * El cuadro de texto muestra "@Nombre Apellido"; al enviar, cada persona elegida de la lista
 * se convierte en @[Nombre Apellido](id). Si se borró del texto, ya no cuenta como mención.
 */
export function marcarMenciones(textoComentario: string, elegidas: { id: string; nombre: string }[]): string {
  let resultado = textoComentario
  // Primero los nombres más largos, para que "@Ana María" no se confunda con "@Ana".
  for (const p of [...elegidas].sort((a, b) => b.nombre.length - a.nombre.length)) {
    const nombre = p.nombre.replace(/[[\]\n]/g, '')
    const escapado = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    resultado = resultado.replace(new RegExp(`(^|[^\\w\\[])@${escapado}(?![\\wáéíóúñü])`, 'giu'), (_, antes: string) => `${antes}@[${nombre}](${p.id})`)
  }
  return resultado
}

/** Al editar: el texto vuelve a "@Nombre" y la lista de elegidas se recupera. */
export function desmarcarMenciones(textoComentario: string): { texto: string; elegidas: { id: string; nombre: string }[] } {
  const elegidas = new Map<string, string>()
  const texto = textoComentario.replace(PATRON_MENCION, (_, nombre: string, id: string) => {
    elegidas.set(id.toLowerCase(), nombre)
    return `@${nombre}`
  })
  return { texto, elegidas: [...elegidas].map(([id, nombre]) => ({ id, nombre })) }
}
