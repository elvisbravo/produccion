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

  await sembrarCatalogos();

  console.log('Seed completado');
}

/**
 * Catálogos base. Solo se crean los que faltan: los cambios que haga el
 * administrador desde el sistema no se pisan.
 */
async function sembrarCatalogos() {
  // Días de garantía provisionales: GRUPO ES definirá los valores reales.
  const tiposTrabajo = [
    { nombre: 'Tesis', maxIntegrantes: 2, diasGarantia: 30, orden: 1 },
    { nombre: 'Plan de tesis', maxIntegrantes: 2, diasGarantia: 15, orden: 2 },
    { nombre: 'Trabajo de investigación (bachiller)', maxIntegrantes: 2, diasGarantia: 15, orden: 3 },
    { nombre: 'Artículo científico', maxIntegrantes: 5, diasGarantia: 30, orden: 4 },
    { nombre: 'Monografía', maxIntegrantes: 3, diasGarantia: 15, orden: 5 },
    { nombre: 'Trabajo de suficiencia profesional', maxIntegrantes: 1, diasGarantia: 30, orden: 6 },
  ];
  await prisma.tipoTrabajo.createMany({ data: tiposTrabajo, skipDuplicates: true });

  await prisma.prioridadTrabajo.createMany({
    data: [
      { nombre: 'Urgente', nivel: 1, color: '#dc2626', permiteInsercionUrgente: true },
      { nombre: 'Alta', nivel: 2, color: '#ea580c' },
      { nombre: 'Media', nivel: 3, color: '#2563eb', porDefecto: true },
      { nombre: 'Baja', nivel: 4, color: '#71717a' },
    ],
    skipDuplicates: true,
  });

  await prisma.nivelAcademico.createMany({
    data: ['Pregrado (bachiller)', 'Pregrado (título profesional)', 'Segunda especialidad', 'Maestría', 'Doctorado'].map(
      (nombre, i) => ({ nombre, orden: i + 1 }),
    ),
    skipDuplicates: true,
  });

  await prisma.origenContacto.createMany({
    data: ['Facebook', 'Instagram', 'TikTok', 'WhatsApp', 'Referido', 'Página web', 'Google', 'Otro'].map((nombre, i) => ({
      nombre,
      orden: i + 1,
      esReferido: nombre === 'Referido',
    })),
    skipDuplicates: true,
  });

  await prisma.etapaProspecto.createMany({
    data: [
      { nombre: 'Nuevo', orden: 1, color: '#a1a1aa', inicial: true },
      { nombre: 'Contactado', orden: 2, color: '#60a5fa' },
      { nombre: 'Enfoque agendado', orden: 3, color: '#818cf8' },
      { nombre: 'Enfoque realizado', orden: 4, color: '#a78bfa' },
      { nombre: 'Cotizado', orden: 5, color: '#f59e0b' },
      { nombre: 'Negociación', orden: 6, color: '#fb923c' },
      { nombre: 'Convertido', orden: 7, color: '#16a34a', clase: 'ganada' as const },
      { nombre: 'Perdido', orden: 8, color: '#71717a', clase: 'perdida' as const },
    ],
    skipDuplicates: true,
  });

  await prisma.motivoPerdida.createMany({
    data: ['Precio', 'Eligió a otro proveedor', 'No responde', 'Ya no lo necesita', 'Lo hará por su cuenta', 'Otro'].map(
      (nombre, i) => ({ nombre, orden: i + 1 }),
    ),
    skipDuplicates: true,
  });

  // Punto de partida: se pueden agregar más desde el formulario del prospecto.
  const universidades: [string, string][] = [
    ['Universidad Nacional Mayor de San Marcos', 'UNMSM'],
    ['Universidad Nacional de Ingeniería', 'UNI'],
    ['Universidad Nacional Federico Villarreal', 'UNFV'],
    ['Universidad Nacional del Callao', 'UNAC'],
    ['Universidad Nacional Agraria La Molina', 'UNALM'],
    ['Universidad Nacional de Educación Enrique Guzmán y Valle', 'UNE'],
    ['Universidad Nacional de San Agustín de Arequipa', 'UNSA'],
    ['Universidad Nacional de Trujillo', 'UNT'],
    ['Universidad Nacional de San Antonio Abad del Cusco', 'UNSAAC'],
    ['Pontificia Universidad Católica del Perú', 'PUCP'],
    ['Universidad Peruana de Ciencias Aplicadas', 'UPC'],
    ['Universidad de San Martín de Porres', 'USMP'],
    ['Universidad César Vallejo', 'UCV'],
    ['Universidad Privada del Norte', 'UPN'],
    ['Universidad Tecnológica del Perú', 'UTP'],
    ['Universidad de Lima', 'ULIMA'],
    ['Universidad del Pacífico', 'UP'],
    ['Universidad Peruana Cayetano Heredia', 'UPCH'],
    ['Universidad Ricardo Palma', 'URP'],
    ['Universidad San Ignacio de Loyola', 'USIL'],
    ['Universidad Continental', 'UC'],
    ['Universidad Científica del Sur', 'UCSUR'],
    ['Universidad Privada Antenor Orrego', 'UPAO'],
    ['Universidad Alas Peruanas', 'UAP'],
    ['Universidad Inca Garcilaso de la Vega', 'UIGV'],
    ['Universidad Norbert Wiener', 'UWIENER'],
  ];
  await prisma.universidad.createMany({ data: universidades.map(([nombre, siglas]) => ({ nombre, siglas })), skipDuplicates: true });

  const carreras = [
    'Administración', 'Arquitectura', 'Biología', 'Ciencias de la Comunicación', 'Contabilidad', 'Derecho', 'Economía',
    'Educación', 'Enfermería', 'Farmacia y Bioquímica', 'Ingeniería Ambiental', 'Ingeniería Civil', 'Ingeniería de Sistemas',
    'Ingeniería Industrial', 'Marketing', 'Medicina Humana', 'Negocios Internacionales', 'Nutrición', 'Obstetricia',
    'Odontología', 'Psicología', 'Tecnología Médica', 'Trabajo Social',
  ];
  await prisma.carrera.createMany({ data: carreras.map((nombre) => ({ nombre })), skipDuplicates: true });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
