/**
 * Pruebas e2e de pasar a otro auxiliar solo una tarea, un entregable (bloque) o todo el trabajo (base produccion_test).
 */
import {
  diaEnLima,
  sumarDias,
  type CargaPersona,
  type CatalogosProspecto,
  type ColaPersona,
  type ImpactoCarga,
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

type Quien = 'ana' | 'prod' | 'jefe' | 'aux1' | 'aux2' | 'aux3';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', prod: 'ASIST_PROD', jefe: 'JEFE_PROD', aux1: 'AUXILIAR', aux2: 'AUXILIAR', aux3: 'AUXILIAR' };

describe('Pasar una tarea, un bloque o todo el trabajo a otro auxiliar (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let trabajo: TrabajoDetalle;
  let tareas: { id: string; entregableId: string }[] = [];

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const colaDe = async (q: Quien) => (await http().get('/api/produccion/colas/mia').set(como(q)).expect(200)).body as ColaPersona;
  const carga = async (consulta = '') => (await http().get(`/api/produccion/carga/${ids.aux1}${consulta}`).set(como('prod')).expect(200)).body as CargaPersona;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    // Restos de una corrida anterior interrumpida
    const viejos = (await prisma.usuario.findMany({ where: { email: { startsWith: 'e2e.ctt.' } }, select: { id: true } })).map((u) => u.id);
    if (viejos.length) {
      await prisma.trabajo.deleteMany({ where: { OR: [{ creadoPor: { in: viejos } }, { prospecto: { responsableId: { in: viejos } } }] } });
      await prisma.prospecto.deleteMany({ where: { responsableId: { in: viejos } } });
      await prisma.usuario.deleteMany({ where: { id: { in: viejos } } });
    }
    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.ctt.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      ids[q] = (await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'PorTarea', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } } })).id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // Una tesis con su plan completo en la cola de aux1
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body as CatalogosProspecto;
    const p = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Tesis')!.id,
          prioridadId: catalogos.prioridades[0].id,
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
          integrantes: [{ personaId: p.contactos[0].id, nombres: 'Cliente', apellidos: 'PorTarea', email: `ct.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `6${sufijo}1`, esTitular: true }],
          trabajo: { ...(await datosAcademicos(prisma)), fechaInicio: hoy, fechaLimite: sumarDias(hoy, 120) },
          contrato: { fechaFirma: hoy, montoTotal: 1000, formaPago: 'contado', cuotas: [{ monto: 1000, vencimiento: hoy }] },
        })
        .expect(201)
    ).body;
    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux1, auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);
    await http().post(`/api/trabajos/${trabajo.id}/plan`).set(como('prod')).expect(201);
    tareas = (await prisma.tarea.findMany({ where: { trabajoId: trabajo.id, estado: 'pendiente' }, select: { id: true, entregableId: true }, orderBy: { creadoEn: 'asc' } })).filter((t): t is { id: string; entregableId: string } => Boolean(t.entregableId));
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.notificacion.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('con un trabajo pedido solo trae ese trabajo, con sus tareas una por una y la recomendación de la que se tocó', async () => {
    expect(tareas.length).toBeGreaterThan(3);
    const foco = tareas[0];
    const c = await carga(`?trabajoId=${trabajo.id}&tareaId=${foco.id}`);
    expect(c.trabajos).toHaveLength(1);
    const t = c.trabajos[0];
    expect(t.trabajo.id).toBe(trabajo.id);
    expect(t.tareas).toHaveLength(tareas.length);
    const suya = t.tareas.find((x) => x.tareaId === foco.id)!;
    expect(suya.sugerido).not.toBeNull();
    expect(suya.elegibles.map((u) => u.id)).toEqual(expect.arrayContaining([ids.aux2, ids.aux3]));
    expect(suya.elegibles.map((u) => u.id)).not.toContain(ids.aux1);
    expect(suya.elegibles.map((u) => u.id)).not.toContain(ids.jefe); // el jefe revisa lo que se elabora
    // Solo la tocada trae recomendación
    expect(t.tareas.filter((x) => x.sugerido !== null)).toHaveLength(1);
    // Sin pedir un trabajo, no se listan las tareas sueltas
    expect((await carga()).trabajos[0].tareas).toEqual([]);
  });

  it('pasa solo esa tarea: las demás se quedan con su responsable y lo avanzado no se pierde', async () => {
    const foco = tareas[1];
    const reparto = [{ trabajoId: trabajo.id, entregableId: foco.entregableId, tareaId: foco.id, usuarioId: ids.aux2 }];
    const sim = (await http().post(`/api/produccion/carga/${ids.aux1}/simular`).set(como('prod')).send({ reparto }).expect(201)).body as ImpactoCarga;
    expect(sim.personas).toHaveLength(1);
    expect(sim.personas[0].tareas.map((x) => x.tareaId)).toEqual([foco.id]);
    expect(sim.quedan).toBe(0);
    await http().post(`/api/produccion/carga/${ids.aux1}/aplicar`).set(como('prod')).send({ reparto, motivo: 'Solo esa tarea' }).expect(201);
    expect((await colaDe('aux2')).items.map((i) => i.tareaId)).toEqual([foco.id]);
    const aux1 = (await colaDe('aux1')).items.map((i) => i.tareaId);
    expect(aux1).not.toContain(foco.id);
    expect(aux1).toHaveLength(tareas.length - 1);
  });

  it('pasa todo un bloque (el entregable) o todo el trabajo, sin repetir lo que ya se pasó', async () => {
    const restantes = tareas.filter((t) => t.id !== tareas[1].id);
    const entregable = restantes[0].entregableId;
    const delBloque = restantes.filter((t) => t.entregableId === entregable);
    // El bloque entero a aux3
    await http().post(`/api/produccion/carga/${ids.aux1}/aplicar`).set(como('prod')).send({ reparto: [{ trabajoId: trabajo.id, entregableId: entregable, usuarioId: ids.aux3 }] }).expect(201);
    expect((await colaDe('aux3')).items.map((i) => i.tareaId).sort()).toEqual(delBloque.map((t) => t.id).sort());
    // Todo lo que le queda a aux1 (los demás entregables) a aux2, que ya tenía una tarea
    const c = await carga();
    const bloques = c.trabajos[0].bloques;
    expect(bloques.every((b) => b.entregableId !== entregable)).toBe(true);
    await http()
      .post(`/api/produccion/carga/${ids.aux1}/aplicar`)
      .set(como('prod'))
      .send({ reparto: bloques.map((b) => ({ trabajoId: trabajo.id, entregableId: b.entregableId, usuarioId: ids.aux2 })) })
      .expect(201);
    expect((await colaDe('aux1')).items).toHaveLength(0);
    expect((await colaDe('aux2')).items).toHaveLength(tareas.length - delBloque.length);
  });

  it('rechaza lo que se repite (una tarea sola y su entregable) y lo que ya no está en la cola', async () => {
    const foco = tareas[2];
    // aux2 y aux3 tienen ahora todo; usamos a aux3 como origen para ver el rechazo
    const entregable = (await prisma.tarea.findUniqueOrThrow({ where: { id: foco.id }, select: { entregableId: true } })).entregableId!;
    const dueno = (await prisma.tareaResponsable.findFirstOrThrow({ where: { tareaId: foco.id }, select: { usuarioId: true } })).usuarioId;
    const doble = [
      { trabajoId: trabajo.id, entregableId: entregable, usuarioId: ids.aux1 },
      { trabajoId: trabajo.id, entregableId: entregable, tareaId: foco.id, usuarioId: ids.aux1 },
    ];
    const r = await http().post(`/api/produccion/carga/${dueno}/simular`).set(como('prod')).send({ reparto: doble }).expect(400);
    expect(JSON.stringify(r.body)).toContain('dos veces');
    // Una tarea que ya no es de esa persona
    await http().post(`/api/produccion/carga/${ids.aux1}/simular`).set(como('prod')).send({ reparto: [{ trabajoId: trabajo.id, entregableId: entregable, tareaId: foco.id, usuarioId: ids.aux3 }] }).expect(400);
  });
});
