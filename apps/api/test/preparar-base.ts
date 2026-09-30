/**
 * globalSetup de las pruebas e2e: crea la base de pruebas si no existe,
 * aplica las migraciones y carga el seed. Se ejecuta una vez por corrida.
 */
import { execSync } from 'node:child_process';
import pg from 'pg';
import { urlBasePruebas } from './entorno.js';

export default async function prepararBase() {
  const url = urlBasePruebas();
  const nombre = new URL(url).pathname.slice(1);

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const cliente = new pg.Client({ connectionString: admin.toString() });
  await cliente.connect();
  try {
    const { rowCount } = await cliente.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombre]);
    if (!rowCount) await cliente.query(`CREATE DATABASE "${nombre.replace(/"/g, '')}"`);
  } finally {
    await cliente.end();
  }

  const env = { ...process.env, DATABASE_URL: url };
  execSync('pnpm exec prisma migrate deploy', { env, stdio: 'pipe' });
  execSync('pnpm exec tsx prisma/seed.ts', { env, stdio: 'pipe' });
}
