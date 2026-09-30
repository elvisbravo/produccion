/**
 * Normaliza un celular al formato internacional (+51987654321).
 * Acepta espacios, guiones y paréntesis. Un número peruano de 9 dígitos
 * que empieza con 9 recibe el prefijo +51. Devuelve null si no es válido.
 */
export function normalizarCelular(valor: string): string | null {
  let v = valor.trim().replace(/[\s\-().]/g, '')
  if (v.startsWith('00')) v = `+${v.slice(2)}`
  if (/^9\d{8}$/.test(v)) v = `+51${v}`
  else if (/^519\d{8}$/.test(v)) v = `+${v}`
  return /^\+\d{8,15}$/.test(v) ? v : null
}

/** Formato de lectura: +51 987 654 321 (los números extranjeros quedan igual). */
export function formatearCelular(celular: string): string {
  const peru = /^\+51(\d{3})(\d{3})(\d{3})$/.exec(celular)
  return peru ? `+51 ${peru[1]} ${peru[2]} ${peru[3]}` : celular
}

/** Enlace para abrir un chat de WhatsApp (el mensaje es opcional). */
export function enlaceWhatsapp(celular: string, mensaje?: string): string {
  const numero = celular.replace(/^\+/, '')
  return `https://wa.me/${numero}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`
}
