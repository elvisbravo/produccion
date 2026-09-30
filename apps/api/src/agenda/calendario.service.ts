import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  diaEnLima,
  horaAMinutos,
  ROLES_BASE,
  type DatosPersonalDatos,
  type FeriadoDatos,
  type FeriadoItem,
  type HorarioUsuarioDatos,
  type HorarioVigente,
  type PersonalItem,
  type PlantillaHorarioDatos,
  type PlantillaHorarioItem,
  type TramoSemanal,
} from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AgendaService } from './agenda.service.js';

export interface ActorCalendario {
  usuarioId: string;
  ip: string | null;
}

const soloFecha = (d: Date) => d.toISOString().slice(0, 10);
const aFecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const aTramos = (t: { diaSemana: number; minutoInicio: number; minutoFin: number }[]): TramoSemanal[] =>
  t
    .map((x) => ({ diaSemana: x.diaSemana, inicio: x.minutoInicio, fin: x.minutoFin }))
    .sort((a, b) => a.diaSemana - b.diaSemana || a.inicio - b.inicio);
const aFilas = (tramos: { diaSemana: number; inicio: string; fin: string }[]) =>
  tramos.map((t) => ({ diaSemana: t.diaSemana, minutoInicio: horaAMinutos(t.inicio), minutoFin: horaAMinutos(t.fin) }));

const esDuplicado = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class CalendarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agenda: AgendaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ─── Feriados ─────────────────────────────────────────────

  async feriados(anio: number): Promise<FeriadoItem[]> {
    const filas = await this.prisma.feriado.findMany({
      where: { fecha: { gte: aFecha(`${anio}-01-01`), lte: aFecha(`${anio}-12-31`) } },
      orderBy: { fecha: 'asc' },
    });
    return filas.map((f) => ({ id: f.id, fecha: soloFecha(f.fecha), nombre: f.nombre, alcance: f.alcance, medioDia: f.medioDia }));
  }

  async guardarFeriado(id: string | null, datos: FeriadoDatos, actor: ActorCalendario): Promise<FeriadoItem> {
    const data = { fecha: aFecha(datos.fecha), nombre: datos.nombre, alcance: datos.alcance, medioDia: datos.medioDia };
    try {
      const f = id ? await this.prisma.feriado.update({ where: { id }, data }) : await this.prisma.feriado.create({ data });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: id ? 'editar' : 'crear', entidad: 'feriado', entidadId: f.id, despues: datos, ip: actor.ip });
      return { id: f.id, fecha: soloFecha(f.fecha), nombre: f.nombre, alcance: f.alcance, medioDia: f.medioDia };
    } catch (e) {
      if (esDuplicado(e)) throw new ConflictException({ message: 'Ya hay un feriado ese día', errores: [{ campo: 'fecha', mensaje: 'Ya hay un feriado ese día' }] });
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw new NotFoundException('Feriado no encontrado');
      throw e;
    }
  }

  async eliminarFeriado(id: string, actor: ActorCalendario): Promise<void> {
    const f = await this.prisma.feriado.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('Feriado no encontrado');
    await this.prisma.feriado.delete({ where: { id } });
    await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'eliminar', entidad: 'feriado', entidadId: id, antes: f, ip: actor.ip });
  }

  // ─── Plantillas de horario ────────────────────────────────

  async plantillas(): Promise<PlantillaHorarioItem[]> {
    const [filas, vigentes] = await Promise.all([
      this.prisma.plantillaHorario.findMany({ where: { activa: true }, include: { tramos: true }, orderBy: [{ porDefecto: 'desc' }, { nombre: 'asc' }] }),
      this.horariosVigentes(),
    ]);
    return filas.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      porDefecto: p.porDefecto,
      tramos: aTramos(p.tramos),
      enUso: [...vigentes.values()].filter((h) => h.plantillaId === p.id).length,
    }));
  }

  async guardarPlantilla(id: string | null, datos: PlantillaHorarioDatos, actor: ActorCalendario): Promise<PlantillaHorarioItem> {
    if (datos.tramos.length === 0) throw new BadRequestException({ message: 'Datos inválidos', errores: [{ campo: 'tramos', mensaje: 'Agrega al menos un tramo' }] });
    try {
      const plantillaId = await this.prisma.$transaction(async (tx) => {
        if (id) {
          const actual = await tx.plantillaHorario.findUnique({ where: { id } });
          if (!actual) throw new NotFoundException('Plantilla no encontrada');
          // Siempre debe haber una plantilla por defecto: se cambia marcando otra.
          if (actual.porDefecto && !datos.porDefecto) throw new BadRequestException('Para cambiar la plantilla por defecto, marca otra como por defecto');
        }
        if (datos.porDefecto) await tx.plantillaHorario.updateMany({ where: { porDefecto: true, ...(id && { id: { not: id } }) }, data: { porDefecto: false } });
        const p = id
          ? await tx.plantillaHorario.update({ where: { id }, data: { nombre: datos.nombre, porDefecto: datos.porDefecto } })
          : await tx.plantillaHorario.create({ data: { nombre: datos.nombre, porDefecto: datos.porDefecto } });
        await tx.plantillaHorarioTramo.deleteMany({ where: { plantillaId: p.id } });
        await tx.plantillaHorarioTramo.createMany({ data: aFilas(datos.tramos).map((t) => ({ ...t, plantillaId: p.id })) });
        await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: id ? 'editar' : 'crear', entidad: 'plantilla_horario', entidadId: p.id, despues: datos, ip: actor.ip }, tx);
        return p.id;
      });
      return (await this.plantillas()).find((p) => p.id === plantillaId)!;
    } catch (e) {
      if (esDuplicado(e)) throw new ConflictException({ message: 'Ya existe una plantilla con ese nombre', errores: [{ campo: 'nombre', mensaje: 'Ya existe una plantilla con ese nombre' }] });
      throw e;
    }
  }

  // ─── Horario y datos del personal ─────────────────────────

  /** Horario vigente hoy de cada usuario que tiene horario propio. */
  private async horariosVigentes(usuarioIds?: string[]) {
    const hoy = aFecha(diaEnLima());
    const filas = await this.prisma.horarioUsuario.findMany({
      where: { vigenteDesde: { lte: hoy }, ...(usuarioIds && { usuarioId: { in: usuarioIds } }) },
      orderBy: { vigenteDesde: 'desc' },
      include: { tramos: true, plantilla: { select: { id: true, nombre: true } } },
    });
    const porUsuario = new Map<string, (typeof filas)[number]>();
    for (const f of filas) if (!porUsuario.has(f.usuarioId)) porUsuario.set(f.usuarioId, f);
    return porUsuario;
  }

  async personal(usuarioId?: string): Promise<PersonalItem[]> {
    const usuarios = await this.prisma.usuario.findMany({
      where: {
        activo: true,
        eliminadoEn: null,
        ...(usuarioId ? { id: usuarioId } : { roles: { some: { rol: { activo: true, codigo: { not: ROLES_BASE.ADMIN } } } } }),
      },
      orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }],
      select: { id: true, nombres: true, apellidos: true, fechaNacimiento: true, roles: { select: { rol: { select: { nombre: true } } } } },
    });
    const ids = usuarios.map((u) => u.id);
    const hoy = aFecha(diaEnLima());
    const [vigentes, futuros, porDefecto, plantillaDefecto] = await Promise.all([
      this.horariosVigentes(ids),
      this.prisma.horarioUsuario.findMany({
        where: { usuarioId: { in: ids }, vigenteDesde: { gt: hoy } },
        orderBy: { vigenteDesde: 'asc' },
        include: { tramos: true, plantilla: { select: { id: true, nombre: true } } },
      }),
      this.agenda.tramosPorDefecto(),
      this.prisma.plantillaHorario.findFirst({ where: { porDefecto: true }, select: { id: true, nombre: true } }),
    ]);

    const aHorario = (h: NonNullable<ReturnType<typeof vigentes.get>>): HorarioVigente => ({
      id: h.id,
      vigenteDesde: soloFecha(h.vigenteDesde),
      plantilla: h.plantilla,
      porDefecto: false,
      tramos: aTramos(h.tramos),
    });

    return usuarios.map((u) => {
      const vigente = vigentes.get(u.id);
      const proximo = futuros.find((f) => f.usuarioId === u.id);
      return {
        usuario: { id: u.id, nombres: u.nombres, apellidos: u.apellidos },
        roles: u.roles.map((r) => r.rol.nombre),
        fechaNacimiento: u.fechaNacimiento ? soloFecha(u.fechaNacimiento) : null,
        horario: vigente ? aHorario(vigente) : { id: null, vigenteDesde: null, plantilla: plantillaDefecto, porDefecto: true, tramos: porDefecto },
        proximo: proximo ? aHorario(proximo) : null,
      };
    });
  }

  private async unoDelPersonal(usuarioId: string): Promise<PersonalItem> {
    const [item] = await this.personal(usuarioId);
    if (!item) throw new NotFoundException('Usuario no encontrado');
    return item;
  }

  /**
   * Nuevo horario desde una fecha. No cambia el pasado: rige desde hoy o después
   * (salvo el primer horario de la persona). Si ya hay uno que empieza ese día, se reemplaza.
   */
  async guardarHorario(usuarioId: string, datos: HorarioUsuarioDatos, actor: ActorCalendario): Promise<PersonalItem> {
    await this.unoDelPersonal(usuarioId);
    const tieneHorario = (await this.prisma.horarioUsuario.count({ where: { usuarioId } })) > 0;
    if (tieneHorario && datos.vigenteDesde < diaEnLima()) {
      throw new BadRequestException({ message: 'Datos inválidos', errores: [{ campo: 'vigenteDesde', mensaje: 'El cambio rige desde hoy o una fecha futura' }] });
    }
    if (datos.plantillaId && !(await this.prisma.plantillaHorario.findFirst({ where: { id: datos.plantillaId, activa: true } }))) {
      throw new BadRequestException({ message: 'Datos inválidos', errores: [{ campo: 'plantillaId', mensaje: 'Plantilla no válida' }] });
    }
    await this.prisma.$transaction(async (tx) => {
      const horario = await tx.horarioUsuario.upsert({
        where: { usuarioId_vigenteDesde: { usuarioId, vigenteDesde: aFecha(datos.vigenteDesde) } },
        create: { usuarioId, vigenteDesde: aFecha(datos.vigenteDesde), plantillaId: datos.plantillaId ?? null, creadoPorId: actor.usuarioId },
        update: { plantillaId: datos.plantillaId ?? null, creadoPorId: actor.usuarioId },
      });
      await tx.horarioUsuarioTramo.deleteMany({ where: { horarioId: horario.id } });
      await tx.horarioUsuarioTramo.createMany({ data: aFilas(datos.tramos).map((t) => ({ ...t, horarioId: horario.id })) });
      await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'cambiar_horario', entidad: 'usuario', entidadId: usuarioId, despues: datos, ip: actor.ip }, tx);
    });
    return this.unoDelPersonal(usuarioId);
  }

  /** Anula un cambio de horario que todavía no empieza. */
  async anularHorarioFuturo(usuarioId: string, horarioId: string, actor: ActorCalendario): Promise<PersonalItem> {
    const horario = await this.prisma.horarioUsuario.findFirst({ where: { id: horarioId, usuarioId } });
    if (!horario) throw new NotFoundException('Horario no encontrado');
    if (soloFecha(horario.vigenteDesde) <= diaEnLima()) throw new BadRequestException('Ese horario ya está vigente: registra un cambio nuevo');
    await this.prisma.horarioUsuario.delete({ where: { id: horarioId } });
    await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'anular_horario', entidad: 'usuario', entidadId: usuarioId, antes: { vigenteDesde: horario.vigenteDesde }, ip: actor.ip });
    return this.unoDelPersonal(usuarioId);
  }

  async guardarDatos(usuarioId: string, datos: DatosPersonalDatos, actor: ActorCalendario): Promise<PersonalItem> {
    const antes = await this.unoDelPersonal(usuarioId);
    if (datos.fechaNacimiento && datos.fechaNacimiento > diaEnLima()) {
      throw new BadRequestException({ message: 'Datos inválidos', errores: [{ campo: 'fechaNacimiento', mensaje: 'La fecha no puede ser futura' }] });
    }
    await this.prisma.usuario.update({ where: { id: usuarioId }, data: { fechaNacimiento: datos.fechaNacimiento ? aFecha(datos.fechaNacimiento) : null } });
    await this.auditoria.registrar({
      usuarioId: actor.usuarioId,
      accion: 'editar',
      entidad: 'usuario',
      entidadId: usuarioId,
      antes: { fechaNacimiento: antes.fechaNacimiento },
      despues: datos,
      ip: actor.ip,
    });
    return this.unoDelPersonal(usuarioId);
  }
}
