/**
 * Pruebas e2e del catálogo de actividades (base produccion_test).
 */
import type { ActividadAdmin, CatalogoActividades } from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const sufijo = Date.now().toString().slice(-6);
const PASSWORD = 'Prueba-e2e-123';

describe('Catálogo de actividades (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let catalogo: CatalogoActividades;
  let creada: ActividadAdmin;

  const http = () => request(app.getHttpServer());
  const como = (q: string) => ({ Authorization: `Bearer ${tokens[q]}` });
  const rol = (codigo: string) => catalogo.roles.find((r) => r.codigo === codigo)!.id;
  const principal = () => catalogo.prioridades.find((p) => p.nivel === 1)!.id;
  const secundaria = () => catalogo.prioridades.find((p) => p.nivel === 2)!.id;

  const cuerpo = (extra: Record<string, unknown> = {}) => ({
    nombre: `E2E Actividad ${sufijo}`,
    tipoActividadId: catalogo.tipos[0].id,
    minutosEstimados: 45,
    aplicaA: 'prospecto',
    modoAsignacion: 'directa',
    requiereHoraFija: false,
    esSeguimiento: false,
    participaciones: [{ nombre: 'Responsable', cantidad: 1, obligatoria: true, roles: [{ rolId: rol('AUXILIAR'), prioridadRolId: principal() }] }],
    ...extra,
  });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const [q, codigo] of [['admin', 'ADMIN'], ['prod', 'ASIST_PROD']] as const) {
      const email = `e2e.act.${q}.${sufijo}@grupoes.local`;
      const r = await prisma.rol.findUniqueOrThrow({ where: { codigo } });
      ids[q] = (await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'Actividades', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: r.id } } } })).id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    catalogo = (await http().get('/api/catalogos/actividades').set(como('admin')).expect(200)).body;
  });

  afterAll(async () => {
    await prisma.actividad.deleteMany({ where: { nombre: { startsWith: `E2E Actividad ${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await app.close();
  });

  it('lista las actividades con sus roles y prioridades; quien no administra el catálogo no entra', async () => {
    await http().get('/api/catalogos/actividades').set(como('prod')).expect(403);
    expect(catalogo.actividades.length).toBeGreaterThan(0);
    expect(catalogo.prioridades[0].nivel).toBe(1);
    const revision = catalogo.actividades.find((a) => a.nombre === 'Revisión interna')!;
    expect(revision.deSistema).toBe(true);
    expect(revision.participaciones[0].roles.length).toBeGreaterThan(0);
  });

  it('crea una actividad con su tiempo, roles y prioridades', async () => {
    await http().post('/api/catalogos/actividades').set(como('prod')).send(cuerpo()).expect(403);
    await http().post('/api/catalogos/actividades').set(como('admin')).send(cuerpo({ minutosEstimados: 1 })).expect(400);
    creada = (await http().post('/api/catalogos/actividades').set(como('admin')).send(cuerpo({
      participaciones: [{ nombre: 'Responsable', cantidad: 1, obligatoria: true, roles: [{ rolId: rol('AUXILIAR'), prioridadRolId: principal() }, { rolId: rol('JEFE_PROD'), prioridadRolId: secundaria() }] }],
    })).expect(201)).body;
    expect(creada).toMatchObject({ minutosEstimados: 45, activa: true, deSistema: false });
    expect(creada.participaciones[0].roles.map((r) => [r.rol, r.prioridad.nivel])).toEqual([['Auxiliar de producción', 1], ['Jefe de producción', 2]]);
    // Se ofrece al programar tareas.
    const ofrecidas = (await http().get('/api/actividades?aplicaA=prospecto').set(como('prod')).expect(200)).body as { id: string }[];
    expect(ofrecidas.map((a) => a.id)).toContain(creada.id);
  });

  it('valida el nombre repetido, el rol principal y el coordinador', async () => {
    await http().post('/api/catalogos/actividades').set(como('admin')).send(cuerpo()).expect(400);
    const sinPrincipal = cuerpo({ nombre: `E2E Actividad ${sufijo} b`, participaciones: [{ nombre: 'Responsable', cantidad: 1, obligatoria: true, roles: [{ rolId: rol('AUXILIAR'), prioridadRolId: secundaria() }] }] });
    await http().post('/api/catalogos/actividades').set(como('admin')).send(sinPrincipal).expect(400);
    await http().post('/api/catalogos/actividades').set(como('admin')).send(cuerpo({ nombre: `E2E Actividad ${sufijo} c`, modoAsignacion: 'coordinada' })).expect(400);
  });

  it('edita el tiempo y las participaciones conservando las existentes', async () => {
    const p = creada.participaciones[0];
    const editada = (await http().put(`/api/catalogos/actividades/${creada.id}`).set(como('admin')).send(cuerpo({
      minutosEstimados: 90,
      modoAsignacion: 'coordinada',
      rolCoordinadorId: rol('ASIST_PROD'),
      participaciones: [
        { id: p.id, nombre: 'Responsable', cantidad: 2, obligatoria: true, roles: [{ rolId: rol('JEFE_PROD'), prioridadRolId: principal() }] },
        { nombre: 'Apoyo', cantidad: 1, obligatoria: false, roles: [{ rolId: rol('AUXILIAR'), prioridadRolId: principal() }] },
      ],
    })).expect(200)).body as ActividadAdmin;
    expect(editada).toMatchObject({ minutosEstimados: 90, modoAsignacion: 'coordinada', rolCoordinadorId: rol('ASIST_PROD') });
    expect(editada.participaciones.map((x) => x.nombre)).toEqual(['Responsable', 'Apoyo']);
    expect(editada.participaciones[0]).toMatchObject({ id: p.id, cantidad: 2 });
    expect(editada.participaciones[0].roles.map((r) => r.rol)).toEqual(['Jefe de producción']);
    creada = editada;
  });

  it('desactivar la saca de las actividades programables; las del sistema no se renombran ni desactivan', async () => {
    await http().post(`/api/catalogos/actividades/${creada.id}/desactivar`).set(como('prod')).expect(403);
    const off = (await http().post(`/api/catalogos/actividades/${creada.id}/desactivar`).set(como('admin')).expect(201)).body as ActividadAdmin;
    expect(off.activa).toBe(false);
    const ofrecidas = (await http().get('/api/actividades?aplicaA=prospecto').set(como('prod')).expect(200)).body as { id: string }[];
    expect(ofrecidas.map((a) => a.id)).not.toContain(creada.id);
    await http().post(`/api/catalogos/actividades/${creada.id}/activar`).set(como('admin')).expect(201);

    const revision = catalogo.actividades.find((a) => a.nombre === 'Revisión interna')!;
    await http().post(`/api/catalogos/actividades/${revision.id}/desactivar`).set(como('admin')).expect(409);
    await http().put(`/api/catalogos/actividades/${revision.id}`).set(como('admin')).send(cuerpo({ nombre: 'Otro nombre' })).expect(400);
  });
});
