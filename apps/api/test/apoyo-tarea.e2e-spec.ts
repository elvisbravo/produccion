/**
 * Pruebas e2e del apoyo para una tarea que no llega: pasarla en horario normal o con horas extra / bono (base produccion_test).
 */
import {
  diaEnLima,
  sumarDias,
  type ApoyoTarea,
  type CatalogoActividades,
  type CatalogosProspecto,
  type ColaPersona,
  type HoraExtraItem,
  type ProspectoDetalle,
  type TrabajoDetalle,
} from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { datosAcademicos } from './datos-academicos.js';

const sufijo = Date.now().toString().slice(-6);
const celular = (n: number) => `9${sufijo}${String(n).padStart(2, '0')}`;
const PASSWORD = 'Prueba-e2e-123';
const hoy = diaEnLima();

type Quien = 'admin' | 'prod' | 'ana' | 'aux' | 'aux2' | 'aux3' | 'jefe';
const ROL: Record<Quien, string> = { admin: 'ADMIN', prod: 'ASIST_PROD', ana: 'ASIST_ADM', aux: 'AUXILIAR', aux2: 'AUXILIAR', aux3: 'AUXILIAR', jefe: 'JEFE_PROD' };

describe('Apoyo para una tarea que no llega (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let trabajo: TrabajoDetalle;
  let tareaId: string;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const cola = async (q: Quien) => (await http().get('/api/produccion/colas/mia').set(como(q)).expect(200)).body as ColaPersona;
  const apoyo = async () => (await http().get(`/api/produccion/tareas/${tareaId}/apoyo`).set(como('prod')).expect(200)).body as ApoyoTarea;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const academicos = await datosAcademicos(prisma);
    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.apy.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      ids[q] = (await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'Apoyo', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } } })).id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body as CatalogosProspecto;
    const actividades = (await http().get('/api/catalogos/actividades').set(como('admin')).expect(200)).body as CatalogoActividades;
    const elaboracion = actividades.actividades.find((a) => a.nombre === 'Elaboración')!;
    const p = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Tesis')!.id,
          prioridadId: catalogos.prioridades.find((x) => !x.nombre.toLowerCase().includes('urgente'))!.id,
          origenId: catalogos.origenes[0].id,
          contactos: [{ celular: celular(1), esPrincipal: true }],
        })
        .expect(201)
    ).body as ProspectoDetalle;
    trabajo = (
      await http()
        .post(`/api/prospectos/${p.id}/convertir`)
        .set(como('ana'))
        .send({
          integrantes: [{ personaId: p.contactos[0].id, nombres: 'Cliente', apellidos: 'Apoyo', email: `ap.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `2${sufijo}1`, esTitular: true }],
          // Plazo muy corto para una tarea muy larga: en horario normal no llega.
          trabajo: { ...academicos, titulo: 'Trabajo apretado', fechaInicio: hoy, fechaLimite: sumarDias(hoy, 4) },
          contrato: { fechaFirma: hoy, montoTotal: 500, formaPago: 'contado', cuotas: [{ monto: 500, vencimiento: hoy }] },
        })
        .expect(201)
    ).body as TrabajoDetalle;
    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);
    await http().post(`/api/trabajos/${trabajo.id}/entregables`).set(como('prod')).send({ nombre: 'Entrega final', fechaLimite: sumarDias(hoy, 4), esFinal: true }).expect(201);
    const detalle = (await http().get(`/api/trabajos/${trabajo.id}`).set(como('prod')).expect(200)).body as TrabajoDetalle;
    const conTarea = (await http().post(`/api/entregables/${detalle.entregables[0].id}/tareas`).set(como('prod')).send({ actividadId: elaboracion.id, titulo: 'Capítulo largo', minutosEstimados: 3000 }).expect(201)).body as TrabajoDetalle;
    tareaId = conTarea.entregables[0].tareas[0].id;
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.horaExtraBono.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('evalúa quién puede tomarla y qué necesitaría cada uno; solo quien reasigna lo ve', async () => {
    await http().get(`/api/produccion/tareas/${tareaId}/apoyo`).set(como('aux')).expect(403);
    const a = await apoyo();
    expect(a.responsable.id).toBe(ids.aux);
    expect(a.tarea).toMatchObject({ minutos: 3000, titulo: 'Capítulo largo' });
    expect(['rojo', 'sin_plan']).toContain(a.actual.semaforo);
    // Candidatos: los otros auxiliares (no el dueño) y el jefe (que no puede elaborar lo que revisa)
    const porId = new Map(a.candidatos.map((c) => [c.usuario.id, c]));
    expect(porId.has(ids.aux)).toBe(false);
    expect(porId.has(ids.aux2)).toBe(true);
    expect(porId.has(ids.ana)).toBe(false);
    const c2 = porId.get(ids.aux2)!;
    expect(c2.llegaEnHorario).toBe(false);
    expect(c2.horasExtra).not.toBeNull();
    expect(c2.horasExtra!.faltanMinutos).toBeGreaterThan(0);
    expect(c2.horasExtra!.minutos).toBeLessThanOrEqual(240);
    expect(c2.horasExtra!.horaInicio < c2.horasExtra!.horaFin).toBe(true);
    expect(c2.horasExtra!.fecha <= sumarDias(hoy, 4)).toBe(true);
    // El jefe responsable del trabajo no toma lo que elabora
    expect(porId.get(ids.jefe)?.aviso).toContain('jefe responsable');
    expect(porId.get(ids.jefe)?.horasExtra).toBeNull();
  });

  it('con horas extra: la persona acepta, se aprueba y recién ahí la tarea pasa a su cola', async () => {
    const o = (await apoyo()).candidatos.find((c) => c.usuario.id === ids.aux2)!.horasExtra!;
    const base = { usuarioId: ids.aux2, modalidad: 'horas_extra', fecha: o.fecha, horaInicio: o.horaInicio, horaFin: o.horaFin };
    await http().post(`/api/produccion/tareas/${tareaId}/apoyo`).set(como('aux')).send(base).expect(403);
    // Una persona que no puede hacer la tarea no se propone
    await http().post(`/api/produccion/tareas/${tareaId}/apoyo`).set(como('prod')).send({ ...base, usuarioId: ids.ana }).expect(400);
    const propuesta = (await http().post(`/api/produccion/tareas/${tareaId}/apoyo`).set(como('prod')).send(base).expect(201)).body as HoraExtraItem;
    expect(propuesta.estado).toBe('propuesta');
    // Mientras tanto la tarea sigue con su dueño
    expect((await cola('aux')).items.some((i) => i.tareaId === tareaId)).toBe(true);
    // No se abren dos propuestas de apoyo para la misma tarea
    await http().post(`/api/produccion/tareas/${tareaId}/apoyo`).set(como('prod')).send({ ...base, usuarioId: ids.aux3 }).expect(409);
    // Solo la persona propuesta responde; aceptar no mueve la tarea, aprobar sí
    await http().post(`/api/horas-extra/${propuesta.id}/responder`).set(como('aux3')).send({ acepta: true }).expect(403);
    await http().post(`/api/horas-extra/${propuesta.id}/responder`).set(como('aux2')).send({ acepta: true }).expect(201);
    expect((await cola('aux')).items.some((i) => i.tareaId === tareaId)).toBe(true);
    const aprobada = (await http().post(`/api/horas-extra/${propuesta.id}/aprobar`).set(como('admin')).expect(201)).body as HoraExtraItem;
    expect(aprobada.estado).toBe('aprobada');
    expect((await cola('aux')).items.some((i) => i.tareaId === tareaId)).toBe(false);
    expect((await cola('aux2')).items.some((i) => i.tareaId === tareaId)).toBe(true);
    expect(await prisma.notificacion.count({ where: { usuarioId: ids.aux2, tipo: 'extra.aprobada' } })).toBeGreaterThan(0);
    // Queda en el historial del trabajo
    const t = (await http().get(`/api/trabajos/${trabajo.id}`).set(como('prod')).expect(200)).body as TrabajoDetalle;
    expect(t.eventos.some((e) => e.detalle.includes('pasó de') && e.detalle.includes('horas extra'))).toBe(true);
  });

  it('un bono rechazado deja la tarea con su dueño; se puede proponer a otra persona', async () => {
    // Ahora la tarea está con aux2: se evalúa de nuevo
    const a = await apoyo();
    expect(a.responsable.id).toBe(ids.aux2);
    const bono = (await http().post(`/api/produccion/tareas/${tareaId}/apoyo`).set(como('prod')).send({ usuarioId: ids.aux3, modalidad: 'bono', monto: 80 }).expect(201)).body as HoraExtraItem;
    expect(bono).toMatchObject({ modalidad: 'bono', monto: 80 });
    await http().post(`/api/horas-extra/${bono.id}/responder`).set(como('aux3')).send({ acepta: false, motivo: 'No tengo disponibilidad' }).expect(201);
    expect((await cola('aux2')).items.some((i) => i.tareaId === tareaId)).toBe(true);
    expect((await cola('aux3')).items.some((i) => i.tareaId === tareaId)).toBe(false);
    // Rechazada: ya no bloquea otra propuesta; esta vez se acepta y se aprueba
    const otro = (await http().post(`/api/produccion/tareas/${tareaId}/apoyo`).set(como('prod')).send({ usuarioId: ids.aux3, modalidad: 'bono', monto: 100 }).expect(201)).body as HoraExtraItem;
    await http().post(`/api/horas-extra/${otro.id}/responder`).set(como('aux3')).send({ acepta: true }).expect(201);
    await http().post(`/api/horas-extra/${otro.id}/aprobar`).set(como('admin')).expect(201);
    expect((await cola('aux3')).items.some((i) => i.tareaId === tareaId)).toBe(true);
    expect((await cola('aux2')).items.some((i) => i.tareaId === tareaId)).toBe(false);
  });

  it('en horario normal: pasarla de inmediato, con motivo; solo a quien puede hacerla', async () => {
    await http().post(`/api/produccion/tareas/${tareaId}/reasignar`).set(como('aux')).send({ usuarioId: ids.aux }).expect(403);
    await http().post(`/api/produccion/tareas/${tareaId}/reasignar`).set(como('prod')).send({ usuarioId: ids.ana, motivo: 'x' }).expect(400); // rol no permitido
    await http().post(`/api/produccion/tareas/${tareaId}/reasignar`).set(como('prod')).send({ usuarioId: ids.aux3 }).expect(400); // ya la tiene
    await http().post(`/api/produccion/tareas/${tareaId}/reasignar`).set(como('prod')).send({ usuarioId: ids.aux, motivo: 'Vuelve de su descanso médico' }).expect(204);
    expect((await cola('aux')).items.some((i) => i.tareaId === tareaId)).toBe(true);
    expect((await cola('aux3')).items.some((i) => i.tareaId === tareaId)).toBe(false);
    expect(await prisma.notificacion.count({ where: { usuarioId: ids.aux, tipo: 'tarea.reasignada' } })).toBe(1);
  });

  it('si la tarea se completó antes de aprobar, no se aprueba y se avisa', async () => {
    const o = (await apoyo()).candidatos.find((c) => c.usuario.id === ids.aux2)!.horasExtra!;
    const propuesta = (await http().post(`/api/produccion/tareas/${tareaId}/apoyo`).set(como('prod')).send({ usuarioId: ids.aux2, modalidad: 'horas_extra', fecha: o.fecha, horaInicio: o.horaInicio, horaFin: o.horaFin }).expect(201)).body as HoraExtraItem;
    await http().post(`/api/horas-extra/${propuesta.id}/responder`).set(como('aux2')).send({ acepta: true }).expect(201);
    await http().post(`/api/tareas/${tareaId}/completar`).set(como('aux')).send({ resultado: 'Hecho por su dueño' }).expect(201);
    const r = await http().post(`/api/horas-extra/${propuesta.id}/aprobar`).set(como('admin')).expect(409);
    expect(r.body.message).toContain('ya no está pendiente');
    expect((await prisma.horaExtraBono.findUniqueOrThrow({ where: { id: propuesta.id } })).estado).toBe('aceptada');
  });
});
