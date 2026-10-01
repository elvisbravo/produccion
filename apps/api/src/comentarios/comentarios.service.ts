import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  extraerMenciones,
  textoPlano,
  type ComentarioDatos,
  type ComentarioItem,
  type ConsultaComentarios,
  type EntidadComentario,
  type UsuarioResumen,
} from '@grupoes/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TrabajosService } from '../trabajos/trabajos.service.js';

const CAMPOS_USUARIO = { id: true, nombres: true, apellidos: true } as const;
const INCLUIR = {
  autor: { select: CAMPOS_USUARIO },
  menciones: { include: { usuario: { select: CAMPOS_USUARIO } } },
} as const satisfies Prisma.ComentarioInclude;
type ComentarioConRelaciones = Prisma.ComentarioGetPayload<{ include: typeof INCLUIR }>;

/** A qué registro pertenece el hilo: de ahí salen quién lo ve, el texto del aviso y el enlace. */
interface Contexto {
  prospectoId: string | null;
  trabajoId: string | null;
  /** Responsables de la tarea: siempre ven su hilo. */
  responsables: string[];
  etiqueta: string;
  enlace: string;
}

const aItem = (c: ComentarioConRelaciones): ComentarioItem => ({
  id: c.id,
  autor: c.autor,
  texto: c.texto,
  menciones: c.menciones.map((m) => m.usuario),
  creadoEn: c.creadoEn.toISOString(),
  editadoEn: c.editadoEn?.toISOString() ?? null,
});

const resumen = (texto: string) => {
  const plano = textoPlano(texto).replace(/\s+/g, ' ').trim();
  return plano.length > 160 ? `${plano.slice(0, 157)}…` : plano;
};

@Injectable()
export class ComentariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
    private readonly trabajos: TrabajosService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  private async contexto(entidad: EntidadComentario, id: string): Promise<Contexto> {
    const noExiste = () => new NotFoundException('Registro no encontrado');
    switch (entidad) {
      case 'prospecto': {
        const p = await this.prisma.prospecto.findFirst({ where: { id, eliminadoEn: null }, select: { codigo: true } });
        if (!p) throw noExiste();
        return { prospectoId: id, trabajoId: null, responsables: [], etiqueta: `el prospecto ${p.codigo}`, enlace: `/prospectos/${id}` };
      }
      case 'trabajo': {
        const t = await this.prisma.trabajo.findFirst({ where: { id, eliminadoEn: null }, select: { codigo: true } });
        if (!t) throw noExiste();
        return { prospectoId: null, trabajoId: id, responsables: [], etiqueta: `el trabajo ${t.codigo}`, enlace: `/trabajos/${id}` };
      }
      case 'entregable': {
        const e = await this.prisma.entregable.findFirst({ where: { id, trabajo: { eliminadoEn: null } }, select: { nombre: true, trabajo: { select: { id: true, codigo: true } } } });
        if (!e) throw noExiste();
        return { prospectoId: null, trabajoId: e.trabajo.id, responsables: [], etiqueta: `"${e.nombre}" de ${e.trabajo.codigo}`, enlace: `/trabajos/${e.trabajo.id}` };
      }
      case 'tarea': {
        const t = await this.prisma.tarea.findUnique({
          where: { id },
          select: {
            titulo: true,
            prospectoId: true,
            trabajoId: true,
            actividad: { select: { nombre: true } },
            responsables: { select: { usuarioId: true } },
            prospecto: { select: { codigo: true, eliminadoEn: true } },
            trabajo: { select: { codigo: true, eliminadoEn: true } },
          },
        });
        if (!t || t.prospecto?.eliminadoEn || t.trabajo?.eliminadoEn) throw noExiste();
        const de = t.trabajo?.codigo ?? t.prospecto?.codigo;
        return {
          prospectoId: t.prospectoId,
          trabajoId: t.trabajoId,
          responsables: t.responsables.map((r) => r.usuarioId),
          etiqueta: `la tarea "${t.titulo ?? t.actividad.nombre}"${de ? ` de ${de}` : ''}`,
          enlace: t.trabajoId ? `/trabajos/${t.trabajoId}` : t.prospectoId ? `/prospectos/${t.prospectoId}` : '/tareas',
        };
      }
    }
  }

  /** Ve el hilo quien ve el registro: el prospecto o el trabajo según su alcance, o un responsable de la tarea. */
  private async puedeVer(usuarioId: string, ctx: Contexto): Promise<boolean> {
    if (ctx.responsables.includes(usuarioId)) return true;
    const efectivos = await this.permisos.efectivos(usuarioId);
    if (ctx.trabajoId) {
      if (!('trabajos.ver' in efectivos)) return false;
      return (await this.prisma.trabajo.count({ where: { id: ctx.trabajoId, ...(await this.trabajos.filtroVisibles(usuarioId)) } })) > 0;
    }
    if (ctx.prospectoId) {
      const alcance = efectivos['prospectos.ver'];
      if (alcance === undefined) return false;
      return alcance === 'todos' || (await this.prisma.prospecto.count({ where: { id: ctx.prospectoId, responsableId: usuarioId } })) > 0;
    }
    return false;
  }

  private async contextoVisible(consulta: ConsultaComentarios, usuarioId: string): Promise<Contexto> {
    const ctx = await this.contexto(consulta.entidad, consulta.entidadId);
    // Sin acceso, igual que si no existiera.
    if (!(await this.puedeVer(usuarioId, ctx))) throw new NotFoundException('Registro no encontrado');
    return ctx;
  }

  async listar(consulta: ConsultaComentarios, usuarioId: string): Promise<ComentarioItem[]> {
    await this.contextoVisible(consulta, usuarioId);
    const lista = await this.prisma.comentario.findMany({
      where: { entidad: consulta.entidad, entidadId: consulta.entidadId, eliminadoEn: null },
      include: INCLUIR,
      orderBy: { creadoEn: 'asc' },
    });
    return lista.map(aItem);
  }

  /** Personas activas que ven el registro: las únicas que se pueden mencionar. */
  async mencionables(consulta: ConsultaComentarios, usuarioId: string): Promise<UsuarioResumen[]> {
    const ctx = await this.contextoVisible(consulta, usuarioId);
    const usuarios = await this.prisma.usuario.findMany({
      where: { activo: true, eliminadoEn: null, id: { not: usuarioId } },
      select: CAMPOS_USUARIO,
      orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }],
    });
    const visibles = await Promise.all(usuarios.map(async (u) => ((await this.puedeVer(u.id, ctx)) ? u : null)));
    return visibles.filter((u): u is UsuarioResumen => u !== null);
  }

  /** Las menciones deben ser de personas activas que ven el registro. */
  private async validarMenciones(texto: string, ctx: Contexto, autorId: string): Promise<string[]> {
    const ids = extraerMenciones(texto).filter((id) => id !== autorId);
    if (ids.length === 0) return [];
    const usuarios = await this.prisma.usuario.findMany({ where: { id: { in: ids }, activo: true, eliminadoEn: null }, select: CAMPOS_USUARIO });
    for (const id of ids) {
      const u = usuarios.find((x) => x.id === id);
      if (!u) throw new BadRequestException('Una de las personas mencionadas no existe o está inactiva');
      if (!(await this.puedeVer(id, ctx))) throw new BadRequestException(`${u.nombres} ${u.apellidos} no tiene acceso a este registro; no se le puede mencionar`);
    }
    return ids;
  }

  private async avisar(destinos: string[], comentario: ComentarioConRelaciones, ctx: Contexto) {
    await this.notificaciones.notificar(
      destinos,
      { tipo: 'comentario.mencion', titulo: `${comentario.autor.nombres} te mencionó en ${ctx.etiqueta}`, mensaje: resumen(comentario.texto), enlace: ctx.enlace },
      comentario.autorId,
    );
  }

  async crear(datos: ComentarioDatos, autorId: string): Promise<ComentarioItem> {
    const ctx = await this.contextoVisible(datos, autorId);
    const menciones = await this.validarMenciones(datos.texto, ctx, autorId);
    const c = await this.prisma.comentario.create({
      data: { entidad: datos.entidad, entidadId: datos.entidadId, autorId, texto: datos.texto, menciones: { create: menciones.map((usuarioId) => ({ usuarioId })) } },
      include: INCLUIR,
    });
    await this.avisar(menciones, c, ctx);
    return aItem(c);
  }

  private async propio(id: string, usuarioId: string) {
    const c = await this.prisma.comentario.findFirst({ where: { id, eliminadoEn: null }, include: { menciones: true } });
    if (!c) throw new NotFoundException('Comentario no encontrado');
    const ctx = await this.contextoVisible({ entidad: c.entidad, entidadId: c.entidadId }, usuarioId);
    if (c.autorId !== usuarioId) throw new ForbiddenException('Solo quien escribió el comentario puede cambiarlo');
    return { c, ctx };
  }

  /** Al editar se avisa solo a quienes se mencionan por primera vez. */
  async editar(id: string, texto: string, usuarioId: string): Promise<ComentarioItem> {
    const { c, ctx } = await this.propio(id, usuarioId);
    const menciones = await this.validarMenciones(texto, ctx, usuarioId);
    const antes = new Set(c.menciones.map((m) => m.usuarioId));
    const editado = await this.prisma.comentario.update({
      where: { id },
      data: { texto, editadoEn: new Date(), menciones: { deleteMany: {}, create: menciones.map((usuarioId) => ({ usuarioId })) } },
      include: INCLUIR,
    });
    await this.avisar(
      menciones.filter((m) => !antes.has(m)),
      editado,
      ctx,
    );
    return aItem(editado);
  }

  async eliminar(id: string, usuarioId: string): Promise<void> {
    await this.propio(id, usuarioId);
    await this.prisma.comentario.update({ where: { id }, data: { eliminadoEn: new Date() } });
  }
}
