import type { PrismaService } from '../src/prisma/prisma.service.js';

/** Nivel, universidad, carrera y enlace de Drive que ahora exige convertir un prospecto (se crean si faltan). */
export async function datosAcademicos(prisma: PrismaService) {
  const nivel = await prisma.nivelAcademico.findFirstOrThrow({ orderBy: { nombre: 'asc' } });
  const universidad = (await prisma.universidad.findFirst({ where: { nombre: 'Universidad de pruebas e2e' } })) ?? (await prisma.universidad.create({ data: { nombre: 'Universidad de pruebas e2e' } }));
  const carrera = (await prisma.carrera.findFirst({ where: { nombre: 'Carrera de pruebas e2e' } })) ?? (await prisma.carrera.create({ data: { nombre: 'Carrera de pruebas e2e' } }));
  return { nivelAcademicoId: nivel.id, universidadId: universidad.id, carreraId: carrera.id, linkDrive: 'https://drive.google.com/drive/folders/e2e' };
}
