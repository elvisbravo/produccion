/**
 * Catálogo de módulos y acciones del sistema.
 *
 * Es la fuente de verdad: al iniciar, la API sincroniza estas definiciones con
 * las tablas `modulo` y `accion`. El administrador solo decide qué roles o
 * usuarios tienen cada permiso; no puede inventar acciones sin código detrás.
 */

export const ALCANCES = ['propios', 'equipo', 'todos'] as const;
export type Alcance = (typeof ALCANCES)[number];

export interface AccionDef {
  codigo: string;
  nombre: string;
  /** Si la acción se limita por alcance de datos (propios / equipo / todos). */
  usaAlcance?: boolean;
}

export interface ModuloDef {
  codigo: string;
  nombre: string;
  /** Módulo contenedor (grupo del menú). */
  padre?: string;
  ruta?: string;
  /** Nombre del ícono de lucide-react. */
  icono?: string;
  orden: number;
  acciones: readonly AccionDef[];
}

const ver = (usaAlcance = false): AccionDef => ({ codigo: 'ver', nombre: 'Ver', usaAlcance });
const crear: AccionDef = { codigo: 'crear', nombre: 'Crear' };
const editar = (usaAlcance = false): AccionDef => ({ codigo: 'editar', nombre: 'Editar', usaAlcance });
const eliminar: AccionDef = { codigo: 'eliminar', nombre: 'Eliminar' };
const exportar: AccionDef = { codigo: 'exportar', nombre: 'Exportar' };
const imprimir: AccionDef = { codigo: 'imprimir', nombre: 'Imprimir' };
const desactivar: AccionDef = { codigo: 'desactivar', nombre: 'Desactivar' };

export const MODULOS = [
  // Grupos del menú
  { codigo: 'comercial', nombre: 'Comercial', orden: 10, acciones: [] },
  { codigo: 'produccion', nombre: 'Producción', orden: 20, acciones: [] },
  { codigo: 'administracion', nombre: 'Administración', orden: 30, acciones: [] },
  { codigo: 'configuracion', nombre: 'Configuración', orden: 40, acciones: [] },

  // Comercial
  {
    codigo: 'prospectos', nombre: 'Prospectos', padre: 'comercial', ruta: '/prospectos', icono: 'Users', orden: 11,
    acciones: [
      ver(true), crear, editar(true), eliminar, exportar, imprimir,
      { codigo: 'convertir', nombre: 'Convertir a cliente' },
      { codigo: 'reasignar', nombre: 'Reasignar responsable' },
      { codigo: 'marcar_perdido', nombre: 'Marcar como perdido' },
      { codigo: 'reactivar', nombre: 'Reactivar' },
    ],
  },
  {
    codigo: 'seguimiento', nombre: 'Seguimiento', padre: 'comercial', ruta: '/seguimiento', icono: 'SquareKanban', orden: 12,
    acciones: [ver(true)],
  },
  {
    codigo: 'cotizaciones', nombre: 'Cotizaciones', padre: 'comercial', ruta: '/cotizaciones', icono: 'FileText', orden: 13,
    acciones: [ver(true), crear, editar(true), imprimir, { codigo: 'anular', nombre: 'Anular' }],
  },

  // Producción
  {
    codigo: 'programacion', nombre: 'Programación', padre: 'produccion', ruta: '/programacion', icono: 'CalendarDays', orden: 21,
    acciones: [
      ver(),
      { codigo: 'programar', nombre: 'Programar tareas' },
      { codigo: 'reasignar', nombre: 'Reasignar por ausencia' },
      { codigo: 'insertar_urgente', nombre: 'Insertar trabajo urgente' },
      { codigo: 'solicitar_urgente', nombre: 'Solicitar inserción urgente' },
      { codigo: 'proponer_extra', nombre: 'Proponer horas extra o bono' },
    ],
  },
  {
    codigo: 'trabajos', nombre: 'Trabajos', padre: 'produccion', ruta: '/trabajos', icono: 'BriefcaseBusiness', orden: 22,
    acciones: [ver(true), crear, editar(true), exportar, { codigo: 'armar_equipo', nombre: 'Armar equipo' }],
  },
  {
    codigo: 'entregables', nombre: 'Entregables', padre: 'produccion', ruta: '/entregables', icono: 'SquareCheckBig', orden: 23,
    acciones: [
      ver(true), crear, editar(true),
      { codigo: 'enviar_revision', nombre: 'Enviar a revisión' },
      { codigo: 'aprobar', nombre: 'Aprobar' },
      { codigo: 'observar', nombre: 'Observar' },
      { codigo: 'registrar_entrega', nombre: 'Registrar entrega al cliente' },
      { codigo: 'liberar_candado', nombre: 'Entregar con deuda (liberar candado)' },
    ],
  },
  {
    codigo: 'tareas', nombre: 'Mis tareas', padre: 'produccion', ruta: '/tareas', icono: 'Clock', orden: 24,
    acciones: [
      ver(true), crear, editar(true), eliminar,
      { codigo: 'asignar', nombre: 'Asignar' },
      { codigo: 'reprogramar', nombre: 'Reprogramar' },
      { codigo: 'forzar_agenda', nombre: 'Forzar choque de agenda' },
      { codigo: 'tiempo_manual', nombre: 'Registrar tiempo manual' },
    ],
  },

  {
    codigo: 'agenda', nombre: 'Mi agenda', padre: 'produccion', ruta: '/agenda', icono: 'CalendarClock', orden: 25,
    acciones: [ver()],
  },

  // Administración
  {
    codigo: 'contratos', nombre: 'Contratos y pagos', padre: 'administracion', ruta: '/contratos', icono: 'Wallet', orden: 31,
    acciones: [
      ver(true), crear, editar(), imprimir,
      { codigo: 'anular', nombre: 'Anular' },
      { codigo: 'registrar_pago', nombre: 'Registrar pago' },
      { codigo: 'ver_montos', nombre: 'Ver montos' },
    ],
  },
  {
    codigo: 'ausencias', nombre: 'Ausencias', padre: 'administracion', ruta: '/ausencias', icono: 'CalendarOff', orden: 32,
    acciones: [
      ver(true), crear,
      { codigo: 'solicitar', nombre: 'Solicitar' },
      { codigo: 'aprobar', nombre: 'Aprobar o rechazar' },
    ],
  },
  {
    codigo: 'horas_extra', nombre: 'Horas extra y bonos', padre: 'administracion', ruta: '/horas-extra', icono: 'Timer', orden: 33,
    acciones: [ver(true), { codigo: 'aprobar', nombre: 'Aprobar' }, { codigo: 'liquidar', nombre: 'Liquidar' }],
  },
  {
    codigo: 'reportes', nombre: 'Reportes', padre: 'administracion', ruta: '/reportes', icono: 'ChartColumn', orden: 34,
    acciones: [ver(), exportar, imprimir],
  },

  // Configuración
  {
    codigo: 'usuarios', nombre: 'Usuarios', padre: 'configuracion', ruta: '/usuarios', icono: 'UserCog', orden: 41,
    acciones: [
      ver(), crear, editar(), desactivar,
      { codigo: 'asignar_roles', nombre: 'Asignar roles' },
      { codigo: 'asignar_permisos', nombre: 'Asignar permisos' },
      { codigo: 'restablecer_clave', nombre: 'Restablecer contraseña' },
      { codigo: 'ver_costo_hora', nombre: 'Ver costo por hora' },
      { codigo: 'gestionar_administradores', nombre: 'Gestionar administradores' },
    ],
  },
  {
    codigo: 'roles', nombre: 'Roles y permisos', padre: 'configuracion', ruta: '/roles', icono: 'ShieldCheck', orden: 42,
    acciones: [ver(), crear, editar(), eliminar],
  },
  {
    codigo: 'catalogos', nombre: 'Catálogos', padre: 'configuracion', ruta: '/catalogos', icono: 'ListChecks', orden: 43,
    acciones: [ver(), crear, editar(), desactivar],
  },
  {
    codigo: 'parametros', nombre: 'Parámetros', padre: 'configuracion', ruta: '/parametros', icono: 'SlidersHorizontal', orden: 44,
    acciones: [ver(), editar()],
  },
  {
    codigo: 'documentos', nombre: 'Documentos', padre: 'configuracion', ruta: '/documentos', icono: 'FileCog', orden: 47,
    acciones: [ver(), editar()],
  },
  {
    codigo: 'calendario', nombre: 'Horarios y feriados', padre: 'configuracion', ruta: '/calendario', icono: 'CalendarCog', orden: 46,
    acciones: [ver(), editar()],
  },
  {
    codigo: 'auditoria', nombre: 'Auditoría', padre: 'configuracion', ruta: '/auditoria', icono: 'History', orden: 45,
    acciones: [ver()],
  },
] as const satisfies readonly ModuloDef[];

type Modulos = (typeof MODULOS)[number];
type PermisosDe<M> = M extends { codigo: infer C extends string; acciones: readonly (infer A)[] }
  ? A extends { codigo: infer AC extends string }
    ? `${C}.${AC}`
    : never
  : never;

/** Código de permiso con tipado estricto, p. ej. `'prospectos.editar'`. */
export type PermisoCodigo = PermisosDe<Modulos>;

/** Todos los códigos de permiso definidos en el catálogo. */
export const TODOS_LOS_PERMISOS: readonly PermisoCodigo[] = MODULOS.flatMap((m) =>
  m.acciones.map((a) => `${m.codigo}.${a.codigo}` as PermisoCodigo),
);

/** Roles base del sistema (no se pueden eliminar). */
export const ROLES_BASE = {
  ADMIN: 'ADMIN',
  ASIST_ADM: 'ASIST_ADM',
  AUXILIAR: 'AUXILIAR',
  ASIST_PROD: 'ASIST_PROD',
  JEFE_PROD: 'JEFE_PROD',
} as const;
export type RolBase = (typeof ROLES_BASE)[keyof typeof ROLES_BASE];
