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
  await sembrarActividades();

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

type Prioridad = 'Principal' | 'Secundaria' | 'Respaldo';
interface ActividadSemilla {
  nombre: string;
  tipo: string;
  minutos: number;
  aplicaA: 'prospecto' | 'cliente' | 'ambos';
  horaFija: boolean;
  modo: 'creador' | 'directa' | 'coordinada' | 'responsable_trabajo';
  coordinador?: RolBase;
  seguimiento?: boolean;
  participaciones: { nombre: string; obligatoria: boolean; roles: [RolBase, Prioridad][] }[];
}

/** Catálogo de actividades base (el administrador podrá ajustarlo desde el sistema). */
async function sembrarActividades() {
  const tipos = [
    { nombre: 'Reunión', comportamiento: 'reunion' as const, color: '#6366f1' },
    { nombre: 'Contacto / Seguimiento', comportamiento: 'contacto' as const, color: '#0ea5e9' },
    { nombre: 'Producción', comportamiento: 'produccion' as const, color: '#16a34a' },
    { nombre: 'Corrección', comportamiento: 'correccion' as const, color: '#f59e0b' },
    { nombre: 'Revisión / Calidad', comportamiento: 'revision' as const, color: '#8b5cf6' },
    { nombre: 'Administrativa', comportamiento: 'administrativa' as const, color: '#71717a' },
    { nombre: 'Entrega', comportamiento: 'entrega' as const, color: '#14b8a6' },
  ];
  await prisma.tipoActividad.createMany({ data: tipos, skipDuplicates: true });

  await prisma.prioridadRol.createMany({
    data: [
      { nombre: 'Principal', nivel: 1, color: '#18181b' },
      { nombre: 'Secundaria', nivel: 2, color: '#71717a' },
      { nombre: 'Respaldo', nivel: 3, color: '#a1a1aa' },
    ],
    skipDuplicates: true,
  });

  await prisma.resultadoContacto.createMany({
    data: [
      { nombre: 'Contestó', orden: 1 },
      { nombre: 'Interesado', orden: 2 },
      { nombre: 'Pidió cotización', orden: 3 },
      { nombre: 'Lo pensará', orden: 4 },
      { nombre: 'No contestó', orden: 5, cuentaSinRespuesta: true },
      { nombre: 'No interesado', orden: 6 },
      { nombre: 'Número equivocado', orden: 7 },
    ],
    skipDuplicates: true,
  });

  const actividades: ActividadSemilla[] = [
    {
      nombre: 'Enfoque',
      tipo: 'Reunión',
      minutos: 80,
      aplicaA: 'ambos',
      horaFija: true,
      modo: 'coordinada',
      coordinador: 'ASIST_PROD',
      participaciones: [
        {
          nombre: 'Quien da el enfoque',
          obligatoria: true,
          roles: [['JEFE_PROD', 'Principal'], ['AUXILIAR', 'Principal'], ['ASIST_PROD', 'Secundaria']],
        },
        { nombre: 'Acompañante', obligatoria: false, roles: [['ASIST_ADM', 'Principal']] },
      ],
    },
    {
      nombre: 'Llamada de seguimiento',
      tipo: 'Contacto / Seguimiento',
      minutos: 10,
      aplicaA: 'prospecto',
      horaFija: false,
      modo: 'creador',
      seguimiento: true,
      participaciones: [{ nombre: 'Responsable', obligatoria: true, roles: [['ASIST_ADM', 'Principal']] }],
    },
    {
      nombre: 'Mensaje de seguimiento',
      tipo: 'Contacto / Seguimiento',
      minutos: 5,
      aplicaA: 'prospecto',
      horaFija: false,
      modo: 'creador',
      seguimiento: true,
      participaciones: [{ nombre: 'Responsable', obligatoria: true, roles: [['ASIST_ADM', 'Principal']] }],
    },
    {
      nombre: 'Envío de cotización',
      tipo: 'Contacto / Seguimiento',
      minutos: 15,
      aplicaA: 'prospecto',
      horaFija: false,
      modo: 'creador',
      seguimiento: true,
      participaciones: [{ nombre: 'Responsable', obligatoria: true, roles: [['ASIST_ADM', 'Principal']] }],
    },
    {
      nombre: 'Reunión comercial',
      tipo: 'Reunión',
      minutos: 30,
      aplicaA: 'prospecto',
      horaFija: true,
      modo: 'creador',
      seguimiento: true,
      participaciones: [{ nombre: 'Responsable', obligatoria: true, roles: [['ASIST_ADM', 'Principal']] }],
    },
  ];

  const [tiposDb, roles, prioridades] = await Promise.all([
    prisma.tipoActividad.findMany(),
    prisma.rol.findMany(),
    prisma.prioridadRol.findMany(),
  ]);
  const idTipo = (nombre: string) => tiposDb.find((t) => t.nombre === nombre)!.id;
  const idRol = (codigo: RolBase) => roles.find((r) => r.codigo === codigo)!.id;
  const idPrioridad = (nombre: Prioridad) => prioridades.find((p) => p.nombre === nombre)!.id;

  for (const [orden, a] of actividades.entries()) {
    // Solo se crean las que no existen: los ajustes del administrador no se pisan.
    if (await prisma.actividad.findUnique({ where: { nombre: a.nombre } })) continue;
    await prisma.actividad.create({
      data: {
        nombre: a.nombre,
        tipoActividadId: idTipo(a.tipo),
        minutosEstimados: a.minutos,
        aplicaA: a.aplicaA,
        requiereHoraFija: a.horaFija,
        modoAsignacion: a.modo,
        rolCoordinadorId: a.coordinador ? idRol(a.coordinador) : null,
        esSeguimiento: a.seguimiento ?? false,
        orden: orden + 1,
        participaciones: {
          create: a.participaciones.map((p, i) => ({
            nombre: p.nombre,
            obligatoria: p.obligatoria,
            orden: i + 1,
            roles: { create: p.roles.map(([rol, prioridad]) => ({ rolId: idRol(rol), prioridadRolId: idPrioridad(prioridad) })) },
          })),
        },
      },
    });
  }

  // Movimiento automático del embudo con el enfoque.
  const enfoque = await prisma.actividad.findUniqueOrThrow({ where: { nombre: 'Enfoque' } });
  await prisma.etapaProspecto.updateMany({
    where: { nombre: 'Enfoque agendado', actividadEventoId: null },
    data: { actividadEventoId: enfoque.id, momentoEvento: 'al_programar' },
  });
  await prisma.etapaProspecto.updateMany({
    where: { nombre: 'Enfoque realizado', actividadEventoId: null },
    data: { actividadEventoId: enfoque.id, momentoEvento: 'al_completar' },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
