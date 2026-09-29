/**
 * Datos iniciales. Se puede ejecutar varias veces sin duplicar nada:
 *   pnpm --filter @grupoes/api db:seed
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { ROLES_BASE, TODOS_LOS_PERMISOS, type Alcance, type PermisoCodigo, type RolBase } from '@grupoes/shared';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/auth/password.js';
import { PARAMETROS_POR_DEFECTO } from '../src/parametros/parametros.service.js';
import { sincronizarCatalogo } from '../src/permisos/catalogo.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const ROLES: Record<RolBase, { nombre: string; descripcion: string }> = {
  ADMIN: { nombre: 'Administrador', descripcion: 'Gestiona usuarios, permisos y configuración. Tiene todos los permisos.' },
  ASIST_ADM: { nombre: 'Asistente administrativo', descripcion: 'Capta prospectos, hace el seguimiento, registra contratos y pagos.' },
  AUXILIAR: { nombre: 'Auxiliar de producción', descripcion: 'Da enfoques y elabora los trabajos asignados.' },
  ASIST_PROD: { nombre: 'Asistente de producción', descripcion: 'Arma equipos, programa tareas y reuniones, reasigna ante ausencias.' },
  JEFE_PROD: { nombre: 'Jefe de producción', descripcion: 'Revisa y aprueba entregables; cubre tareas cuando no hay auxiliares.' },
};

/** Permisos iniciales por rol (el administrador puede cambiarlos desde el sistema). */
type Matriz = Partial<Record<PermisoCodigo, Alcance | null>>;
const PERMISOS_INICIALES: Record<Exclude<RolBase, 'ADMIN'>, Matriz> = {
  ASIST_ADM: {
    'prospectos.ver': 'propios', 'prospectos.crear': null, 'prospectos.editar': 'propios', 'prospectos.exportar': null,
    'prospectos.imprimir': null, 'prospectos.convertir': null, 'prospectos.marcar_perdido': null, 'prospectos.reactivar': null,
    'seguimiento.ver': 'propios',
    'cotizaciones.ver': 'propios', 'cotizaciones.crear': null, 'cotizaciones.editar': 'propios', 'cotizaciones.imprimir': null,
    'cotizaciones.anular': null,
    'programacion.solicitar_urgente': null,
    'trabajos.ver': 'todos', 'entregables.ver': 'todos', 'entregables.registrar_entrega': null,
    'tareas.ver': 'propios', 'tareas.crear': null, 'tareas.editar': 'propios', 'tareas.reprogramar': null,
    'contratos.ver': 'todos', 'contratos.crear': null, 'contratos.editar': null, 'contratos.imprimir': null,
    'contratos.registrar_pago': null, 'contratos.ver_montos': null,
    'ausencias.ver': 'propios', 'ausencias.solicitar': null,
  },
  AUXILIAR: {
    'trabajos.ver': 'equipo', 'entregables.ver': 'equipo', 'entregables.editar': 'equipo', 'entregables.enviar_revision': null,
    'tareas.ver': 'propios', 'tareas.editar': 'propios', 'tareas.tiempo_manual': null,
    'ausencias.ver': 'propios', 'ausencias.solicitar': null,
    'horas_extra.ver': 'propios',
  },
  ASIST_PROD: {
    'prospectos.ver': 'todos',
    'programacion.ver': null, 'programacion.programar': null, 'programacion.reasignar': null,
    'programacion.insertar_urgente': null, 'programacion.proponer_extra': null,
    'trabajos.ver': 'todos', 'trabajos.crear': null, 'trabajos.editar': 'todos', 'trabajos.armar_equipo': null,
    'entregables.ver': 'todos', 'entregables.crear': null, 'entregables.editar': 'todos',
    'tareas.ver': 'todos', 'tareas.crear': null, 'tareas.editar': 'todos', 'tareas.eliminar': null, 'tareas.asignar': null,
    'tareas.reprogramar': null, 'tareas.forzar_agenda': null,
    'ausencias.ver': 'todos', 'ausencias.crear': null, 'ausencias.solicitar': null,
    'horas_extra.ver': 'todos',
    'reportes.ver': null,
  },
  JEFE_PROD: {
    'programacion.ver': null,
    'trabajos.ver': 'equipo', 'entregables.ver': 'equipo', 'entregables.editar': 'equipo',
    'entregables.aprobar': null, 'entregables.observar': null,
    'tareas.ver': 'propios', 'tareas.crear': null, 'tareas.editar': 'propios', 'tareas.tiempo_manual': null,
    'ausencias.ver': 'propios', 'ausencias.solicitar': null,
    'horas_extra.ver': 'todos', 'horas_extra.aprobar': null,
    'reportes.ver': null,
  },
};

async function main() {
  await sincronizarCatalogo(prisma);

  const acciones = await prisma.accion.findMany({ where: { vigente: true }, include: { modulo: true } });
  const accionPorCodigo = new Map(acciones.map((a) => [`${a.modulo.codigo}.${a.codigo}`, a]));

  // Roles base
  for (const [codigo, datos] of Object.entries(ROLES) as [RolBase, (typeof ROLES)[RolBase]][]) {
    const rol = await prisma.rol.upsert({
      where: { codigo },
      create: { codigo, ...datos, esSistema: true },
      update: { esSistema: true },
    });

    // Los permisos iniciales solo se cargan si el rol aún no tiene ninguno (no pisan cambios del administrador).
    const yaTiene = await prisma.rolPermiso.count({ where: { rolId: rol.id } });
    if (yaTiene > 0) continue;

    const matriz: Matriz =
      codigo === ROLES_BASE.ADMIN
        ? Object.fromEntries(TODOS_LOS_PERMISOS.map((p) => [p, accionPorCodigo.get(p)?.usaAlcance ? 'todos' : null]))
        : PERMISOS_INICIALES[codigo];

    await prisma.rolPermiso.createMany({
      data: Object.entries(matriz).map(([permiso, alcance]) => {
        const accion = accionPorCodigo.get(permiso);
        if (!accion) throw new Error(`Permiso inexistente en el catálogo: ${permiso}`);
        return { rolId: rol.id, accionId: accion.id, alcance: accion.usaAlcance ? (alcance ?? 'propios') : null };
      }),
    });
  }

  // Usuario administrador
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@grupoes.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const existente = await prisma.usuario.findFirst({ where: { email, eliminadoEn: null } });
  if (!existente) {
    if (!password) throw new Error('Define SEED_ADMIN_PASSWORD en apps/api/.env para crear el administrador');
    const rolAdmin = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROLES_BASE.ADMIN } });
    await prisma.usuario.create({
      data: {
        nombres: 'Administrador',
        apellidos: 'del sistema',
        email,
        passwordHash: await hashPassword(password),
        roles: { create: { rolId: rolAdmin.id } },
      },
    });
    console.log(`Administrador creado: ${email} (contraseña en SEED_ADMIN_PASSWORD de apps/api/.env)`);
  }

  // Parámetros
  for (const [clave, { valor, descripcion }] of Object.entries(PARAMETROS_POR_DEFECTO)) {
    await prisma.parametro.upsert({ where: { clave }, create: { clave, valor, descripcion }, update: { descripcion } });
  }

  console.log('Seed completado');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
