import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  diaEnLima,
  NOMBRE_CANAL_ENTREGA,
  ROLES_BASE,
  sumarDias,
  type BandejaEntregable,
  type ColaItem,
  type ColaPersona,
  type EntregableDatos,
  type EntregableItem,
  type EntregaItem,
  type EntregarDatos,
  type OmitirTurnitinDatos,
  type PlanTarea,
  type RespuestaClienteDatos,
  type ResultadoTurnitinDatos,
  type RevisarEntregableDatos,
  type RevisionItem,
  type Semaforo,
  type TareaEntregableDatos,
  type TurnitinConfig,
  type TurnitinItem,
  type VistaBandeja,
} from '@grupoes/shared';
import { AgendaService, type ColaDeUsuario } from '../agenda/agenda.service.js';
import { holgura, type PlanCola } from '../agenda/cola.js';
import { AuditoriaService } from '../common/auditoria.service.js';
import { errorFechasFijas } from '../trabajos/fechas-fijas.error.js';
import type { Prisma } from '../generated/prisma/client.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { ParametrosService } from '../parametros/parametros.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { minutosReales } from '../tareas/mapeo.js';
import { cerrarTramos } from '../tareas/tramos.js';

export interface ActorProduccion {
  usuarioId: string;
  ip: string | null;
}

type Tx = Prisma.TransactionClient;
const CAMPOS_USUARIO = { id: true, nombres: true, apellidos: true } as const;
const soloFecha = (d: Date) => d.toISOString().slice(0, 10);
const aFecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const errorCampo = (campo: string, mensaje: string) => new BadRequestException({ message: 'Datos inválidos', errores: [{ campo, mensaje }] });
const ACTIVAS = ['por_asignar', 'pendiente', 'en_proceso'] as const;

/** Nombres de las actividades de producción que usa el flujo (sembradas por el seed). */
export const ACTIVIDAD = { elaboracion: 'Elaboración', correccion: 'Corrección de observaciones', revision: 'Revisión interna' } as const;

const INCLUIR_ENTREGABLE = {
  tareas: {
    where: { estado: { not: 'cancelada' } },
    orderBy: [{ creadoEn: 'asc' }],
    include: {
      actividad: { include: { tipo: true } },
      responsables: { include: { usuario: { select: CAMPOS_USUARIO } } },
    },
  },
  revisiones: { orderBy: { fecha: 'desc' }, include: { revisor: { select: CAMPOS_USUARIO } } },
  entregas: { orderBy: { fecha: 'desc' }, include: { enviadoPor: { select: CAMPOS_USUARIO } } },
  turnitin: { orderBy: { enviadoEn: 'desc' }, include: { enviadoPor: { select: CAMPOS_USUARIO }, registradoPor: { select: CAMPOS_USUARIO } } },
} as const satisfies Prisma.EntregableInclude;
type EntregableCompleto = Prisma.EntregableGetPayload<{ include: typeof INCLUIR_ENTREGABLE }>;

const aPlan = (p: PlanCola | undefined): PlanTarea | null => {
  if (!p?.inicio || !p.fin) return null;
  const instante = (fecha: string, minuto: number) => new Date(`${fecha}T00:00:00-05:00`).getTime() + minuto * 60_000;
  return { inicio: new Date(instante(p.inicio.fecha, p.inicio.inicio)).toISOString(), fin: new Date(instante(p.fin.fecha, p.fin.fin)).toISOString() };
};
const PEOR: Record<Semaforo, number> = { verde: 0, ambar: 1, sin_plan: 2, rojo: 3 };

const aRevision = (r: EntregableCompleto['revisiones'][number]): RevisionItem => ({
  id: r.id,
  resultado: r.resultado,
  observaciones: r.observaciones,
  similitud: r.similitud === null ? null : Number(r.similitud),
  ia: r.ia === null ? null : Number(r.ia),
  revisor: r.revisor,
  fecha: r.fecha.toISOString(),
});
const aTurnitin = (t: EntregableCompleto['turnitin'][number]): TurnitinItem => ({
  id: t.id,
  enviadoPor: t.enviadoPor,
  enviadoEn: t.enviadoEn.toISOString(),
  resultado: t.resultado,
  similitud: t.similitud === null ? null : Number(t.similitud),
  ia: t.ia === null ? null : Number(t.ia),
  observaciones: t.observaciones,
  registradoPor: t.registradoPor,
  registradoEn: t.registradoEn?.toISOString() ?? null,
});
const aEntrega = (e: EntregableCompleto['entregas'][number]): EntregaItem => ({
  id: e.id,
  fecha: e.fecha.toISOString(),
  canal: e.canal,
  notas: e.notas,
  enviadoPor: e.enviadoPor,
  respuesta: e.respuesta,
  observacionesCliente: e.observacionesCliente,
  respondidoEn: e.respondidoEn?.toISOString() ?? null,
});

@Injectable()
export class ProduccionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agenda: AgendaService,
    private readonly auditoria: AuditoriaService,
    private readonly notificaciones: NotificacionesService,
    private readonly parametros: ParametrosService,
  ) {}

  // ─── Lectura ─────────────────────────────────────────────

  async hayPlantilla(tipoTrabajoId: string): Promise<boolean> {
    return (await this.prisma.plantillaTrabajo.count({ where: { tipoTrabajoId } })) > 0;
  }

  /** Entregables del trabajo con sus tareas, el plan de la cola y el semáforo de cada uno. */
  async deTrabajo(trabajoId: string): Promise<EntregableItem[]> {
    const entregables = await this.prisma.entregable.findMany({ where: { trabajoId }, orderBy: { orden: 'asc' }, include: INCLUIR_ENTREGABLE });
    const responsables = [...new Set(entregables.flatMap((e) => e.tareas.flatMap((t) => t.responsables.map((r) => r.usuarioId))))];
    const colas = await this.agenda.colas(responsables);
    return entregables.map((e) => this.aEntregable(e, colas));
  }

  private aEntregable(e: EntregableCompleto, colas: Map<string, ColaDeUsuario>): EntregableItem {
    const fechaLimite = soloFecha(e.fechaLimite);
    const planDe = (tareaId: string) => {
      for (const cola of colas.values()) {
        const plan = cola.planes.get(tareaId);
        if (plan) return plan;
      }
      return undefined;
    };
    const tareas = e.tareas.map((t) => {
      const activa = (ACTIVAS as readonly string[]).includes(t.estado);
      const enCola = activa && !t.inicio && t.responsables.some((r) => r.ordenCola !== null);
      const plan = enCola ? planDe(t.id) : undefined;
      const h = enCola ? holgura(plan?.fin?.fecha ?? null, fechaLimite) : null;
      return {
        id: t.id,
        titulo: t.titulo,
        actividad: { id: t.actividad.id, nombre: t.actividad.nombre, comportamiento: t.actividad.tipo.comportamiento, color: t.actividad.tipo.color },
        estado: t.estado,
        minutos: t.minutosEstimados,
        responsable: t.responsables[0]?.usuario ?? null,
        plan: aPlan(plan),
        holguraDias: h?.dias ?? null,
        semaforo: h?.semaforo ?? null,
        notas: t.notas,
      };
    });
    const conPlan = tareas.filter((t) => t.semaforo);
    const peor = conPlan.reduce<Semaforo | null>((p, t) => (p === null || PEOR[t.semaforo!] > PEOR[p] ? t.semaforo : p), null);
    const fines = tareas.map((t) => t.plan?.fin).filter((f): f is string => Boolean(f));
    return {
      id: e.id,
      nombre: e.nombre,
      orden: e.orden,
      esFinal: e.esFinal,
      fechaLimite,
      estado: e.estado,
      similitud: e.similitud === null ? null : Number(e.similitud),
      ia: e.ia === null ? null : Number(e.ia),
      tareas,
      revisiones: e.revisiones.map(aRevision),
      entregas: e.entregas.map(aEntrega),
      turnitin: e.turnitin.map(aTurnitin),
      turnitinConformeEn: e.turnitinConformeEn?.toISOString() ?? null,
      finPlan: fines.sort().at(-1) ?? null,
      semaforo: peor,
    };
  }

  // ─── Entregables ─────────────────────────────────────────

  private async trabajoAbierto(db: Tx | PrismaService, trabajoId: string) {
    const trabajo = await db.trabajo.findFirst({
      where: { id: trabajoId, eliminadoEn: null },
      include: { equipo: { where: { hasta: null } }, entregables: { select: { id: true, orden: true } } },
    });
    if (!trabajo) throw new NotFoundException('Trabajo no encontrado');
    if (['finalizado', 'cancelado'].includes(trabajo.estado)) throw new BadRequestException('El trabajo ya está cerrado');
    if (trabajo.estado === 'suspendido') throw new BadRequestException('El trabajo está en espera del cliente: reanúdalo para programar tareas');
    return trabajo;
  }

  private async entregable(db: Tx | PrismaService, id: string) {
    const e = await db.entregable.findUnique({ where: { id }, include: { trabajo: { include: { equipo: { where: { hasta: null } } } } } });
    if (!e) throw new NotFoundException('Entregable no encontrado');
    return e;
  }

  async trabajoDeEntregable(entregableId: string): Promise<string> {
    return (await this.entregable(this.prisma, entregableId)).trabajoId;
  }

  async trabajoDeTarea(tareaId: string): Promise<string | null> {
    return (await this.prisma.tarea.findUnique({ where: { id: tareaId }, select: { trabajoId: true } }))?.trabajoId ?? null;
  }

  /** Crea los entregables y las tareas desde la plantilla del tipo de trabajo, en la cola del auxiliar principal. */
  async generarPlan(trabajoId: string, actor: ActorProduccion, inicial?: { fecha: string; minuto: number }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const trabajo = await this.trabajoAbierto(tx, trabajoId);
      if (trabajo.entregables.length > 0) throw new ConflictException('El trabajo ya tiene entregables: agrégalos uno por uno');
      const principal = trabajo.equipo.find((e) => e.funcion === 'auxiliar_principal');
      if (!principal) throw new BadRequestException('Primero arma el equipo: las tareas van a la cola del auxiliar principal');
      // Trabajo de proveedor: un entregable con su fecha de entrega y una sola tarea (la actividad y el tiempo del registro).
      if (trabajo.actividadPlanId && trabajo.minutosPlan) {
        // Si la actividad es una revisión, el trabajo ya llegó para revisarse: el entregable nace "en revisión" (la tarea de revisión
        // no se completa a mano, la cierra quien revisa). En otro caso se elabora primero y luego se envía a revisión.
        const plan = await tx.actividad.findUnique({ where: { id: trabajo.actividadPlanId }, select: { tipo: { select: { comportamiento: true } } } });
        const paraRevisar = plan?.tipo.comportamiento === 'revision';
        const entregable = await tx.entregable.create({
          data: { trabajoId, nombre: 'Entrega final', orden: 1, esFinal: true, fechaLimite: trabajo.fechaLimite, estado: paraRevisar ? 'en_revision' : 'pendiente' },
        });
        await this.crearTareaTx(
          tx,
          { trabajoId, entregableId: entregable.id, actividadId: trabajo.actividadPlanId, titulo: trabajo.titulo ?? 'Trabajo de proveedor', minutos: trabajo.minutosPlan, ...(inicial && { noAntesDe: inicial.fecha, noAntesDeMinuto: inicial.minuto }) },
          undefined,
          actor,
          // Va al final de la cola: si el auxiliar no tiene nada, arranca en la fecha y hora indicadas (aunque sean pasadas); si ya tiene actividades, sigue cuando terminan.
          paraRevisar,
        );
        await this.evento(tx, trabajoId, paraRevisar ? 'Plan generado: 1 entregable, ya en revisión' : 'Plan generado: 1 entregable y 1 tarea', actor);
        await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'generar_plan', entidad: 'trabajo', entidadId: trabajoId, ip: actor.ip }, tx);
        return;
      }
      const plantilla = await tx.plantillaTrabajo.findUnique({
        where: { tipoTrabajoId: trabajo.tipoTrabajoId },
        include: { entregables: { orderBy: { orden: 'asc' }, include: { tareas: { orderBy: { orden: 'asc' } } } } },
      });
      if (!plantilla?.entregables.length) throw new BadRequestException('Este tipo de trabajo no tiene plantilla: agrega los entregables a mano');

      const inicio = soloFecha(trabajo.fechaInicio);
      const plazo = Math.round((trabajo.fechaLimite.getTime() - trabajo.fechaInicio.getTime()) / 86_400_000);
      for (const pe of plantilla.entregables) {
        const entregable = await tx.entregable.create({
          data: {
            trabajoId,
            nombre: pe.nombre,
            orden: pe.orden,
            esFinal: pe.esFinal,
            fechaLimite: aFecha(pe.porcentajePlazo >= 100 ? soloFecha(trabajo.fechaLimite) : sumarDias(inicio, Math.round((plazo * pe.porcentajePlazo) / 100))),
          },
        });
        for (const pt of pe.tareas) {
          await this.crearTareaTx(tx, { trabajoId, entregableId: entregable.id, actividadId: pt.actividadId, titulo: pt.titulo, minutos: pt.minutosEstimados }, principal.usuarioId, actor);
        }
      }
      await this.evento(tx, trabajoId, `Plan generado desde la plantilla: ${plantilla.entregables.length} entregables`, actor);
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'generar_plan', entidad: 'trabajo', entidadId: trabajoId, ip: actor.ip }, tx);
    });
    await this.avisarEquipo(trabajoId, ['auxiliar_principal'], 'cola.plan', (codigo) => `Nuevas tareas en tu cola: plan de ${codigo}`, null, actor, '/tareas?vista=cola');
  }

  /** Avisa a quienes cumplen ciertas funciones en el equipo del trabajo. */
  private async avisarEquipo(
    trabajoId: string,
    funciones: string[],
    tipo: string,
    titulo: (codigo: string) => string,
    mensaje: string | null,
    actor: ActorProduccion,
    enlace?: string,
    extra: (string | null | undefined)[] = [],
  ) {
    const t = await this.prisma.trabajo.findUnique({ where: { id: trabajoId }, select: { codigo: true, equipo: { where: { hasta: null }, select: { usuarioId: true, funcion: true } } } });
    if (!t) return;
    const destinos = [...t.equipo.filter((e) => funciones.includes(e.funcion)).map((e) => e.usuarioId), ...extra];
    await this.notificaciones.notificar(destinos, { tipo, titulo: titulo(t.codigo), mensaje, enlace: enlace ?? `/trabajos/${trabajoId}` }, actor.usuarioId);
  }

  /** Responsables de las tareas activas de un entregable con cierto comportamiento (p. ej. la corrección recién creada). */
  private async responsablesDe(entregableId: string, comportamiento: 'revision' | 'correccion') {
    const filas = await this.prisma.tareaResponsable.findMany({
      where: { tarea: { entregableId, estado: { in: ['pendiente', 'en_proceso'] }, actividad: { tipo: { comportamiento } } } },
      select: { usuarioId: true },
    });
    return filas.map((f) => f.usuarioId);
  }

  async crearEntregable(trabajoId: string, datos: EntregableDatos, actor: ActorProduccion): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const trabajo = await this.trabajoAbierto(tx, trabajoId);
      this.validarFecha(datos.fechaLimite, trabajo.fechaInicio, trabajo.fechaLimite);
      const orden = Math.max(0, ...trabajo.entregables.map((e) => e.orden)) + 1;
      const e = await tx.entregable.create({ data: { trabajoId, nombre: datos.nombre, orden, esFinal: datos.esFinal, fechaLimite: aFecha(datos.fechaLimite) } });
      await this.evento(tx, trabajoId, `Nuevo entregable: ${e.nombre}`, actor);
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'crear', entidad: 'entregable', entidadId: e.id, despues: datos, ip: actor.ip }, tx);
    });
  }

  private validarFecha(fecha: string, inicio: Date, limite: Date) {
    if (fecha < soloFecha(inicio)) throw errorCampo('fechaLimite', 'No puede ser anterior al inicio del trabajo');
    if (fecha > soloFecha(limite)) throw errorCampo('fechaLimite', 'No puede pasar la fecha límite del trabajo');
  }

  async editarEntregable(id: string, datos: EntregableDatos, actor: ActorProduccion): Promise<void> {
    const e = await this.entregable(this.prisma, id);
    if (e.estado === 'cerrado') throw new BadRequestException('El entregable ya está cerrado');
    this.validarFecha(datos.fechaLimite, e.trabajo.fechaInicio, e.trabajo.fechaLimite);
    // Con fechas fijas se puede cambiar el nombre, pero no la fecha.
    if (e.trabajo.fechasFijas && soloFecha(e.fechaLimite) !== datos.fechaLimite) throw errorFechasFijas(e.trabajo);
    await this.prisma.$transaction(async (tx) => {
      await tx.entregable.update({ where: { id }, data: { nombre: datos.nombre, fechaLimite: aFecha(datos.fechaLimite), esFinal: datos.esFinal } });
      if (soloFecha(e.fechaLimite) !== datos.fechaLimite) {
        await this.evento(tx, e.trabajoId, `${datos.nombre}: fecha límite del ${soloFecha(e.fechaLimite)} al ${datos.fechaLimite}`, actor);
      }
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'editar', entidad: 'entregable', entidadId: id, antes: e, despues: datos, ip: actor.ip }, tx);
    });
  }

  /** Solo si nada se hizo todavía: se borra con sus tareas. */
  async eliminarEntregable(id: string, actor: ActorProduccion): Promise<void> {
    const e = await this.entregable(this.prisma, id);
    const hechas = await this.prisma.tarea.count({ where: { entregableId: id, estado: { in: ['completada', 'en_proceso'] } } });
    if (e.estado !== 'pendiente' || hechas > 0) throw new BadRequestException('Solo se eliminan entregables que aún no empiezan');
    await this.prisma.$transaction(async (tx) => {
      await tx.entregable.delete({ where: { id } });
      await this.evento(tx, e.trabajoId, `Se eliminó el entregable ${e.nombre}`, actor);
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'eliminar', entidad: 'entregable', entidadId: id, antes: e, ip: actor.ip }, tx);
    });
  }

  // ─── Tareas de producción ────────────────────────────────

  /** Responsable por defecto: el auxiliar principal; en actividades solo para jefes, el jefe responsable. */
  private async resolverResponsable(
    tx: Tx,
    actividad: Prisma.ActividadGetPayload<{ include: { participaciones: { include: { roles: { include: { rol: true } } } } } }>,
    equipo: { usuarioId: string; funcion: string }[],
    usuarioId: string | undefined,
  ) {
    const participacion = actividad.participaciones.find((p) => p.obligatoria) ?? actividad.participaciones[0];
    if (!participacion) throw new BadRequestException(`"${actividad.nombre}" no tiene participaciones configuradas`);
    const paraAuxiliar = participacion.roles.some((r) => r.rol.codigo === ROLES_BASE.AUXILIAR);
    const porDefecto = equipo.find((e) => e.funcion === (paraAuxiliar ? 'auxiliar_principal' : 'jefe_responsable'))?.usuarioId;
    const elegido = usuarioId ?? porDefecto;
    if (!elegido) throw new BadRequestException(paraAuxiliar ? 'El trabajo no tiene auxiliar principal: arma el equipo' : 'El trabajo no tiene jefe responsable');
    const roles = await tx.usuarioRol.findMany({ where: { usuarioId: elegido, rol: { activo: true }, usuario: { activo: true, eliminadoEn: null } } });
    const rol = participacion.roles.find((r) => roles.some((u) => u.rolId === r.rolId));
    if (!rol) throw errorCampo('usuarioId', 'Esa persona no tiene un rol permitido para esta actividad');
    return { usuarioId: elegido, participacionId: participacion.id, rolId: rol.rolId, prioridadRolId: rol.prioridadRolId };
  }

  /** Crea una tarea de producción en la cola de la persona (al final o, si `alFrente`, primera). */
  private async crearTareaTx(
    tx: Tx,
    t: { trabajoId: string; entregableId: string; actividadId: string; titulo: string; minutos: number; noAntesDe?: string; noAntesDeMinuto?: number; notas?: string | null },
    usuarioId: string | undefined,
    actor: ActorProduccion,
    alFrente = false,
  ): Promise<string> {
    const [actividad, equipo] = await Promise.all([
      tx.actividad.findFirst({ where: { id: t.actividadId, activa: true }, include: { participaciones: { include: { roles: { include: { rol: true } } } } } }),
      tx.trabajoEquipo.findMany({ where: { trabajoId: t.trabajoId, hasta: null } }),
    ]);
    if (!actividad || actividad.aplicaA === 'prospecto') throw errorCampo('actividadId', 'Esta actividad no aplica a trabajos');
    if (actividad.requiereHoraFija) throw errorCampo('actividadId', 'Las actividades con hora fija se programan desde la agenda');
    const r = await this.resolverResponsable(tx, actividad, equipo, usuarioId);
    const ordenCola = await this.posicionEnCola(tx, r.usuarioId, alFrente);
    const tarea = await tx.tarea.create({
      data: {
        actividadId: actividad.id,
        trabajoId: t.trabajoId,
        entregableId: t.entregableId,
        // La columna admite 150 caracteres y el título de un trabajo, hasta 300: se recorta con puntos suspensivos.
        titulo: t.titulo.length > 150 ? `${t.titulo.slice(0, 149)}…` : t.titulo,
        fecha: aFecha(t.noAntesDe ?? diaEnLima()),
        noAntesDeMinuto: t.noAntesDeMinuto ?? null,
        minutosEstimados: t.minutos,
        estado: 'pendiente',
        notas: t.notas ?? null,
        creadaPorId: actor.usuarioId,
        responsables: { create: { ...r, asignadoPorId: actor.usuarioId, ordenCola } },
      },
    });
    return tarea.id;
  }

  private async posicionEnCola(tx: Tx, usuarioId: string, alFrente: boolean): Promise<number> {
    const agg = await tx.tareaResponsable.aggregate({
      where: { usuarioId, ordenCola: { not: null }, tarea: { estado: { in: ['pendiente', 'en_proceso'] } } },
      _min: { ordenCola: true },
      _max: { ordenCola: true },
    });
    return alFrente ? (agg._min.ordenCola ?? 1) - 1 : (agg._max.ordenCola ?? 0) + 1;
  }

  async agregarTarea(entregableId: string, datos: TareaEntregableDatos, actor: ActorProduccion): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const e = await this.entregable(tx, entregableId);
      if (['cerrado'].includes(e.estado) || ['finalizado', 'cancelado'].includes(e.trabajo.estado)) throw new BadRequestException('El entregable ya está cerrado');
      if (e.trabajo.estado === 'suspendido') throw new BadRequestException('El trabajo está en espera del cliente: reanúdalo para programar tareas');
      if (datos.noAntesDe && datos.noAntesDe < diaEnLima()) throw errorCampo('noAntesDe', 'No puede ser un día pasado');
      await this.crearTareaTx(
        tx,
        { trabajoId: e.trabajoId, entregableId, actividadId: datos.actividadId, titulo: datos.titulo, minutos: datos.minutosEstimados, noAntesDe: datos.noAntesDe },
        datos.usuarioId,
        actor,
      );
      await this.evento(tx, e.trabajoId, `${e.nombre}: nueva tarea "${datos.titulo}"`, actor);
    });
  }

  /**
   * Al empezar o completar una tarea de un trabajo: el entregable y el trabajo pasan a "en proceso".
   * Si estaba en la cola, al completarse queda registrada en el día en que se hizo.
   */
  async alAvanzarTarea(tx: Tx, tareaId: string, completada: boolean): Promise<void> {
    const t = await tx.tarea.findUnique({ where: { id: tareaId }, include: { entregable: true, trabajo: true, responsables: true } });
    if (!t?.trabajoId) return;
    if (completada && t.responsables.some((r) => r.ordenCola !== null)) await tx.tarea.update({ where: { id: tareaId }, data: { fecha: aFecha(diaEnLima()) } });
    if (t.entregable && ['pendiente', 'observado', 'observado_cliente'].includes(t.entregable.estado)) {
      await tx.entregable.update({ where: { id: t.entregable.id }, data: { estado: 'en_proceso' } });
    }
    if (t.trabajo && ['sin_asignar', 'asignado'].includes(t.trabajo.estado)) {
      await tx.trabajo.update({ where: { id: t.trabajoId }, data: { estado: 'en_proceso', eventos: { create: { tipo: 'estado', detalle: 'El trabajo entró en producción' } } } });
    }
  }

  /** Si cambia el equipo, las tareas pendientes de quien sale pasan a quien entra en su función. */
  async transferirTareas(tx: Tx, trabajoId: string, deUsuarioId: string, aUsuarioId: string, actor: ActorProduccion): Promise<number> {
    const filas = await tx.tareaResponsable.findMany({
      // También las que están en pausa: al reanudar el trabajo vuelven a quien las tiene.
      where: { usuarioId: deUsuarioId, tarea: { trabajoId, estado: { in: ['pendiente', 'en_proceso', 'en_pausa'] } } },
      orderBy: { ordenCola: 'asc' },
    });
    for (const f of filas) {
      if (await tx.tareaResponsable.findUnique({ where: { tareaId_usuarioId: { tareaId: f.tareaId, usuarioId: aUsuarioId } } })) continue;
      const ordenCola = f.ordenCola === null ? null : await this.posicionEnCola(tx, aUsuarioId, false);
      await tx.tareaResponsable.update({ where: { id: f.id }, data: { usuarioId: aUsuarioId, ordenCola, asignadoPorId: actor.usuarioId, asignadoEn: new Date() } });
      await tx.tarea.updateMany({ where: { id: f.tareaId, estado: 'en_proceso' }, data: { estado: 'pendiente' } });
    }
    return filas.length;
  }

  // ─── Revisión y entrega ──────────────────────────────────

  async enviarRevision(entregableId: string, actor: ActorProduccion): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const e = await this.entregable(tx, entregableId);
      if (!['pendiente', 'en_proceso', 'observado', 'observado_cliente'].includes(e.estado)) throw new BadRequestException('Este entregable no está en elaboración');
      const pendientes = await tx.tarea.count({ where: { entregableId, estado: { in: [...ACTIVAS] } } });
      if (pendientes > 0) throw new BadRequestException(`Aún hay ${pendientes === 1 ? 'una tarea pendiente' : `${pendientes} tareas pendientes`} en este entregable`);
      const revision = await tx.actividad.findUnique({ where: { nombre: ACTIVIDAD.revision } });
      if (!revision) throw new BadRequestException('Falta la actividad "Revisión interna" en el catálogo');
      // Las revisiones van primero en la cola del jefe: no esperan detrás de su propia producción.
      await this.crearTareaTx(tx, { trabajoId: e.trabajoId, entregableId, actividadId: revision.id, titulo: `Revisión: ${e.nombre}`, minutos: revision.minutosEstimados }, undefined, actor, true);
      await tx.entregable.update({ where: { id: entregableId }, data: { estado: 'en_revision', turnitinConformeEn: null } });
      await this.evento(tx, e.trabajoId, `${e.nombre} enviado a revisión`, actor);
    });
    const e = await this.entregable(this.prisma, entregableId);
    await this.notificaciones.notificar(
      await this.responsablesDe(entregableId, 'revision'),
      { tipo: 'entregable.revision', titulo: `${e.nombre} espera tu revisión`, mensaje: e.trabajo.codigo, enlace: `/trabajos/${e.trabajoId}` },
      actor.usuarioId,
    );
  }

  /** Hizo (o registró tiempo en) alguna tarea de elaboración o corrección de este entregable. */
  private async elaboro(tx: Tx, entregableId: string, usuarioId: string): Promise<boolean> {
    const n = await tx.tarea.count({
      where: {
        entregableId,
        estado: { not: 'cancelada' },
        actividad: { tipo: { comportamiento: { in: ['produccion', 'correccion'] } } },
        OR: [{ responsables: { some: { usuarioId } } }, { tiempos: { some: { usuarioId } } }],
      },
    });
    return n > 0;
  }

  async revisar(entregableId: string, datos: RevisarEntregableDatos, actor: ActorProduccion): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const e = await this.entregable(tx, entregableId);
      if (e.estado !== 'en_revision') throw new BadRequestException('El entregable no está en revisión');
      if (await this.elaboro(tx, entregableId, actor.usuarioId)) {
        throw new ForbiddenException('No puedes revisar un entregable en cuya elaboración participaste. Pídele la revisión a otro jefe de producción o al administrador.');
      }
      const tareasRevision = await tx.tarea.findMany({ where: { entregableId, estado: { in: [...ACTIVAS] }, actividad: { tipo: { comportamiento: 'revision' } } } });
      const ahora = new Date();
      await tx.tarea.updateMany({
        where: { id: { in: tareasRevision.map((t) => t.id) } },
        data: { estado: 'completada', completadaEn: ahora, fecha: aFecha(diaEnLima()), resultado: datos.resultado === 'aprobado' ? 'Aprobado' : datos.observaciones },
      });
      await cerrarTramos(tx, { tareaId: { in: tareasRevision.map((t) => t.id) } }, ahora);
      await tx.revision.create({
        data: {
          entregableId,
          tareaId: tareasRevision[0]?.id ?? null,
          revisorId: actor.usuarioId,
          resultado: datos.resultado,
          observaciones: datos.observaciones ?? null,
          similitud: datos.similitud ?? null,
          ia: datos.ia ?? null,
        },
      });
      await tx.entregable.update({
        where: { id: entregableId },
        data: {
          estado: datos.resultado === 'aprobado' ? 'aprobado' : 'observado',
          ...(datos.similitud !== undefined && { similitud: datos.similitud }),
          ...(datos.ia !== undefined && { ia: datos.ia }),
        },
      });
      if (datos.resultado === 'observado') {
        await this.crearCorreccion(tx, e.trabajoId, entregableId, `Corregir observaciones: ${e.nombre}`, datos.observaciones!, datos.minutosCorreccion, actor);
      }
      await this.evento(tx, e.trabajoId, `${e.nombre}: ${datos.resultado === 'aprobado' ? 'aprobado en la revisión interna' : 'observado en la revisión interna'}`, actor);
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'revisar', entidad: 'entregable', entidadId: entregableId, despues: datos, ip: actor.ip }, tx);
    });
    const e = await this.entregable(this.prisma, entregableId);
    if (datos.resultado === 'observado') {
      await this.notificaciones.notificar(
        await this.responsablesDe(entregableId, 'correccion'),
        { tipo: 'entregable.observado', titulo: `Observaron ${e.nombre} (${e.trabajo.codigo})`, mensaje: datos.observaciones ?? null, enlace: '/tareas?vista=cola' },
        actor.usuarioId,
      );
    } else {
      // Quien sigue el prospecto de origen es quien lo entrega al cliente.
      const prospecto = await this.prisma.prospecto.findFirst({ where: { trabajo: { id: e.trabajoId } }, select: { responsableId: true } });
      if (await this.turnitinObligatorio()) {
        const responsables = await this.notificaciones.conPermiso('entregables.turnitin');
        await this.notificaciones.notificar(responsables, { tipo: 'entregable.turnitin', titulo: `${e.nombre} aprobado: pasa por Turnitin (${e.trabajo.codigo})`, mensaje: null, enlace: `/trabajos/${e.trabajoId}` }, actor.usuarioId);
      } else {
        await this.avisarEquipo(e.trabajoId, ['auxiliar_principal'], 'entregable.aprobado', (codigo) => `${e.nombre} aprobado: listo para enviar (${codigo})`, null, actor, undefined, [prospecto?.responsableId]);
      }
    }
  }

  /** La corrección va primero en la cola del auxiliar principal. */
  private async crearCorreccion(tx: Tx, trabajoId: string, entregableId: string, titulo: string, observaciones: string, minutos: number | undefined, actor: ActorProduccion) {
    const correccion = await tx.actividad.findUnique({ where: { nombre: ACTIVIDAD.correccion } });
    if (!correccion) throw new BadRequestException('Falta la actividad "Corrección de observaciones" en el catálogo');
    await this.crearTareaTx(
      tx,
      { trabajoId, entregableId, actividadId: correccion.id, titulo, minutos: minutos ?? correccion.minutosEstimados, notas: observaciones },
      undefined,
      actor,
      true,
    );
  }

  // ─── Turnitin ────────────────────────────────────────────

  private async turnitinObligatorio() {
    return (await this.parametros.numero('turnitin.obligatorio')) === 1;
  }

  async configTurnitin(): Promise<TurnitinConfig> {
    const [obligatorio, sim, ia] = await Promise.all([this.turnitinObligatorio(), this.parametros.numero('turnitin.similitud_max'), this.parametros.numero('turnitin.ia_max')]);
    return { obligatorio, similitudMax: sim >= 100 ? null : sim, iaMax: ia >= 100 ? null : ia };
  }

  /** El entregable aprobado sale a Turnitin. */
  async enviarTurnitin(entregableId: string, actor: ActorProduccion): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const e = await this.entregable(tx, entregableId);
      if (e.estado !== 'aprobado') throw new BadRequestException('Solo se envía a Turnitin un entregable aprobado en la revisión interna');
      await tx.turnitinRegistro.create({ data: { entregableId, enviadoPorId: actor.usuarioId } });
      await tx.entregable.update({ where: { id: entregableId }, data: { estado: 'en_turnitin' } });
      await this.evento(tx, e.trabajoId, `${e.nombre} enviado a Turnitin`, actor);
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'enviar_turnitin', entidad: 'entregable', entidadId: entregableId, ip: actor.ip }, tx);
    });
  }

  /** Registra el resultado: dentro de los límites queda listo para entregar; si no, vuelve a corrección. */
  async resultadoTurnitin(entregableId: string, datos: ResultadoTurnitinDatos, actor: ActorProduccion): Promise<void> {
    const config = await this.configTurnitin();
    const excede: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      const e = await this.entregable(tx, entregableId);
      if (e.estado !== 'en_turnitin') throw new BadRequestException('El entregable no está en Turnitin');
      const abierto = await tx.turnitinRegistro.findFirst({ where: { entregableId, resultado: null }, orderBy: { enviadoEn: 'desc' } });
      if (!abierto) throw new BadRequestException('No hay un envío a Turnitin pendiente de resultado');
      if (config.similitudMax !== null && datos.similitud > config.similitudMax) excede.push(`similitud ${datos.similitud} % (máximo ${config.similitudMax} %)`);
      if (config.iaMax !== null && datos.ia !== undefined && datos.ia > config.iaMax) excede.push(`detección de IA ${datos.ia} % (máximo ${config.iaMax} %)`);
      const conforme = excede.length === 0;
      await tx.turnitinRegistro.update({
        where: { id: abierto.id },
        data: { resultado: conforme ? 'conforme' : 'excede', similitud: datos.similitud, ia: datos.ia ?? null, observaciones: datos.observaciones ?? null, registradoPorId: actor.usuarioId, registradoEn: new Date() },
      });
      await tx.entregable.update({
        where: { id: entregableId },
        data: { estado: conforme ? 'aprobado' : 'observado', similitud: datos.similitud, ...(datos.ia !== undefined && { ia: datos.ia }), turnitinConformeEn: conforme ? new Date() : null },
      });
      if (!conforme) {
        await this.crearCorreccion(tx, e.trabajoId, entregableId, `Corregir por Turnitin: ${e.nombre}`, `Turnitin: ${excede.join('; ')}.${datos.observaciones ? ` ${datos.observaciones}` : ''}`, undefined, actor);
      }
      await this.evento(tx, e.trabajoId, conforme ? `${e.nombre}: Turnitin conforme (similitud ${datos.similitud} %)` : `${e.nombre}: Turnitin fuera de los límites (${excede.join('; ')})`, actor);
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'resultado_turnitin', entidad: 'entregable', entidadId: entregableId, despues: { ...datos, conforme }, ip: actor.ip }, tx);
    });
    const e = await this.entregable(this.prisma, entregableId);
    if (excede.length > 0) {
      await this.notificaciones.notificar(
        await this.responsablesDe(entregableId, 'correccion'),
        { tipo: 'entregable.observado', titulo: `Turnitin observó ${e.nombre} (${e.trabajo.codigo})`, mensaje: excede.join('; '), enlace: '/tareas?vista=cola' },
        actor.usuarioId,
      );
    } else {
      const prospecto = await this.prisma.prospecto.findFirst({ where: { trabajo: { id: e.trabajoId } }, select: { responsableId: true } });
      await this.avisarEquipo(e.trabajoId, ['auxiliar_principal'], 'entregable.aprobado', (codigo) => `${e.nombre} pasó Turnitin: listo para enviar (${codigo})`, null, actor, undefined, [prospecto?.responsableId]);
    }
  }

  /** Un permiso mayor permite saltarse el Turnitin con un motivo (queda registrado). */
  async omitirTurnitin(entregableId: string, datos: OmitirTurnitinDatos, actor: ActorProduccion): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const e = await this.entregable(tx, entregableId);
      if (e.estado !== 'aprobado' && e.estado !== 'en_turnitin') throw new BadRequestException('Solo se omite el Turnitin de un entregable aprobado');
      const abierto = await tx.turnitinRegistro.findFirst({ where: { entregableId, resultado: null }, orderBy: { enviadoEn: 'desc' } });
      const registro = { resultado: 'omitido' as const, observaciones: datos.motivo, registradoPorId: actor.usuarioId, registradoEn: new Date() };
      if (abierto) await tx.turnitinRegistro.update({ where: { id: abierto.id }, data: registro });
      else await tx.turnitinRegistro.create({ data: { entregableId, enviadoPorId: actor.usuarioId, ...registro } });
      await tx.entregable.update({ where: { id: entregableId }, data: { estado: 'aprobado', turnitinConformeEn: new Date() } });
      await this.evento(tx, e.trabajoId, `${e.nombre}: se omitió el Turnitin (${datos.motivo})`, actor);
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'omitir_turnitin', entidad: 'entregable', entidadId: entregableId, despues: datos, ip: actor.ip }, tx);
    });
  }

  async entregar(entregableId: string, datos: EntregarDatos, actor: ActorProduccion): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const e = await this.entregable(tx, entregableId);
      if (e.estado === 'en_turnitin') throw new BadRequestException('El entregable está en Turnitin: registra su resultado antes de entregarlo');
      if (e.estado !== 'aprobado') throw new BadRequestException('Solo se entregan al cliente los entregables aprobados en la revisión interna');
      if ((await this.turnitinObligatorio()) && !e.turnitinConformeEn) throw new BadRequestException('Antes de entregarlo, el entregable debe pasar por Turnitin (o se omite con un motivo)');
      await tx.entregaCliente.create({ data: { entregableId, enviadoPorId: actor.usuarioId, canal: datos.canal, notas: datos.notas ?? null } });
      await tx.entregable.update({ where: { id: entregableId }, data: { estado: 'entregado' } });
      await this.evento(tx, e.trabajoId, `${e.nombre} entregado al cliente (${NOMBRE_CANAL_ENTREGA[datos.canal]})`, actor);
    });
  }

  async respuestaCliente(entregableId: string, datos: RespuestaClienteDatos, actor: ActorProduccion): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const e = await this.entregable(tx, entregableId);
      if (e.estado !== 'entregado') throw new BadRequestException('El entregable no está en manos del cliente');
      const entrega = await tx.entregaCliente.findFirst({ where: { entregableId }, orderBy: { fecha: 'desc' } });
      if (entrega) {
        await tx.entregaCliente.update({
          where: { id: entrega.id },
          data: { respuesta: datos.conforme ? 'conforme' : 'observado', observacionesCliente: datos.observaciones ?? null, respondidoEn: new Date() },
        });
      }
      await tx.entregable.update({ where: { id: entregableId }, data: { estado: datos.conforme ? 'cerrado' : 'observado_cliente' } });
      if (!datos.conforme) {
        await this.crearCorreccion(tx, e.trabajoId, entregableId, `Corregir observaciones del cliente: ${e.nombre}`, datos.observaciones!, datos.minutosCorreccion, actor);
      }
      await this.evento(tx, e.trabajoId, `${e.nombre}: ${datos.conforme ? 'el cliente dio su conformidad' : 'el cliente dejó observaciones'}`, actor);

      // Cerrado el entregable final (y todos los demás), el trabajo termina.
      if (datos.conforme) {
        const abiertos = await tx.entregable.count({ where: { trabajoId: e.trabajoId, estado: { not: 'cerrado' } } });
        const final = await tx.entregable.count({ where: { trabajoId: e.trabajoId, esFinal: true, estado: 'cerrado' } });
        if (abiertos === 0 && final > 0) {
          await tx.trabajo.update({ where: { id: e.trabajoId }, data: { estado: 'finalizado' } });
          await this.evento(tx, e.trabajoId, 'Trabajo finalizado: todos los entregables están cerrados', actor, 'estado');
        }
      }
    });
    if (!datos.conforme) {
      const e = await this.entregable(this.prisma, entregableId);
      await this.notificaciones.notificar(
        await this.responsablesDe(entregableId, 'correccion'),
        { tipo: 'entregable.observado_cliente', titulo: `El cliente observó ${e.nombre} (${e.trabajo.codigo})`, mensaje: datos.observaciones ?? null, enlace: '/tareas?vista=cola' },
        actor.usuarioId,
      );
    }
  }

  private evento(tx: Tx, trabajoId: string, detalle: string, actor: ActorProduccion, tipo: 'entregable' | 'estado' = 'entregable') {
    return tx.trabajoEvento.create({ data: { trabajoId, tipo, detalle, usuarioId: actor.usuarioId } });
  }

  // ─── Bandeja de entregables ──────────────────────────────

  async bandeja(vista: VistaBandeja, filtroTrabajos: Prisma.TrabajoWhereInput): Promise<BandejaEntregable[]> {
    const estados: Record<VistaBandeja, Prisma.EntregableWhereInput['estado']> = {
      revision: 'en_revision',
      por_entregar: { in: ['aprobado', 'en_turnitin'] },
      con_cliente: { in: ['entregado', 'observado_cliente'] },
      activos: { not: 'cerrado' },
    };
    const filas = await this.prisma.entregable.findMany({
      where: { estado: estados[vista], trabajo: { eliminadoEn: null, estado: { notIn: ['cancelado'] }, ...filtroTrabajos } },
      orderBy: [{ fechaLimite: 'asc' }, { orden: 'asc' }],
      take: 200,
      include: {
        ...INCLUIR_ENTREGABLE,
        trabajo: {
          select: {
            id: true,
            codigo: true,
            titulo: true,
            prioridad: { select: { nombre: true, color: true } },
            equipo: { where: { hasta: null }, include: { usuario: { select: CAMPOS_USUARIO } } },
          },
        },
      },
    });
    const responsables = [...new Set(filas.flatMap((e) => e.tareas.flatMap((t) => t.responsables.map((r) => r.usuarioId))))];
    const colas = await this.agenda.colas(responsables);
    return filas.map((e) => {
      const item = this.aEntregable(e, colas);
      const funcion = (f: string) => e.trabajo.equipo.find((m) => m.funcion === f)?.usuario ?? null;
      return {
        id: e.id,
        nombre: e.nombre,
        esFinal: e.esFinal,
        fechaLimite: item.fechaLimite,
        estado: e.estado,
        trabajo: { id: e.trabajo.id, codigo: e.trabajo.codigo, titulo: e.trabajo.titulo, prioridad: e.trabajo.prioridad },
        auxiliarPrincipal: funcion('auxiliar_principal'),
        jefeResponsable: funcion('jefe_responsable'),
        ultimaRevision: item.revisiones[0] ?? null,
        ultimaEntrega: item.entregas[0] ?? null,
        finPlan: item.finPlan,
        semaforo: item.semaforo,
      };
    });
  }

  // ─── Colas de trabajo ────────────────────────────────────

  /** Colas del personal de producción (auxiliares y jefes), o de una persona. */
  async colasDePersonal(usuarioId?: string): Promise<ColaPersona[]> {
    const usuarios = await this.prisma.usuario.findMany({
      where: usuarioId
        ? { id: usuarioId }
        : { activo: true, eliminadoEn: null, roles: { some: { rol: { activo: true, codigo: { in: [ROLES_BASE.AUXILIAR, ROLES_BASE.JEFE_PROD] } } } } },
      orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }],
      select: { ...CAMPOS_USUARIO, roles: { select: { rol: { select: { nombre: true } } } } },
    });
    const colas = await this.agenda.colas(usuarios.map((u) => u.id));
    return usuarios.map((u) => {
      const cola = colas.get(u.id);
      const items: ColaItem[] = (cola?.items ?? []).map(({ tarea: t }, i) => {
        const plan = cola!.planes.get(t.id);
        const fechaLimite = soloFecha(t.entregable?.fechaLimite ?? t.trabajo!.fechaLimite);
        const h = holgura(plan?.fin?.fecha ?? null, fechaLimite);
        return {
          tareaId: t.id,
          orden: i + 1,
          titulo: t.titulo,
          actividad: { nombre: t.actividad.nombre, comportamiento: t.actividad.tipo.comportamiento, color: t.actividad.tipo.color },
          estado: t.estado,
          minutos: t.minutosEstimados,
          minutosReales: minutosReales(t.tiempos.filter((x) => x.fin)),
          enCursoDesde: t.tiempos.find((x) => !x.fin && x.usuarioId === u.id)?.inicio.toISOString() ?? null,
          trabajo: { id: t.trabajo!.id, codigo: t.trabajo!.codigo, titulo: t.trabajo!.titulo, prioridad: { nombre: t.trabajo!.prioridad.nombre, color: t.trabajo!.prioridad.color }, fechasFijas: t.trabajo!.fechasFijas },
          entregable: t.entregable ? { id: t.entregable.id, nombre: t.entregable.nombre } : null,
          fechaLimite,
          noAntesDe: soloFecha(t.fecha),
          plan: aPlan(plan),
          holguraDias: h.dias,
          semaforo: h.semaforo,
        };
      });
      const fin = items.map((i) => i.plan?.fin).filter((f): f is string => Boolean(f));
      return {
        usuario: { id: u.id, nombres: u.nombres, apellidos: u.apellidos },
        roles: u.roles.map((r) => r.rol.nombre),
        items,
        minutosPendientes: items.reduce((s, i) => s + i.minutos, 0),
        finCola: items.some((i) => !i.plan) ? null : (fin.sort().at(-1) ?? null),
        enRojo: items.filter((i) => i.semaforo === 'rojo' || i.semaforo === 'sin_plan').length,
      };
    });
  }

  /** Nuevo orden de la cola: deben venir exactamente las tareas que hoy están en ella. */
  async reordenar(usuarioId: string, tareaIds: string[], actor: ActorProduccion, opciones: { sugerido?: boolean } = {}): Promise<void> {
    const actuales = await this.prisma.tareaResponsable.findMany({
      where: { usuarioId, ordenCola: { not: null }, tarea: { estado: { in: ['pendiente', 'en_proceso'] }, inicio: null } },
      select: { id: true, tareaId: true, ordenCola: true },
    });
    const porTarea = new Map(actuales.map((a) => [a.tareaId, a.id]));
    if (tareaIds.length !== actuales.length || new Set(tareaIds).size !== tareaIds.length || tareaIds.some((id) => !porTarea.has(id))) {
      throw new ConflictException('La cola cambió mientras la ordenabas: vuelve a cargarla');
    }
    if (!opciones.sugerido) await this.verificarOrdenConFechasFijas(actuales, tareaIds);
    await this.prisma.$transaction(async (tx) => {
      for (const [i, tareaId] of tareaIds.entries()) await tx.tareaResponsable.update({ where: { id: porTarea.get(tareaId)! }, data: { ordenCola: i + 1 } });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'ordenar_cola', entidad: 'usuario', entidadId: usuarioId, despues: { tareaIds }, ip: actor.ip }, tx);
    });
  }

  /** Las tareas de un trabajo con fechas fijas no se pueden dejar detrás de otras que antes iban después de ellas. */
  private async verificarOrdenConFechasFijas(actuales: { tareaId: string; ordenCola: number | null }[], nuevoOrden: string[]) {
    const fijas = await this.prisma.tarea.findMany({
      where: { id: { in: nuevoOrden }, trabajo: { fechasFijas: true } },
      select: { id: true, trabajo: { select: { codigo: true, fechasFijasMotivo: true } } },
    });
    if (fijas.length === 0) return;
    const antes = new Map([...actuales].sort((a, b) => (a.ordenCola ?? 0) - (b.ordenCola ?? 0)).map((a, i) => [a.tareaId, i]));
    const ahora = new Map(nuevoOrden.map((id, i) => [id, i]));
    const esFija = new Set(fijas.map((f) => f.id));
    for (const f of fijas) {
      const atrasada = nuevoOrden.some((n) => !esFija.has(n) && antes.get(f.id)! < antes.get(n)! && ahora.get(f.id)! > ahora.get(n)!);
      if (atrasada && f.trabajo) throw errorFechasFijas(f.trabajo);
    }
  }

  /** Orden sugerido: lo que está en proceso primero; luego por prioridad del trabajo y fecha límite. */
  async ordenSugerido(usuarioId: string, actor: ActorProduccion): Promise<void> {
    const [cola] = await this.colasDePersonal(usuarioId);
    const niveles = new Map(
      (await this.prisma.prioridadTrabajo.findMany({ select: { nombre: true, nivel: true } })).map((p) => [p.nombre, p.nivel]),
    );
    const ordenados = [...(cola?.items ?? [])].sort(
      (a, b) =>
        Number(b.estado === 'en_proceso') - Number(a.estado === 'en_proceso') ||
        Number(b.trabajo.fechasFijas) - Number(a.trabajo.fechasFijas) ||
        (niveles.get(a.trabajo.prioridad.nombre) ?? 99) - (niveles.get(b.trabajo.prioridad.nombre) ?? 99) ||
        a.fechaLimite.localeCompare(b.fechaLimite) ||
        a.orden - b.orden,
    );
    if (ordenados.length) await this.reordenar(usuarioId, ordenados.map((i) => i.tareaId), actor, { sugerido: true });
  }
}
