/**
 * Usuarios de demostración, uno por rol, para probar el sistema en desarrollo:
 *   pnpm --filter @grupoes/api db:demo
 * La contraseña de todos es SEED_DEMO_PASSWORD (apps/api/.env). No usar en producción.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { diaEnLima, diaSemanaDe, sumarDias, type RolBase } from '@grupoes/shared';
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
  await agendaDemo();
  console.log('Usuarios de demostración listos. Contraseña: SEED_DEMO_PASSWORD de apps/api/.env');
}

/** Cumpleaños y ausencias de ejemplo para ver la agenda (solo si aún no tienen). */
async function agendaDemo() {
  const hoy = diaEnLima();
  const aFecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
  const nacimientos: Record<string, string> = {
    'andrea.torres@grupoes.local': '1994-03-14',
    'gabriela.vargas@grupoes.local': '1991-11-22',
    'rosa.diaz@grupoes.local': '1988-07-05',
    'luis.quispe@grupoes.local': '1997-01-30',
    // Carlos cumple en unos días, para verlo en la agenda.
    'carlos.rojas@grupoes.local': `1996${sumarDias(hoy, 3).slice(4)}`,
  };
  for (const [email, fecha] of Object.entries(nacimientos)) {
    await prisma.usuario.updateMany({ where: { email, fechaNacimiento: null }, data: { fechaNacimiento: aFecha(fecha) } });
  }

  const lunes = sumarDias(hoy, 8 - diaSemanaDe(hoy));
  const admin = await prisma.usuario.findFirst({ where: { roles: { some: { rol: { codigo: 'ADMIN' } } } } });
  const maria = await prisma.usuario.findUniqueOrThrow({ where: { email: 'maria.huaman@grupoes.local' } });
  if (admin && (await prisma.ausencia.count({ where: { usuarioId: maria.id } })) === 0) {
    await prisma.ausencia.create({
      data: {
        usuarioId: maria.id,
        tipo: 'vacaciones',
        fechaDesde: aFecha(lunes),
        fechaHasta: aFecha(sumarDias(lunes, 2)),
        motivo: 'Viaje familiar',
        estado: 'aprobada',
        solicitadaPorId: maria.id,
        resueltaPorId: admin.id,
        resueltaEn: new Date(),
      },
    });
  }
  const luis = await prisma.usuario.findUniqueOrThrow({ where: { email: 'luis.quispe@grupoes.local' } });
  if ((await prisma.ausencia.count({ where: { usuarioId: luis.id } })) === 0) {
    await prisma.ausencia.create({
      data: {
        usuarioId: luis.id,
        tipo: 'permiso',
        fechaDesde: aFecha(sumarDias(lunes, 1)),
        fechaHasta: aFecha(sumarDias(lunes, 1)),
        minutoDesde: 15 * 60,
        minutoHasta: 17 * 60,
        motivo: 'Cita médica',
        estado: 'solicitada',
        solicitadaPorId: luis.id,
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
