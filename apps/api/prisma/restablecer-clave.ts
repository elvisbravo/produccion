/**
 * Recuperación de acceso desde la consola del servidor, para cuando no queda ningún administrador
 * que pueda restablecer la contraseña desde el sistema:
 *
 *   pnpm --filter @grupoes/api admin:restablecer admin@grupoes.local
 *
 * Genera una contraseña temporal (se muestra solo aquí), desbloquea la cuenta, cierra sus sesiones
 * y obliga a cambiarla al entrar. Queda en la auditoría como hecho desde la consola.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { generarClaveTemporal } from '../src/auth/clave-temporal.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Uso: pnpm --filter @grupoes/api admin:restablecer <correo>');
    process.exitCode = 1;
    return;
  }
  const usuario = await prisma.usuario.findFirst({ where: { email, eliminadoEn: null } });
  if (!usuario) {
    console.error(`No existe un usuario con el correo ${email}`);
    process.exitCode = 1;
    return;
  }

  const clave = generarClaveTemporal();
  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: usuario.id },
      data: { passwordHash: await hashPassword(clave), debeCambiarClave: true, intentosFallidos: 0, bloqueadoHasta: null, activo: true },
    });
    await tx.sesion.updateMany({ where: { usuarioId: usuario.id, revocadaEn: null }, data: { revocadaEn: new Date(), motivoRevocacion: 'logout' } });
    await tx.auditoria.create({
      data: { usuarioId: null, accion: 'restablecer_clave', entidad: 'usuario', entidadId: usuario.id, despues: { origen: 'consola' } },
    });
  });

  console.log(`\nContraseña temporal de ${email}: ${clave}`);
  console.log('Al entrar, el sistema pedirá cambiarla: escríbela en "Contraseña actual" y elige una nueva.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
