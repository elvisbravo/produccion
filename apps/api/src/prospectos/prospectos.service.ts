import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  Alcance,
  ListarProspectosConsulta,
  Paginado,
  ProspectoDatos,
  ProspectoDetalle,
  ProspectoListadoItem,
} from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import { contieneDigitos, contieneTodas, digitosDe, MAX_COINCIDENCIAS, palabrasDe } from '../common/busqueda.js';
import { siguienteCodigo } from '../common/correlativo.js';
import { Prisma } from '../generated/prisma/client.js';
import { PersonasService } from '../personas/personas.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { aDetalle, aListado, INCLUIR_DETALLE, INCLUIR_LISTADO } from './mapeo.js';

export interface Actor {
  usuarioId: string;
  alcance: Alcance | null;
  ip: string | null;
}

/** Nombres legibles de los campos, para el detalle del evento "editado". */
const ETIQUETAS: Partial<Record<keyof ProspectoDatos, string>> = {
  tipoTrabajoId: 'tipo de trabajo',
  prioridadId: 'prioridad',
  origenId: 'origen',
  nivelAcademicoId: 'nivel académico',
  universidadId: 'universidad',
  carreraId: 'carrera',
  referidoPorId: 'referido por',
  titulo: 'título',
  fechaEntregaTentativa: 'fecha de entrega tentativa',
  linkDrive: 'link del Drive',
  observaciones: 'observaciones',
  detalles: 'detalles',
  temperatura: 'temperatura',
};

@Injectable()
export class ProspectosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly personas: PersonasService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Filtro según el alcance del permiso: con "propios" (o "equipo") solo los que tiene a cargo. */
  private filtroAlcance(actor: Actor): Prisma.ProspectoWhereInput {
    return actor.alcance === 'todos' ? {} : { responsableId: actor.usuarioId };
  }

  async listar(filtros: ListarProspectosConsulta, actor: Actor): Promise<Paginado<ProspectoListadoItem>> {
    const { q, etapaId, temperatura, tipoTrabajoId, pagina, porPagina } = filtros;
    const where: Prisma.ProspectoWhereInput = {
      eliminadoEn: null,
      ...this.filtroAlcance(actor),
      ...(etapaId && { etapaId }),
      ...(temperatura && { temperatura }),
      ...(tipoTrabajoId && { tipoTrabajoId }),
      ...(q && { id: { in: await this.idsQueCoinciden(q) } }),
    };

    const [total, filas] = await Promise.all([
      this.prisma.prospecto.count({ where }),
      this.prisma.prospecto.findMany({
        where,
        include: INCLUIR_LISTADO,
        orderBy: { creadoEn: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);
    return { datos: filas.map(aListado), total, pagina, porPagina };
  }

  /**
   * Busca, sin distinguir tildes ni mayúsculas, por código, título, nombre y apellido
   * o celular/documento de cualquiera de sus contactos.
   */
  private async idsQueCoinciden(q: string): Promise<string[]> {
    const palabras = palabrasDe(q);
    const digitos = digitosDe(q);
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM prospecto p
      WHERE p.eliminado_en IS NULL AND (
        ${contieneTodas([Prisma.sql`p.codigo`, Prisma.sql`p.titulo`], palabras)}
        OR EXISTS (
          SELECT 1 FROM prospecto_contacto pc JOIN persona pe ON pe.id = pc.persona_id
          WHERE pc.prospecto_id = p.id AND (
            ${contieneTodas([Prisma.sql`pe.nombres`, Prisma.sql`pe.apellidos`], palabras)}
            OR ${contieneDigitos(Prisma.sql`pe.celular`, digitos)}
            OR ${contieneDigitos(Prisma.sql`pe.numero_documento`, digitos)}
          )
        )
      )
      LIMIT ${MAX_COINCIDENCIAS}`;
    return filas.map((f) => f.id);
  }

  async obtener(id: string, actor: Actor): Promise<ProspectoDetalle> {
    const prospecto = await this.prisma.prospecto.findFirst({
      where: { id, eliminadoEn: null, ...this.filtroAlcance(actor) },
      include: INCLUIR_DETALLE,
    });
    if (!prospecto) throw new NotFoundException('Prospecto no encontrado');
    return aDetalle(prospecto);
  }

  async crear(datos: ProspectoDatos, actor: Actor): Promise<ProspectoDetalle> {
    await this.validarReferencias(datos);
    const etapaInicial = await this.prisma.etapaProspecto.findFirst({ where: { inicial: true, activa: true }, orderBy: { orden: 'asc' } });
    if (!etapaInicial) throw new BadRequestException('No hay una etapa inicial configurada en el embudo');

    const id = await this.prisma.$transaction(async (tx) => {
      const personas = await this.resolverContactos(tx, datos, actor.usuarioId);
      const codigo = await siguienteCodigo(tx, 'P');

      const prospecto = await tx.prospecto.create({
        data: {
          ...this.camposProspecto(datos),
          codigo,
          etapaId: etapaInicial.id,
          captadoPorId: actor.usuarioId,
          responsableId: actor.usuarioId,
          creadoPor: actor.usuarioId,
          contactos: { create: personas },
          eventos: { create: { tipo: 'creado', detalle: `Prospecto registrado en la etapa "${etapaInicial.nombre}"`, usuarioId: actor.usuarioId } },
        },
        select: { id: true },
      });

      await this.auditoria.registrar(
        { usuarioId: actor.usuarioId, accion: 'crear', entidad: 'prospecto', entidadId: prospecto.id, despues: { codigo, ...datos }, ip: actor.ip },
        tx,
      );
      return prospecto.id;
    });

    return this.obtener(id, { ...actor, alcance: 'todos' });
  }

  async editar(id: string, datos: ProspectoDatos, actor: Actor): Promise<ProspectoDetalle> {
    const antes = await this.obtener(id, actor);
    await this.validarReferencias(datos);

    await this.prisma.$transaction(async (tx) => {
      const personas = await this.resolverContactos(tx, datos, actor.usuarioId);
      const cambios = this.describirCambios(antes, datos, personas.map((p) => p.personaId));

      await tx.prospectoContacto.deleteMany({ where: { prospectoId: id } });
      await tx.prospecto.update({
        where: { id },
        data: {
          ...this.camposProspecto(datos),
          actualizadoPor: actor.usuarioId,
          contactos: { create: personas },
          ...(cambios.length > 0 && {
            eventos: { create: { tipo: 'editado', detalle: `Se actualizó: ${cambios.join(', ')}`, usuarioId: actor.usuarioId } },
          }),
        },
      });

      await this.auditoria.registrar(
        { usuarioId: actor.usuarioId, accion: 'editar', entidad: 'prospecto', entidadId: id, antes, despues: datos, ip: actor.ip },
        tx,
      );
    });

    return this.obtener(id, actor);
  }

  private camposProspecto(d: ProspectoDatos) {
    return {
      tipoTrabajoId: d.tipoTrabajoId,
      prioridadId: d.prioridadId,
      origenId: d.origenId,
      nivelAcademicoId: d.nivelAcademicoId ?? null,
      universidadId: d.universidadId ?? null,
      carreraId: d.carreraId ?? null,
      referidoPorId: d.referidoPorId ?? null,
      titulo: d.titulo ?? null,
      fechaEntregaTentativa: d.fechaEntregaTentativa ? new Date(`${d.fechaEntregaTentativa}T00:00:00Z`) : null,
      linkDrive: d.linkDrive ?? null,
      observaciones: d.observaciones ?? null,
      detalles: d.detalles ?? null,
      temperatura: d.temperatura ?? null,
    };
  }

  private async resolverContactos(tx: Prisma.TransactionClient, datos: ProspectoDatos, usuarioId: string) {
    const personas: { personaId: string; esPrincipal: boolean; orden: number }[] = [];
    for (const [orden, contacto] of datos.contactos.entries()) {
      const persona = await this.personas.resolver(tx, contacto, usuarioId);
      personas.push({ personaId: persona.id, esPrincipal: contacto.esPrincipal, orden });
    }
    if (datos.referidoPorId && personas.some((p) => p.personaId === datos.referidoPorId)) {
      throw new BadRequestException('Un contacto no puede ser referido por sí mismo');
    }
    return personas;
  }

  /** Verifica que los catálogos elegidos existan y estén activos, con mensajes claros. */
  private async validarReferencias(d: ProspectoDatos) {
    const [tipo, prioridad, origen, nivel, universidad, carrera, referido] = await Promise.all([
      this.prisma.tipoTrabajo.findFirst({ where: { id: d.tipoTrabajoId, activo: true } }),
      this.prisma.prioridadTrabajo.findFirst({ where: { id: d.prioridadId, activo: true }, select: { id: true } }),
      this.prisma.origenContacto.findFirst({ where: { id: d.origenId, activo: true }, select: { esReferido: true } }),
      d.nivelAcademicoId ? this.prisma.nivelAcademico.findFirst({ where: { id: d.nivelAcademicoId, activo: true }, select: { id: true } }) : true,
      d.universidadId ? this.prisma.universidad.findFirst({ where: { id: d.universidadId, activo: true }, select: { id: true } }) : true,
      d.carreraId ? this.prisma.carrera.findFirst({ where: { id: d.carreraId, activo: true }, select: { id: true } }) : true,
      d.referidoPorId ? this.prisma.persona.findFirst({ where: { id: d.referidoPorId, eliminadoEn: null }, select: { id: true } }) : true,
    ]);

    const errores: { campo: string; mensaje: string }[] = [];
    if (!tipo) errores.push({ campo: 'tipoTrabajoId', mensaje: 'Tipo de trabajo no disponible' });
    if (!prioridad) errores.push({ campo: 'prioridadId', mensaje: 'Prioridad no disponible' });
    if (!origen) errores.push({ campo: 'origenId', mensaje: 'Origen no disponible' });
    if (!nivel) errores.push({ campo: 'nivelAcademicoId', mensaje: 'Nivel académico no disponible' });
    if (!universidad) errores.push({ campo: 'universidadId', mensaje: 'Universidad no disponible' });
    if (!carrera) errores.push({ campo: 'carreraId', mensaje: 'Carrera no disponible' });
    if (!referido) errores.push({ campo: 'referidoPorId', mensaje: 'La persona que refirió no existe' });
    if (tipo && d.contactos.length > tipo.maxIntegrantes) {
      errores.push({
        campo: 'contactos',
        mensaje: `${tipo.nombre} admite hasta ${tipo.maxIntegrantes} ${tipo.maxIntegrantes === 1 ? 'integrante' : 'integrantes'}`,
      });
    }
    if (origen && !origen.esReferido && d.referidoPorId) {
      errores.push({ campo: 'referidoPorId', mensaje: 'Solo se indica "referido por" cuando el origen es Referido' });
    }
    if (errores.length > 0) throw new BadRequestException({ message: 'Datos inválidos', errores });
  }

  private describirCambios(antes: ProspectoDetalle, d: ProspectoDatos, personaIds: string[]): string[] {
    const previo: Record<string, unknown> = {
      tipoTrabajoId: antes.tipoTrabajo.id,
      prioridadId: antes.prioridad.id,
      origenId: antes.origen.id,
      nivelAcademicoId: antes.nivelAcademico?.id,
      universidadId: antes.universidad?.id,
      carreraId: antes.carrera?.id,
      referidoPorId: antes.referidoPor?.id,
      titulo: antes.titulo ?? undefined,
      fechaEntregaTentativa: antes.fechaEntregaTentativa ?? undefined,
      linkDrive: antes.linkDrive ?? undefined,
      observaciones: antes.observaciones ?? undefined,
      detalles: antes.detalles ?? undefined,
      temperatura: antes.temperatura ?? undefined,
    };
    const cambios = (Object.keys(ETIQUETAS) as (keyof ProspectoDatos)[])
      .filter((campo) => (previo[campo] ?? undefined) !== (d[campo] ?? undefined))
      .map((campo) => ETIQUETAS[campo]!);

    const contactosPrevios = antes.contactos.map((c) => `${c.id}:${c.esPrincipal}`).sort().join();
    const contactosNuevos = personaIds.map((id, i) => `${id}:${d.contactos[i].esPrincipal}`).sort().join();
    if (contactosPrevios !== contactosNuevos) cambios.unshift('contactos');
    return cambios;
  }
}
