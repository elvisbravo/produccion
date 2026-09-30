// Agrega componentes de shadcn/ui y corrige un defecto de la CLI actual:
// escribe `import { cn } from "cn"` e instala el paquete ajeno `cn`.
// Uso: pnpm ui:add dialog tabs
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const componentes = process.argv.slice(2)
if (componentes.length === 0) {
  console.error('Uso: pnpm ui:add <componente> [...]')
  process.exit(1)
}

execSync(`pnpm dlx shadcn@4.21.0 add ${componentes.join(' ')} -y`, { stdio: 'inherit', env: { ...process.env, CI: '1' } })

const corregidos = []
const recorrer = (dir) => {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name)
    if (entrada.isDirectory()) recorrer(ruta)
    else if (/\.tsx?$/.test(entrada.name)) {
      const texto = fs.readFileSync(ruta, 'utf8')
      if (texto.includes('from "cn"')) {
        fs.writeFileSync(ruta, texto.replaceAll('from "cn"', 'from "@/lib/utils"'))
        corregidos.push(ruta)
      }
    }
  }
}
recorrer('src')
if (corregidos.length) console.log(`Import de cn corregido en: ${corregidos.join(', ')}`)

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
if (pkg.dependencies?.cn) {
  execSync('pnpm remove cn', { stdio: 'inherit' })
  console.log('Paquete "cn" eliminado')
}
