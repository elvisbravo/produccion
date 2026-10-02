/**
 * Regenera docs/modelo-datos.html a partir de docs/modelo-datos.md: la página incrusta el markdown dentro de
 * <script id="md" type="text/markdown"> y lo dibuja en el navegador (marked + mermaid).
 *
 *   pnpm docs:html
 */
import { readFileSync, writeFileSync } from 'node:fs';

const md = readFileSync(new URL('../docs/modelo-datos.md', import.meta.url), 'utf8');
const rutaHtml = new URL('../docs/modelo-datos.html', import.meta.url);
const html = readFileSync(rutaHtml, 'utf8');

const inicio = html.indexOf('<script id="md" type="text/markdown">');
const fin = html.indexOf('</script>', inicio);
if (inicio < 0 || fin < 0) throw new Error('No encontré el bloque <script id="md"> en docs/modelo-datos.html');

// Un "</script>" dentro del markdown cerraría la etiqueta antes de tiempo.
const seguro = md.replace(/<\/script>/gi, '<\/script>');
const apertura = '<script id="md" type="text/markdown">';
writeFileSync(rutaHtml, html.slice(0, inicio) + apertura + seguro + html.slice(fin));
console.log(`ok ${md.length}`);
