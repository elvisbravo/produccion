/**
 * Datos iniciales. Se puede ejecutar varias veces sin duplicar nada:
 *   pnpm --filter @grupoes/api db:seed
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PARAMETROS, ROLES_BASE, TODOS_LOS_PERMISOS, type Alcance, type PermisoCodigo, type RolBase } from '@grupoes/shared';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/auth/password.js';
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
    'tareas.ver': 'propios', 'tareas.crear': null, 'tareas.editar': 'propios', 'tareas.reprogramar': null, 'agenda_reuniones.ver': 'propios', 'entregas.ver': null, 'entregas.exportar': null,
    'contratos.ver': 'todos', 'contratos.crear': null, 'contratos.editar': null, 'contratos.imprimir': null,
    'contratos.registrar_pago': null, 'contratos.ver_montos': null,
    'ausencias.ver': 'propios', 'ausencias.solicitar': null,
    'agenda.ver': null,
  },
  AUXILIAR: {
    'trabajos.ver': 'equipo', 'entregables.ver': 'equipo', 'entregables.editar': 'equipo', 'entregables.enviar_revision': null,
    'tareas.ver': 'propios', 'tareas.editar': 'propios', 'tareas.tiempo_manual': null, 'agenda_reuniones.ver': 'propios', 'entregas.ver': null,
    'ausencias.ver': 'propios', 'ausencias.solicitar': null,
    'horas_extra.ver': 'propios',
    'agenda.ver': null,
  },
  ASIST_PROD: {
    'prospectos.ver': 'todos',
    'programacion.ver': null, 'programacion.programar': null, 'programacion.reasignar': null,
    'programacion.insertar_urgente': null, 'programacion.proponer_extra': null,
    'trabajos.ver': 'todos', 'trabajos.crear': null, 'trabajos.editar': 'todos', 'trabajos.armar_equipo': null, 'trabajos.pausar': null, 'trabajos.valorar': null, 'trabajos.fijar_fechas': null, 'trabajos.registrar_de_proveedor': null, 'trabajos.registrar_cliente_directo': null, 'trabajos.reprogramar': null,
    'entregables.ver': 'todos', 'entregables.crear': null, 'entregables.editar': 'todos', 'entregables.turnitin': null, 'entregables.omitir_turnitin': null,
    'tareas.ver': 'todos', 'tareas.crear': null, 'tareas.editar': 'todos', 'tareas.eliminar': null, 'tareas.asignar': null, 'agenda_reuniones.ver': 'todos', 'entregas.ver': null, 'entregas.exportar': null,
    'tareas.reprogramar': null, 'tareas.forzar_agenda': null,
    'ausencias.ver': 'todos', 'ausencias.crear': null, 'ausencias.solicitar': null,
    'horas_extra.ver': 'todos',
    'reportes.ver': null,
    'agenda.ver': null, 'calendario.ver': null,
    'proveedores.ver': null, 'proveedores.crear': null, 'proveedores.editar': null, 'reuniones.ver': null,
  },
  JEFE_PROD: {
    'programacion.ver': null,
    'trabajos.ver': 'equipo', 'entregables.ver': 'equipo', 'entregables.editar': 'equipo',
    'entregables.aprobar': null, 'entregables.observar': null, 'entregables.turnitin': null,
    'tareas.ver': 'propios', 'tareas.crear': null, 'tareas.editar': 'propios', 'tareas.tiempo_manual': null, 'agenda_reuniones.ver': 'todos', 'entregas.ver': null, 'entregas.exportar': null,
    'ausencias.ver': 'propios', 'ausencias.solicitar': null,
    'horas_extra.ver': 'todos', 'horas_extra.aprobar': null,
    'reportes.ver': null,
    'agenda.ver': null,
  },
};

async function main() {
  await sincronizarCatalogo(prisma);

  const acciones = await prisma.accion.findMany({ where: { vigente: true }, include: { modulo: true } });
  const accionPorCodigo = new Map(acciones.map((a) => [`${a.modulo.codigo}.${a.codigo}`, a]));

  // Roles base. Cada permiso inicial se ofrece una sola vez: lo que el administrador quite después no vuelve.
  // Así, los módulos nuevos llegan a los roles de una base existente sin pisar sus cambios.
  const REGISTRO = 'seed.permisos_ofrecidos';
  const registro = await prisma.parametro.findUnique({ where: { clave: REGISTRO } });
  const ofrecidos = new Set<string>((registro?.valor as string[] | undefined) ?? []);

  for (const [codigo, datos] of Object.entries(ROLES) as [RolBase, (typeof ROLES)[RolBase]][]) {
    const rol = await prisma.rol.upsert({
      where: { codigo },
      create: { codigo, ...datos, esSistema: true },
      update: { esSistema: true },
    });

    const matriz: Matriz =
      codigo === ROLES_BASE.ADMIN
        ? Object.fromEntries(TODOS_LOS_PERMISOS.map((p) => [p, accionPorCodigo.get(p)?.usaAlcance ? 'todos' : null]))
        : PERMISOS_INICIALES[codigo];

    const nuevos = Object.entries(matriz).filter(([permiso]) => !ofrecidos.has(`${codigo}:${permiso}`));
    await prisma.rolPermiso.createMany({
      data: nuevos.map(([permiso, alcance]) => {
        const accion = accionPorCodigo.get(permiso);
        if (!accion) throw new Error(`Permiso inexistente en el catálogo: ${permiso}`);
        return { rolId: rol.id, accionId: accion.id, alcance: accion.usaAlcance ? (alcance ?? 'propios') : null };
      }),
      skipDuplicates: true,
    });
    for (const [permiso] of nuevos) ofrecidos.add(`${codigo}:${permiso}`);
  }
  await prisma.parametro.upsert({
    where: { clave: REGISTRO },
    create: { clave: REGISTRO, valor: [...ofrecidos], descripcion: 'Uso interno del seed: permisos iniciales ya ofrecidos a cada rol' },
    update: { valor: [...ofrecidos] },
  });

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
  // Parámetros: se crean con su valor por defecto; los cambios del administrador no se pisan.
  for (const [clave, { porDefecto, descripcion }] of Object.entries(PARAMETROS)) {
    if (porDefecto === null) continue;
    await prisma.parametro.upsert({ where: { clave }, create: { clave, valor: porDefecto, descripcion }, update: { descripcion } });
  }

  await sembrarCatalogos();
  await sembrarActividades();
  await sembrarAgenda();
  await sembrarPlantillasTrabajo();

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
      { nombre: 'Cotizado', orden: 5, color: '#f59e0b', alCotizar: true },
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
    // Producción: se asignan al equipo del trabajo y entran a la cola de cada persona.
    {
      nombre: 'Elaboración',
      tipo: 'Producción',
      minutos: 240,
      aplicaA: 'cliente',
      horaFija: false,
      modo: 'responsable_trabajo',
      coordinador: 'ASIST_PROD',
      participaciones: [{ nombre: 'Responsable', obligatoria: true, roles: [['AUXILIAR', 'Principal'], ['JEFE_PROD', 'Secundaria']] }],
    },
    {
      nombre: 'Corrección de observaciones',
      tipo: 'Corrección',
      minutos: 120,
      aplicaA: 'cliente',
      horaFija: false,
      modo: 'responsable_trabajo',
      coordinador: 'ASIST_PROD',
      participaciones: [{ nombre: 'Responsable', obligatoria: true, roles: [['AUXILIAR', 'Principal'], ['JEFE_PROD', 'Secundaria']] }],
    },
    {
      nombre: 'Revisión interna',
      tipo: 'Revisión / Calidad',
      minutos: 60,
      aplicaA: 'cliente',
      horaFija: false,
      modo: 'responsable_trabajo',
      coordinador: 'ASIST_PROD',
      participaciones: [{ nombre: 'Revisor', obligatoria: true, roles: [['JEFE_PROD', 'Principal']] }],
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

/**
 * Plantillas PROVISIONALES de entregables y tareas por tipo de trabajo.
 * GRUPO ES definirá la estructura real (capítulos y tiempos); solo se crean si el tipo aún no tiene plantilla.
 */
async function sembrarPlantillasTrabajo() {
  type Entregable = { nombre: string; porcentaje: number; esFinal?: boolean; tareas: [string, number][] };
  const h = (horas: number) => horas * 60;
  const tesis: Entregable[] = [
    { nombre: 'Plan de tesis', porcentaje: 15, tareas: [['Redacción del plan de tesis', h(12)]] },
    { nombre: 'Capítulo I: Problema de investigación', porcentaje: 30, tareas: [['Redacción del Capítulo I', h(12)]] },
    { nombre: 'Capítulo II: Marco teórico', porcentaje: 50, tareas: [['Búsqueda bibliográfica', h(8)], ['Redacción del Capítulo II', h(16)]] },
    { nombre: 'Capítulo III: Metodología', porcentaje: 65, tareas: [['Redacción del Capítulo III', h(10)]] },
    { nombre: 'Capítulo IV: Resultados', porcentaje: 80, tareas: [['Procesamiento estadístico', h(10)], ['Redacción del Capítulo IV', h(10)]] },
    { nombre: 'Capítulo V: Discusión y conclusiones', porcentaje: 90, tareas: [['Redacción del Capítulo V', h(8)]] },
    { nombre: 'Informe final', porcentaje: 100, esFinal: true, tareas: [['Integración, formato y referencias', h(8)]] },
  ];
  const plantillas: Record<string, Entregable[]> = {
    Tesis: tesis,
    'Plan de tesis': [
      { nombre: 'Avance: problema y objetivos', porcentaje: 50, tareas: [['Redacción del avance', h(10)]] },
      { nombre: 'Plan de tesis final', porcentaje: 100, esFinal: true, tareas: [['Redacción del plan completo', h(12)]] },
    ],
    'Trabajo de investigación (bachiller)': [
      { nombre: 'Avance', porcentaje: 50, tareas: [['Redacción del avance', h(12)]] },
      { nombre: 'Informe final', porcentaje: 100, esFinal: true, tareas: [['Redacción del informe final', h(16)]] },
    ],
    'Artículo científico': [
      { nombre: 'Borrador del artículo', porcentaje: 60, tareas: [['Búsqueda bibliográfica', h(6)], ['Redacción del borrador', h(12)]] },
      { nombre: 'Artículo final', porcentaje: 100, esFinal: true, tareas: [['Ajustes y formato de la revista', h(6)]] },
    ],
    Monografía: [{ nombre: 'Monografía final', porcentaje: 100, esFinal: true, tareas: [['Redacción de la monografía', h(16)]] }],
    'Trabajo de suficiencia profesional': [
      { nombre: 'Avance', porcentaje: 50, tareas: [['Redacción del avance', h(12)]] },
      { nombre: 'Informe final', porcentaje: 100, esFinal: true, tareas: [['Redacción del informe final', h(12)]] },
    ],
  };

  const elaboracion = await prisma.actividad.findUniqueOrThrow({ where: { nombre: 'Elaboración' } });
  for (const [tipo, entregables] of Object.entries(plantillas)) {
    const tipoTrabajo = await prisma.tipoTrabajo.findUnique({ where: { nombre: tipo }, include: { plantilla: true } });
    if (!tipoTrabajo || tipoTrabajo.plantilla) continue;
    await prisma.plantillaTrabajo.create({
      data: {
        tipoTrabajoId: tipoTrabajo.id,
        entregables: {
          create: entregables.map((e, i) => ({
            nombre: e.nombre,
            orden: i + 1,
            esFinal: e.esFinal ?? false,
            porcentajePlazo: e.porcentaje,
            tareas: { create: e.tareas.map(([titulo, minutos], j) => ({ actividadId: elaboracion.id, titulo, minutosEstimados: minutos, orden: j + 1 })) },
          })),
        },
      },
    });
  }
}

/** Horario estándar (plantilla por defecto) y feriados nacionales del Perú. */
async function sembrarAgenda() {
  const h = (hora: number) => hora * 60;
  if ((await prisma.plantillaHorario.count()) === 0) {
    const tramos = [
      ...[1, 2, 3, 4, 5].flatMap((diaSemana) => [
        { diaSemana, minutoInicio: h(8), minutoFin: h(13) },
        { diaSemana, minutoInicio: h(15), minutoFin: h(19) },
      ]),
      { diaSemana: 6, minutoInicio: h(8), minutoFin: h(13) },
    ];
    await prisma.plantillaHorario.create({ data: { nombre: 'Horario estándar', porDefecto: true, tramos: { createMany: { data: tramos } } } });
  }

  // El administrador revisa cada año los feriados (el Gobierno puede agregar días no laborables).
  const feriados: [string, string][] = [
    ['2026-01-01', 'Año Nuevo'], ['2026-04-02', 'Jueves Santo'], ['2026-04-03', 'Viernes Santo'], ['2026-05-01', 'Día del Trabajo'],
    ['2026-06-07', 'Batalla de Arica y Día de la Bandera'], ['2026-06-29', 'San Pedro y San Pablo'], ['2026-07-23', 'Día de la Fuerza Aérea del Perú'],
    ['2026-07-28', 'Fiestas Patrias'], ['2026-07-29', 'Fiestas Patrias'], ['2026-08-06', 'Batalla de Junín'], ['2026-08-30', 'Santa Rosa de Lima'],
    ['2026-10-08', 'Combate de Angamos'], ['2026-11-01', 'Día de Todos los Santos'], ['2026-12-08', 'Inmaculada Concepción'],
    ['2026-12-09', 'Batalla de Ayacucho'], ['2026-12-25', 'Navidad'],
    ['2027-01-01', 'Año Nuevo'], ['2027-03-25', 'Jueves Santo'], ['2027-03-26', 'Viernes Santo'], ['2027-05-01', 'Día del Trabajo'],
    ['2027-06-07', 'Batalla de Arica y Día de la Bandera'], ['2027-06-29', 'San Pedro y San Pablo'], ['2027-07-23', 'Día de la Fuerza Aérea del Perú'],
    ['2027-07-28', 'Fiestas Patrias'], ['2027-07-29', 'Fiestas Patrias'], ['2027-08-06', 'Batalla de Junín'], ['2027-08-30', 'Santa Rosa de Lima'],
    ['2027-10-08', 'Combate de Angamos'], ['2027-11-01', 'Día de Todos los Santos'], ['2027-12-08', 'Inmaculada Concepción'],
    ['2027-12-09', 'Batalla de Ayacucho'], ['2027-12-25', 'Navidad'],
  ];
  await prisma.feriado.createMany({
    data: feriados.map(([fecha, nombre]) => ({ fecha: new Date(`${fecha}T00:00:00Z`), nombre, alcance: 'nacional' as const })),
    skipDuplicates: true,
  });
}
