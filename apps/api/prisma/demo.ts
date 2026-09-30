/**
 * Usuarios de demostración, uno por rol, para probar el sistema en desarrollo:
 *   pnpm --filter @grupoes/api db:demo
 * La contraseña de todos es SEED_DEMO_PASSWORD (apps/api/.env). No usar en producción.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { RolBase } from '@grupoes/shared';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/auth/password.js';

if (process.env.NODE_ENV === 'production') throw new Error('Los usuarios de demostración no se crean en producción');
const password = process.env.SEED_DEMO_PASSWORD;
if (!password) throw new Error('Define SEED_DEMO_PASSWORD en apps/api/.env');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const USUARIOS: { nombres: string; apellidos: string; email: string; rol: RolBase }[] = [
  { nombres: 'Andrea', apellidos: 'Torres', email: 'andrea.torres@grupoes.local', rol: 'ASIST_ADM' },
  { nombres: 'Gabriela', apellidos: 'Vargas', email: 'gabriela.vargas@grupoes.local', rol: 'ASIST_PROD' },
  { nombres: 'Rosa', apellidos: 'Díaz', email: 'rosa.diaz@grupoes.local', rol: 'JEFE_PROD' },
  { nombres: 'Luis', apellidos: 'Quispe', email: 'luis.quispe@grupoes.local', rol: 'AUXILIAR' },
  { nombres: 'María', apellidos: 'Huamán', email: 'maria.huaman@grupoes.local', rol: 'AUXILIAR' },
  { nombres: 'Carlos', apellidos: 'Rojas', email: 'carlos.rojas@grupoes.local', rol: 'AUXILIAR' },
];

async function main() {
  const passwordHash = await hashPassword(password!);
  for (const u of USUARIOS) {
    const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: u.rol } });
    const existente = await prisma.usuario.findUnique({ where: { email: u.email } });
    if (existente) continue;
    await prisma.usuario.create({
      data: { nombres: u.nombres, apellidos: u.apellidos, email: u.email, passwordHash, roles: { create: { rolId: rol.id } } },
    });
    console.log(`Creado: ${u.email} (${u.rol})`);
  }
  console.log('Usuarios de demostración listos. Contraseña: SEED_DEMO_PASSWORD de apps/api/.env');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
