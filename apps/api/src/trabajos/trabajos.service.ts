import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  aCentimos,
  deCentimos,
  diaEnLima,
  formatearSoles,
  NOMBRE_FUNCION_EQUIPO,
  NOMBRE_METODO_PAGO,
  ROLES_BASE,
  sumarDias,
  type ArmarEquipoDatos,
  type ConvertirProspectoDatos,
  type ListarTrabajosConsulta,
  type Paginado,
  type PagoDatos,
  type ResumenCobranza,
  type TrabajoDetalle,
  type TrabajoListadoItem,
  type UsuarioResumen,
} from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import { contieneDigitos, contieneTodas, digitosDe, MAX_COINCIDENCIAS, palabrasDe } from '../common/busqueda.js';
import { siguienteCodigo } from '../common/correlativo.js';
import { Prisma } from '../generated/prisma/client.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PersonasService } from '../personas/personas.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { ProduccionService } from '../produccion/produccion.service.js';
import { repartirPago } from './cuenta.js';
import { aCalculo, aDetalle, aListado, INCLUIR_DETALLE, INCLUIR_LISTADO } from './mapeo.js';

export interface ActorTrabajo {
  usuarioId: string;
  ip: string | null;
}

const errorCampo = (campo: string, mensaje: string) => new BadRequestException({ message: 'Datos inválidos', errores: [{ campo, mensaje }] });
const dia = (fecha: string) => new Date(`${fecha}T00:00:00Z`);
const nombre = (u: { nombres: string; apellidos: string }) => `${u.nombres} ${u.apellidos}`;

@Injectable()
export class TrabajosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
    private readonly personas: PersonasService,
    private readonly auditoria: AuditoriaService,
    private readonly produccion: ProduccionService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // ─── Acceso ──────────────────────────────────────────────

  /**
   * Alcance de "trabajos.ver": todos; "equipo" = donde está en el equipo vigente;
   * "propios" = además, los que vienen de sus prospectos.
   */
  async filtroVisibles(usuarioId: string): Promise<Prisma.TrabajoWhereInput> {
    const alcance = (await this.permisos.efectivos(usuarioId))['trabajos.ver'];
    if (alcance === 'todos') return {};
    const enEquipo: Prisma.TrabajoWhereInput = { equipo: { some: { usuarioId, hasta: null } } };
    return alcance === 'propios' ? { OR: [enEquipo, { prospecto: { responsableId: usuarioId } }] } : enEquipo;
  }

  /** 404 si el trabajo no existe o el usuario no lo puede ver. */
  async verificarVisible(trabajoId: string, usuarioId: string): Promise<void> {
    const visible = await this.prisma.trabajo.count({ where: { id: trabajoId, eliminadoEn: null, ...(await this.filtroVisibles(usuarioId)) } });
    if (!visible) throw new NotFoundException('Trabajo no encontrado');
  }

  private async permisosDeMontos(usuarioId: string) {
    const efectivos = await this.permisos.efectivos(usuarioId);
    return { verContrato: 'contratos.ver' in efectivos, verMontos: 'contratos.ver_montos' in efectivos };
  }

  // ─── Conversión ──────────────────────────────────────────

  /** Convierte el prospecto en cliente: crea el trabajo, sus integrantes, el contrato con cuotas y (opcional) el primer pago. */
  async convertir(prospectoId: string, datos: ConvertirProspectoDatos, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    const efectivos = await this.permisos.efectivos(actor.usuarioId);
    const alcance = efectivos['prospectos.ver'];
    const prospecto = await this.prisma.prospecto.findFirst({
      where: { id: prospectoId, eliminadoEn: null, ...(alcance !== 'todos' && { responsableId: actor.usuarioId }) },
      include: { etapa: true, tipoTrabajo: true, contactos: { include: { persona: true } }, trabajo: { select: { codigo: true } } },
    });
    if (!prospecto) throw new NotFoundException('Prospecto no encontrado');
    if (prospecto.trabajo) throw new ConflictException(`Este prospecto ya se convirtió en el trabajo ${prospecto.trabajo.codigo}`);
    if (prospecto.etapa.clase !== 'abierta') throw new BadRequestException('Solo se convierten prospectos abiertos (reactívalo si estaba perdido)');
    if (!('contratos.crear' in efectivos)) throw new ForbiddenException('No tienes permiso para registrar contratos');
    if (datos.pagoInicial && !('contratos.registrar_pago' in efectivos)) throw new ForbiddenException('No tienes permiso para registrar pagos');

    const contactos = new Map(prospecto.contactos.map((c) => [c.personaId, c.persona]));
    datos.integrantes.forEach((i, n) => {
      if (!contactos.has(i.personaId)) throw errorCampo(`integrantes.${n}.personaId`, 'Solo pueden ser integrantes los contactos del prospecto');
    });
    if (datos.integrantes.length > prospecto.tipoTrabajo.maxIntegrantes) {
      throw errorCampo('integrantes', `${prospecto.tipoTrabajo.nombre} admite hasta ${prospecto.tipoTrabajo.maxIntegrantes} integrante(s)`);
    }
    const ganada = await this.prisma.etapaProspecto.findFirst({ where: { clase: 'ganada', activa: true } });
    if (!ganada) throw new BadRequestException('No hay una etapa "Convertido" configurada en el embudo');

    const id = await this.prisma.$transaction(async (tx) => {
      // Los datos completos de cada integrante actualizan su ficha de persona.
      for (const i of datos.integrantes) {
        await this.personas.resolver(
          tx,
          {
            celular: contactos.get(i.personaId)!.celular,
            nombres: i.nombres,
            apellidos: i.apellidos,
            email: i.email,
            tipoDocumento: i.tipoDocumento,
            numeroDocumento: i.numeroDocumento,
            esPrincipal: i.esTitular,
          },
          actor.usuarioId,
        );
      }

      const codigo = await siguienteCodigo(tx, 'T');
      const trabajo = await tx.trabajo.create({
        data: {
          codigo,
          prospectoId,
          tipoTrabajoId: prospecto.tipoTrabajoId,
          titulo: datos.trabajo.titulo ?? prospecto.titulo,
          prioridadId: prospecto.prioridadId,
          universidadId: prospecto.universidadId,
          carreraId: prospecto.carreraId,
          nivelAcademicoId: prospecto.nivelAcademicoId,
          linkDrive: prospecto.linkDrive,
          observaciones: prospecto.observaciones,
          detalles: prospecto.detalles,
          fechaInicio: dia(datos.trabajo.fechaInicio),
          fechaLimite: dia(datos.trabajo.fechaLimite),
          creadoPor: actor.usuarioId,
          integrantes: { create: datos.integrantes.map((i, orden) => ({ personaId: i.personaId, esTitular: i.esTitular, orden })) },
          contrato: {
            create: {
              fechaFirma: dia(datos.contrato.fechaFirma),
              montoTotal: datos.contrato.montoTotal,
              formaPago: datos.contrato.formaPago,
              diasGarantia: prospecto.tipoTrabajo.diasGarantia,
              observaciones: datos.contrato.observaciones ?? null,
              creadoPor: actor.usuarioId,
              cuotas: { create: datos.contrato.cuotas.map((c, i) => ({ numero: i + 1, monto: c.monto, vencimiento: dia(c.vencimiento) })) },
            },
          },
          eventos: {
            create: [
              { tipo: 'creado', detalle: `Trabajo creado desde el prospecto ${prospecto.codigo}`, usuarioId: actor.usuarioId },
              {
                tipo: 'contrato',
                detalle: `Contrato firmado por ${formatearSoles(datos.contrato.montoTotal)} (${datos.contrato.formaPago === 'contado' ? 'al contado' : `${datos.contrato.cuotas.length} cuotas`})`,
                usuarioId: actor.usuarioId,
              },
            ],
          },
        },
        include: { contrato: { select: { id: true } } },
      });

      if (datos.pagoInicial) await this.registrarPagoTx(tx, trabajo.contrato!.id, datos.pagoInicial, actor);

      // El prospecto pasa a "Convertido" y sus actividades comerciales pendientes ya no aplican.
      await tx.tarea.updateMany({
        where: { prospectoId, estado: { in: ['por_asignar', 'pendiente', 'en_proceso'] } },
        data: { estado: 'cancelada', motivoCancelacion: `Convertido en cliente (${codigo})` },
      });
      await tx.prospecto.update({
        where: { id: prospectoId },
        data: {
          etapaId: ganada.id,
          actualizadoPor: actor.usuarioId,
          eventos: {
            create: {
              tipo: 'cambio_etapa',
              detalle: `Convertido en cliente: trabajo ${codigo}`,
              datos: { desde: prospecto.etapaId, hacia: ganada.id, trabajoId: trabajo.id },
              usuarioId: actor.usuarioId,
            },
          },
        },
      });

      await this.auditoria.registrar(
        { usuarioId: actor.usuarioId, accion: 'convertir', entidad: 'prospecto', entidadId: prospectoId, despues: { ...datos, codigoTrabajo: codigo }, ip: actor.ip },
        tx,
      );
      return trabajo.id;
    });

    const nuevo = await this.prisma.trabajo.findUniqueOrThrow({ where: { id }, select: { codigo: true, titulo: true, tipoTrabajo: { select: { nombre: true } } } });
    await this.notificaciones.notificar(
      await this.notificaciones.conPermiso('trabajos.armar_equipo'),
      { tipo: 'trabajo.nuevo', titulo: `Nuevo trabajo por asignar: ${nuevo.codigo}`, mensaje: [nuevo.tipoTrabajo.nombre, nuevo.titulo].filter(Boolean).join(' · '), enlace: `/trabajos/${id}` },
      actor.usuarioId,
    );
    return this.obtener(id, actor.usuarioId);
  }

  // ─── Consultas ───────────────────────────────────────────

  async listar(filtros: ListarTrabajosConsulta, usuarioId: string): Promise<Paginado<TrabajoListadoItem>> {
    const { q, estado, pagina, porPagina } = filtros;
    const where: Prisma.TrabajoWhereInput = {
      eliminadoEn: null,
      ...(await this.filtroVisibles(usuarioId)),
      ...(estado && { estado }),
      ...(q && { id: { in: await this.idsQueCoinciden(q) } }),
    };
    const [{ verMontos }, total, filas] = await Promise.all([
      this.permisosDeMontos(usuarioId),
      this.prisma.trabajo.count({ where }),
      this.prisma.trabajo.findMany({
        where,
        include: INCLUIR_LISTADO,
        orderBy: [{ fechaLimite: 'asc' }, { creadoEn: 'desc' }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);
    const hoy = diaEnLima();
    return { datos: filas.map((t) => aListado(t, verMontos, hoy)), total, pagina, porPagina };
  }

  /** Código, título o nombre/celular/documento de un integrante (sin distinguir tildes). */
  private async idsQueCoinciden(q: string): Promise<string[]> {
    const palabras = palabrasDe(q);
    const digitos = digitosDe(q);
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT t.id FROM trabajo t
      WHERE t.eliminado_en IS NULL AND (
        ${contieneTodas([Prisma.sql`t.codigo`, Prisma.sql`t.titulo`], palabras)}
        OR EXISTS (
          SELECT 1 FROM trabajo_integrante ti JOIN persona pe ON pe.id = ti.persona_id
          WHERE ti.trabajo_id = t.id AND (
            ${contieneTodas([Prisma.sql`pe.nombres`, Prisma.sql`pe.apellidos`], palabras)}
            OR ${contieneDigitos(Prisma.sql`pe.celular`, digitos)}
            OR ${contieneDigitos(Prisma.sql`pe.numero_documento`, digitos)}
          )
        )
      )
      LIMIT ${MAX_COINCIDENCIAS}`;
    return filas.map((f) => f.id);
  }

  async obtener(id: string, usuarioId: string): Promise<TrabajoDetalle> {
    const trabajo = await this.prisma.trabajo.findFirst({
      where: { id, eliminadoEn: null, ...(await this.filtroVisibles(usuarioId)) },
      include: INCLUIR_DETALLE,
    });
    if (!trabajo) throw new NotFoundException('Trabajo no encontrado');
    const [permisos, dioElEnfoque, entregables, hayPlantilla] = await Promise.all([
      this.permisosDeMontos(usuarioId),
      this.dioElEnfoque(trabajo.prospectoId),
      this.produccion.deTrabajo(id),
      this.produccion.hayPlantilla(trabajo.tipoTrabajoId),
    ]);
    return { ...aDetalle(trabajo, permisos, diaEnLima(), dioElEnfoque), entregables, hayPlantilla };
  }

  /** Responsable principal de la última actividad coordinada completada del prospecto (el enfoque). */
  private async dioElEnfoque(prospectoId: string): Promise<TrabajoDetalle['dioElEnfoque']> {
    const tarea = await this.prisma.tarea.findFirst({
      where: { prospectoId, estado: 'completada', actividad: { modoAsignacion: 'coordinada', tipo: { comportamiento: 'reunion' } } },
      orderBy: { completadaEn: 'desc' },
      select: {
        responsables: {
          where: { participacion: { obligatoria: true } },
          take: 1,
          select: { usuario: { select: { id: true, nombres: true, apellidos: true } }, rol: { select: { codigo: true } } },
        },
      },
    });
    const r = tarea?.responsables[0];
    return r ? { usuario: r.usuario, rol: r.rol.codigo } : null;
  }

  // ─── Equipo ──────────────────────────────────────────────

  /** Personas que pueden integrar el equipo: auxiliares y jefes de producción activos. */
  async candidatosEquipo(): Promise<{ auxiliares: UsuarioResumen[]; jefes: UsuarioResumen[] }> {
    const conRol = (codigo: string) =>
      this.prisma.usuario.findMany({
        where: { activo: true, eliminadoEn: null, roles: { some: { rol: { codigo, activo: true } } } },
        select: { id: true, nombres: true, apellidos: true },
        orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
      });
    const [auxiliares, jefes] = await Promise.all([conRol(ROLES_BASE.AUXILIAR), conRol(ROLES_BASE.JEFE_PROD)]);
    return { auxiliares, jefes };
  }

  /** Arma o cambia el equipo: cierra las asignaciones anteriores y abre las nuevas (queda el historial). */
  async armarEquipo(trabajoId: string, datos: ArmarEquipoDatos, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    const trabajo = await this.prisma.trabajo.findFirst({
      where: { id: trabajoId, eliminadoEn: null },
      include: { equipo: { where: { hasta: null } } },
    });
    if (!trabajo) throw new NotFoundException('Trabajo no encontrado');
    if (['finalizado', 'cancelado'].includes(trabajo.estado)) throw new BadRequestException('El trabajo ya está cerrado');

    const { auxiliares, jefes } = await this.candidatosEquipo();
    const esAux = (id: string) => auxiliares.some((u) => u.id === id);
    if (!esAux(datos.auxiliarPrincipalId)) throw errorCampo('auxiliarPrincipalId', 'Debe ser un auxiliar de producción activo');
    if (!jefes.some((u) => u.id === datos.jefeResponsableId)) throw errorCampo('jefeResponsableId', 'Debe ser un jefe de producción activo');
    datos.auxiliaresApoyo.forEach((id, i) => {
      if (!esAux(id)) throw errorCampo(`auxiliaresApoyo.${i}`, 'Debe ser un auxiliar de producción activo');
    });

    const nuevo = [
      { usuarioId: datos.auxiliarPrincipalId, funcion: 'auxiliar_principal' as const },
      ...[...new Set(datos.auxiliaresApoyo)].map((usuarioId) => ({ usuarioId, funcion: 'auxiliar_apoyo' as const })),
      { usuarioId: datos.jefeResponsableId, funcion: 'jefe_responsable' as const },
    ];
    const clave = (e: { usuarioId: string; funcion: string }) => `${e.usuarioId}:${e.funcion}`;
    const actuales = new Set(trabajo.equipo.map(clave));
    const nuevos = new Set(nuevo.map(clave));
    const salen = trabajo.equipo.filter((e) => !nuevos.has(clave(e)));
    const entran = nuevo.filter((e) => !actuales.has(clave(e)));
    if (salen.length === 0 && entran.length === 0) return this.obtener(trabajoId, actor.usuarioId);

    const usuarios = [...auxiliares, ...jefes];
    const describir = (e: { usuarioId: string; funcion: keyof typeof NOMBRE_FUNCION_EQUIPO }) =>
      `${nombre(usuarios.find((u) => u.id === e.usuarioId) ?? { nombres: '¿?', apellidos: '' })} (${NOMBRE_FUNCION_EQUIPO[e.funcion].toLowerCase()})`;

    await this.prisma.$transaction(async (tx) => {
      const ahora = new Date();
      if (salen.length) await tx.trabajoEquipo.updateMany({ where: { id: { in: salen.map((e) => e.id) } }, data: { hasta: ahora } });
      if (entran.length) {
        await tx.trabajoEquipo.createMany({
          data: entran.map((e) => ({ ...e, trabajoId, desde: ahora, asignadoPorId: actor.usuarioId, motivo: datos.motivo ?? null })),
        });
      }
      // Las tareas pendientes de quien deja una función pasan a quien la toma.
      let transferidas = 0;
      for (const funcion of ['auxiliar_principal', 'jefe_responsable'] as const) {
        const antes = trabajo.equipo.find((e) => e.funcion === funcion)?.usuarioId;
        const despues = nuevo.find((e) => e.funcion === funcion)!.usuarioId;
        if (antes && antes !== despues) transferidas += await this.produccion.transferirTareas(tx, trabajoId, antes, despues, actor);
      }
      const partes = [
        entran.length ? `Entran: ${entran.map(describir).join(', ')}` : null,
        salen.length ? `Salen: ${salen.map(describir).join(', ')}` : null,
        transferidas ? `${transferidas} ${transferidas === 1 ? 'tarea pendiente pasó' : 'tareas pendientes pasaron'} a quien entra` : null,
      ].filter(Boolean);
      await tx.trabajo.update({
        where: { id: trabajoId },
        data: {
          ...(trabajo.estado === 'sin_asignar' && { estado: 'asignado' }),
          actualizadoPor: actor.usuarioId,
          eventos: {
            create: {
              tipo: 'equipo',
              detalle: `${trabajo.equipo.length ? 'Cambio de equipo' : 'Equipo armado'}. ${partes.join('. ')}${datos.motivo ? ` — ${datos.motivo}` : ''}`,
              usuarioId: actor.usuarioId,
            },
          },
        },
      });
      await this.auditoria.registrar(
        { usuarioId: actor.usuarioId, accion: 'armar_equipo', entidad: 'trabajo', entidadId: trabajoId, antes: trabajo.equipo, despues: datos, ip: actor.ip },
        tx,
      );
    });
    const enlace = `/trabajos/${trabajoId}`;
    const entraron = entran.filter((e) => !salen.some((x) => x.usuarioId === e.usuarioId));
    for (const e of entran) {
      await this.notificaciones.notificar(
        [e.usuarioId],
        { tipo: 'equipo.entra', titulo: `Te sumaron al equipo de ${trabajo.codigo}`, mensaje: NOMBRE_FUNCION_EQUIPO[e.funcion], enlace },
        actor.usuarioId,
      );
    }
    const salieron = salen.filter((x) => !entraron.some((e) => e.usuarioId === x.usuarioId) && !nuevo.some((n) => n.usuarioId === x.usuarioId));
    await this.notificaciones.notificar(
      salieron.map((x) => x.usuarioId),
      { tipo: 'equipo.sale', titulo: `Saliste del equipo de ${trabajo.codigo}`, mensaje: datos.motivo ?? null, enlace },
      actor.usuarioId,
    );
    return this.obtener(trabajoId, actor.usuarioId);
  }

  // ─── Pagos ───────────────────────────────────────────────

  async registrarPago(contratoId: string, datos: PagoDatos, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    const trabajoId = await this.prisma.$transaction((tx) => this.registrarPagoTx(tx, contratoId, datos, actor));
    return this.obtener(trabajoId, actor.usuarioId);
  }

  /** Registra el pago, lo reparte entre las cuotas (de la más antigua a la más nueva) y genera el recibo. */
  private async registrarPagoTx(tx: Prisma.TransactionClient, contratoId: string, datos: PagoDatos, actor: ActorTrabajo): Promise<string> {
    // Bloquea el contrato para que dos pagos simultáneos no superen el saldo.
    await tx.$queryRaw`SELECT id FROM contrato WHERE id = ${contratoId}::uuid FOR UPDATE`;
    const contrato = await tx.contrato.findUnique({
      where: { id: contratoId },
      include: {
        trabajo: { select: { id: true, estado: true, eliminadoEn: true } },
        cuotas: { orderBy: { numero: 'asc' }, include: { aplicaciones: { where: { pago: { anuladoEn: null } }, select: { montoAplicado: true } } } },
      },
    });
    if (!contrato || contrato.trabajo.eliminadoEn) throw new NotFoundException('Contrato no encontrado');
    if (contrato.estado !== 'vigente' || contrato.trabajo.estado === 'cancelado') throw new BadRequestException('El contrato no está vigente');
    if (datos.fecha > diaEnLima()) throw errorCampo('fecha', 'La fecha del pago no puede ser futura');

    const cuotas = contrato.cuotas.map(aCalculo);
    const saldo = cuotas.reduce((s, c) => s + Math.max(0, c.monto - c.pagado), 0);
    let reparto: { cuotaId: string; centimos: number }[];
    try {
      reparto = repartirPago(aCentimos(datos.monto), cuotas);
    } catch {
      throw errorCampo('monto', `El pago supera el saldo pendiente (${formatearSoles(deCentimos(saldo))})`);
    }

    const numeroRecibo = await siguienteCodigo(tx, 'R');
    await tx.pago.create({
      data: {
        numeroRecibo,
        contratoId,
        monto: datos.monto,
        fecha: dia(datos.fecha),
        metodo: datos.metodo,
        numeroOperacion: datos.numeroOperacion ?? null,
        observaciones: datos.observaciones ?? null,
        registradoPorId: actor.usuarioId,
        aplicaciones: { create: reparto.map((r) => ({ cuotaId: r.cuotaId, montoAplicado: deCentimos(r.centimos) })) },
      },
    });
    const numeros = reparto.map((r) => cuotas.find((c) => c.id === r.cuotaId)!.numero);
    await tx.trabajoEvento.create({
      data: {
        trabajoId: contrato.trabajo.id,
        tipo: 'pago',
        detalle: `Pago ${numeroRecibo} de ${formatearSoles(datos.monto)} (${NOMBRE_METODO_PAGO[datos.metodo]}) aplicado a la cuota ${numeros.join(', ')}`,
        usuarioId: actor.usuarioId,
      },
    });
    await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'registrar_pago', entidad: 'contrato', entidadId: contratoId, despues: datos, ip: actor.ip }, tx);
    return contrato.trabajo.id;
  }

  async anularPago(pagoId: string, motivo: string, actor: ActorTrabajo): Promise<TrabajoDetalle> {
    const pago = await this.prisma.pago.findUnique({ where: { id: pagoId }, include: { contrato: { select: { trabajoId: true } } } });
    if (!pago) throw new NotFoundException('Pago no encontrado');
    if (pago.anuladoEn) throw new BadRequestException('El pago ya está anulado');
    await this.prisma.$transaction(async (tx) => {
      await tx.pago.update({ where: { id: pagoId }, data: { anuladoEn: new Date(), anuladoPorId: actor.usuarioId, motivoAnulacion: motivo } });
      await tx.trabajoEvento.create({
        data: {
          trabajoId: pago.contrato.trabajoId,
          tipo: 'pago',
          detalle: `Se anuló el pago ${pago.numeroRecibo} de ${formatearSoles(Number(pago.monto))} — ${motivo}`,
          usuarioId: actor.usuarioId,
        },
      });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'anular_pago', entidad: 'pago', entidadId: pagoId, despues: { motivo }, ip: actor.ip }, tx);
    });
    return this.obtener(pago.contrato.trabajoId, actor.usuarioId);
  }

  /** Cuotas con saldo de los contratos vigentes, de la más atrasada a la más lejana. */
  async cobranza(): Promise<ResumenCobranza> {
    const hoy = diaEnLima();
    const contratos = await this.prisma.contrato.findMany({
      where: { estado: 'vigente', trabajo: { eliminadoEn: null, estado: { not: 'cancelado' } } },
      include: {
        cuotas: { orderBy: { numero: 'asc' }, include: { aplicaciones: { where: { pago: { anuladoEn: null } }, select: { montoAplicado: true } } } },
        trabajo: {
          select: {
            id: true,
            codigo: true,
            tipoTrabajo: { select: { nombre: true } },
            integrantes: { where: { esTitular: true }, select: { persona: { select: { id: true, celular: true, nombres: true, apellidos: true, email: true, tipoDocumento: true, numeroDocumento: true } } } },
          },
        },
      },
    });

    const limite = sumarDias(hoy, 7);
    const cuotas = contratos.flatMap((c) => {
      const calculo = c.cuotas.map(aCalculo);
      return calculo
        .filter((q) => q.pagado < q.monto)
        .map((q) => ({
          cuotaId: q.id,
          numero: q.numero,
          totalCuotas: calculo.length,
          vencimiento: q.vencimiento,
          monto: deCentimos(q.monto),
          saldo: deCentimos(q.monto - q.pagado),
          estado: q.vencimiento < hoy ? ('vencida' as const) : q.pagado > 0 ? ('parcial' as const) : ('pendiente' as const),
          trabajo: { id: c.trabajo.id, codigo: c.trabajo.codigo, tipoTrabajo: c.trabajo.tipoTrabajo.nombre },
          titular: c.trabajo.integrantes[0]?.persona ?? null,
        }));
    });
    cuotas.sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));

    const suma = (lista: typeof cuotas) => deCentimos(lista.reduce((s, q) => s + aCentimos(q.saldo), 0));
    return {
      hoy,
      totales: {
        vencido: suma(cuotas.filter((q) => q.estado === 'vencida')),
        porVencer7Dias: suma(cuotas.filter((q) => q.vencimiento >= hoy && q.vencimiento <= limite)),
        pendienteTotal: suma(cuotas),
      },
      cuotas,
    };
  }
}
